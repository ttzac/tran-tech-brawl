import Phaser from 'phaser';
import { fitUi } from '../ui/hires';
import { heroes } from '../data/heroes';
import { bosses } from '../data/bosses';
import { textureKey } from '../data/art';
import { getLoadout } from '../systems/Loadout';
import { Sfx } from '../systems/Sfx';
import { net, startHosting, joinGame, leaveNet, transportKind } from '../net/session';
import { NetHost, MAX_HUMANS } from '../net/NetHost';
import { NetClient } from '../net/NetClient';
import { isCode } from '../net/link';
import type { LobbyPlayer } from '../net/protocol';
import type { FightData } from './FightScene';

const FONT = 'Consolas, "Courier New", monospace';
const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;
const ROW = { x: 480, top: 168, dy: 50, w: 600, h: 44 };

export interface LobbyData {
  /** host: open a room · join: type a code (or use `code`) · resume: back from a match, session already open */
  mode: 'host' | 'join' | 'resume' | 'rejoin';
  heroId?: string;
  code?: string;
  /** rejoin: the seat token from the dropped connection */
  token?: string;
}

interface Row {
  box: Phaser.GameObjects.Rectangle;
  pic: Phaser.GameObjects.Image;
  name: Phaser.GameObjects.Text;
  hero: Phaser.GameObjects.Text;
  state: Phaser.GameObjects.Text;
}

/** How long a dropped player keeps trying to get back in. */
const REJOIN_TRY_MS = 20000;

/** Online lobby: host opens a room and gets a 4-letter code; friends type it in. Everyone picks a hero
 *  (← →), guests ready up (Space), the host picks the mode (Tab) and boss (↑ ↓) and starts (Enter). Esc leaves.
 *  Also the "reconnecting" screen when a player's connection drops mid-game. */
export class LobbyScene extends Phaser.Scene {
  private data0!: LobbyData;
  private hero = 0;
  private typed = '';
  private phase: 'code' | 'connecting' | 'lobby' | 'error' = 'connecting';
  private title!: Phaser.GameObjects.Text;
  private codeTxt!: Phaser.GameObjects.Text;
  private sub!: Phaser.GameObjects.Text;
  private status!: Phaser.GameObjects.Text;
  private bossTxt!: Phaser.GameObjects.Text;
  private modeNote!: Phaser.GameObjects.Text;
  private action!: Phaser.GameObjects.Text;
  private help!: Phaser.GameObjects.Text;
  private rows: Row[] = [];
  private refreshIn = 0;

  constructor() {
    super('Lobby');
  }

  init(data: LobbyData): void {
    this.data0 = data ?? { mode: 'join' };
    let id = data?.heroId;
    if (data?.mode === 'resume' && net) {
      const me = net instanceof NetHost ? 0 : net.slot;
      id = net.players.find((p) => p.slot === me)?.hero ?? id; // keep the hero you had
    }
    this.hero = Math.max(0, heroes.findIndex((h) => h.id === id));
    this.typed = '';
    this.rows = [];
  }

  create(): void {
    fitUi(this);
    this.cameras.main.setBackgroundColor(0x0b0f1a);
    Sfx.attach(this);
    this.title = this.add.text(480, 34, 'ONLINE', { fontFamily: FONT, fontSize: '30px', fontStyle: 'bold', color: '#60a5fa' }).setOrigin(0.5).setStroke('#1e3a8a', 6);
    this.codeTxt = this.add.text(480, 92, '', { fontFamily: FONT, fontSize: '44px', fontStyle: 'bold', color: '#facc15' }).setOrigin(0.5);
    this.sub = this.add.text(480, 130, '', { fontFamily: FONT, fontSize: '13px', color: '#94a3b8' }).setOrigin(0.5);
    for (let i = 0; i < MAX_HUMANS; i++) this.rows.push(this.makeRow(i));
    this.bossTxt = this.add.text(480, 422, '', { fontFamily: FONT, fontSize: '18px', color: '#f87171' }).setOrigin(0.5);
    this.modeNote = this.add.text(480, 442, '', { fontFamily: FONT, fontSize: '11px', color: '#64748b' }).setOrigin(0.5);
    this.action = this.add.text(480, 466, '', { fontFamily: FONT, fontSize: '24px', fontStyle: 'bold', color: '#facc15' }).setOrigin(0.5);
    this.status = this.add.text(480, 498, '', { fontFamily: FONT, fontSize: '14px', color: '#cbd5e1' }).setOrigin(0.5);
    this.help = this.add.text(480, 524, '', { fontFamily: FONT, fontSize: '12px', color: '#64748b' }).setOrigin(0.5);
    this.tweens.add({ targets: this.action, alpha: 0.5, yoyo: true, repeat: -1, duration: 700 });

    const kb = this.input.keyboard!;
    kb.on('keydown', (e: KeyboardEvent) => this.onKey(e));

    const d = this.data0;
    if (d.mode === 'resume' && net) this.enterLobby();
    else if (d.mode === 'rejoin' && d.code) void this.rejoin(d.code, d.token ?? '');
    else if (d.mode === 'host') void this.host();
    else if (d.code && isCode(d.code.toUpperCase())) void this.join(d.code.toUpperCase());
    else this.showCodeEntry();
  }

  update(_t: number, delta: number): void {
    this.refreshIn -= delta;
    if (this.phase === 'lobby' && this.refreshIn <= 0) {
      this.refreshIn = 150;
      this.render();
    }
  }

  // ---- connecting ---------------------------------------------------------------------------------

  private async host(): Promise<void> {
    this.phase = 'connecting';
    this.setStatus('Opening a room...');
    try {
      await startHosting(heroes[this.hero].id, getLoadout(heroes[this.hero].id));
      if (this.sys.isActive()) this.enterLobby();
    } catch (err) {
      this.fail(err);
    }
  }

  private async join(code: string): Promise<void> {
    this.phase = 'connecting';
    this.codeTxt.setText(code);
    this.setStatus(`Connecting to ${code}...`);
    try {
      const c = await joinGame(code);
      if (!this.sys.isActive()) return;
      c.pick(heroes[this.hero].id, getLoadout(heroes[this.hero].id));
      this.enterLobby();
    } catch (err) {
      this.fail(err);
    }
  }

  /** The connection to the host dropped: keep knocking for a while. The host holds our seat (the AI plays our fighter). */
  private async rejoin(code: string, token: string): Promise<void> {
    this.phase = 'connecting';
    this.title.setText('CONNECTION LOST');
    this.codeTxt.setText(code);
    this.rows.forEach((r) => this.showRow(r, false));
    this.help.setText('Esc = give up');
    const until = Date.now() + REJOIN_TRY_MS;
    // (no isActive() check before the first await: the scene is still being created at this point)
    for (let n = 1; ; n++) {
      this.setStatus(`Reconnecting... (try ${n})`, '#facc15');
      try {
        await joinGame(code, token);
        if (this.sys.isActive()) this.enterLobby(); // (if the match is still on, the host sends us straight back into it)
        else if (!net?.inMatch) leaveNet(); // the player gave up (Esc) while we were knocking
        return;
      } catch {
        if (!this.sys.isActive()) return;
        if (Date.now() > until) return this.fail(new Error('Lost connection to the host'));
        await new Promise((done) => setTimeout(done, 1500));
        if (!this.sys.isActive()) return;
      }
    }
  }

  private fail(err: unknown): void {
    if (!this.sys.isActive()) return;
    this.phase = 'error';
    Sfx.play('lose');
    this.setStatus(err instanceof Error ? err.message : String(err), '#f87171');
    this.action.setText('');
    this.help.setText('Enter = try again   ·   Esc = back to menu');
  }

  private showCodeEntry(): void {
    this.phase = 'code';
    this.title.setText('JOIN A GAME');
    this.sub.setText('Type the 4-letter room code from the host');
    this.rows.forEach((r) => this.showRow(r, false));
    this.renderCode();
    this.action.setText('');
    this.setStatus('');
    this.help.setText('A-Z type   ·   Backspace delete   ·   Enter join   ·   Esc back');
  }

  private renderCode(): void {
    this.codeTxt.setText((this.typed + '____').slice(0, 4).split('').join(' '));
  }

  private enterLobby(): void {
    this.phase = 'lobby';
    this.title.setText(net instanceof NetHost ? 'YOUR ONLINE GAME' : 'ONLINE GAME');
    this.setStatus('');
    this.render();
  }

  // ---- lobby ----------------------------------------------------------------------------------------

  private render(): void {
    const n = net;
    if (!n) return;
    const players: LobbyPlayer[] = n instanceof NetHost ? n.players : n.players;
    const me = n instanceof NetHost ? 0 : n.slot;
    this.codeTxt.setText(`ROOM  ${n.code}`);
    this.sub.setText(transportKind() === 'local' ? 'Same-PC test mode (other tabs join with this code)' : 'Friends: Menu → J → type this code   ·   up to 5 players, AI fills the rest');

    const sorted = [...players].sort((a, b) => a.slot - b.slot);
    this.rows.forEach((r, i) => {
      const p = sorted[i];
      this.showRow(r, true);
      if (!p) {
        r.box.setStrokeStyle(2, 0x1e293b).setFillStyle(0x0e1424);
        r.pic.setVisible(false);
        r.name.setText('— AI ally —').setColor('#475569');
        r.hero.setText('');
        r.state.setText('');
        return;
      }
      const h = heroes.find((x) => x.id === p.hero) ?? heroes[0];
      const mine = p.slot === me;
      r.box.setStrokeStyle(mine ? 3 : 2, mine ? h.color : 0x334155).setFillStyle(mine ? 0x1e2a44 : 0x131a2b);
      const key = this.textures.exists(`portrait_${h.id}`) ? `portrait_${h.id}` : textureKey(h.id);
      r.pic.setTexture(key).setVisible(true);
      r.pic.setScale(36 / r.pic.height);
      r.name.setText(`${p.name}${p.slot === 0 ? '  (host)' : ''}${mine ? '  ← you' : ''}`).setColor(mine ? '#ffffff' : '#cbd5e1');
      r.hero.setText(h.name).setColor(hex(h.color));
      const ping = p.slot === 0 ? '' : `${p.ping} ms  `;
      r.state.setText(`${ping}${p.slot === 0 ? 'HOST' : p.ready ? 'READY' : 'not ready'}`).setColor(p.slot === 0 || p.ready ? '#4ade80' : '#f59e0b');
    });

    const boss = bosses[n.bossIndex] ?? bosses[0];
    const isHost = n instanceof NetHost;
    if (n.mode === 'brawl') this.bossTxt.setText(`TEAM BRAWL · random map, power-up crates${isHost ? '   (Tab: mode)' : ''}`).setColor('#ffa31a');
    else this.bossTxt.setText(`BOSS CO-OP vs ${boss.name}${isHost ? '   (↑ ↓ boss · Tab mode)' : ''}`).setColor('#f87171');
    this.modeNote.setText('Online modes: Boss co-op and Team Brawl. Dungeon Crawl is solo only (Menu → DUNGEON).');
    if (n instanceof NetHost) {
      const waiting = players.filter((p) => !p.ready).length;
      this.action.setText(n.canStart ? '[ ENTER ] START' : `waiting for ${waiting} player${waiting === 1 ? '' : 's'} to ready up`);
      this.help.setText('← → your hero   ·   Tab mode   ·   ↑ ↓ boss   ·   Enter start   ·   Esc close the game');
    } else {
      this.action.setText(n.isReady ? 'READY  (Space to cancel)' : '[ SPACE ] READY');
      this.help.setText('← → your hero   ·   Space ready   ·   Esc leave');
    }
    this.status.setText(n.notice).setColor('#94a3b8');
  }

  private makeRow(i: number): Row {
    const y = ROW.top + i * ROW.dy;
    const left = ROW.x - ROW.w / 2;
    const box = this.add.rectangle(ROW.x, y, ROW.w, ROW.h, 0x131a2b).setStrokeStyle(2, 0x334155);
    const pic = this.add.image(left + 30, y, 'proj').setVisible(false);
    const name = this.add.text(left + 60, y, '', { fontFamily: FONT, fontSize: '16px', color: '#cbd5e1' }).setOrigin(0, 0.5);
    const hero = this.add.text(left + 330, y, '', { fontFamily: FONT, fontSize: '16px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0, 0.5);
    const state = this.add.text(left + ROW.w - 14, y, '', { fontFamily: FONT, fontSize: '14px', color: '#94a3b8' }).setOrigin(1, 0.5);
    return { box, pic, name, hero, state };
  }

  private showRow(r: Row, on: boolean): void {
    for (const o of [r.box, r.name, r.hero, r.state]) o.setVisible(on);
    if (!on) r.pic.setVisible(false);
  }

  private setStatus(s: string, color = '#cbd5e1'): void {
    this.status.setText(s).setColor(color);
  }

  // ---- input ----------------------------------------------------------------------------------------

  private onKey(e: KeyboardEvent): void {
    const k = e.key;
    if (k === 'Escape') return this.back();

    if (this.phase === 'code') {
      if (/^[a-zA-Z]$/.test(k) && isCode(k.toUpperCase().repeat(4)) && this.typed.length < 4) {
        this.typed += k.toUpperCase();
        Sfx.play('move');
        this.renderCode();
      } else if (k === 'Backspace') {
        this.typed = this.typed.slice(0, -1);
        this.renderCode();
      } else if (k === 'Enter' && isCode(this.typed)) {
        Sfx.play('select');
        void this.join(this.typed);
      }
      return;
    }

    if (this.phase === 'error') {
      if (k === 'Enter') {
        if (this.data0.mode === 'host') void this.host();
        else if (this.data0.mode === 'rejoin') this.scene.start('Menu', { notice: 'Lost connection to the host' });
        else this.showCodeEntry();
      }
      return;
    }

    if (this.phase !== 'lobby' || !net) return;
    const n = net;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') this.pickHero(this.hero - 1);
    else if (k === 'ArrowRight' || k === 'd' || k === 'D') this.pickHero(this.hero + 1);
    else if (n instanceof NetHost && k === 'Tab') {
      n.setMode(n.mode === 'boss' ? 'brawl' : 'boss');
      Sfx.play('move');
      this.render();
    } else if (n instanceof NetHost && n.mode === 'boss' && (k === 'ArrowUp' || k === 'ArrowDown')) {
      n.setBoss(n.bossIndex + (k === 'ArrowUp' ? -1 : 1));
      Sfx.play('move');
      this.render();
    } else if (n instanceof NetHost && k === 'Enter' && n.canStart) {
      Sfx.play('select');
      const { match } = n.start();
      this.scene.start('Fight', { net: 'host', match, humanIndex: 0 } satisfies FightData);
    } else if (n instanceof NetClient && (k === ' ' || k === 'Enter')) {
      Sfx.play('select');
      n.ready(!n.isReady);
    }
  }

  private pickHero(i: number): void {
    this.hero = Phaser.Math.Wrap(i, 0, heroes.length);
    const id = heroes[this.hero].id;
    Sfx.play('move');
    const n = net;
    if (n instanceof NetHost) n.setHero(id, getLoadout(id));
    else if (n instanceof NetClient) {
      if (n.isReady) n.ready(false); // changing hero un-readies you
      n.pick(id, getLoadout(id));
    }
    this.render();
  }

  private back(): void {
    Sfx.play('select');
    leaveNet();
    this.scene.start('Menu', { heroId: heroes[this.hero].id });
  }
}
