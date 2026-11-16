import Phaser from 'phaser';
import { RES } from '../ui/hires';
import { heroes } from '../data/heroes';
import { bosses } from '../data/bosses';
import { stages } from '../data/stages';
import { generateStage } from '../data/procgen';
import { POWERS } from '../data/powerups';
import { ROOM_KINDS, type RunState } from '../data/dungeon';
import { buildRoom, choices, enterNode, finishRoom, newRun, roomConfig, runHero, type RoomSpec } from '../sim/crawl';
import type { BossDef, FighterDef, GameMode, StageDef } from '../data/types';
import { emptyIntent, type Fighter } from '../entities/Fighter';
import type { HUDData } from './HUDScene';
import { applyLoadout } from '../data/items';
import { allyLoadout, getLoadout } from '../systems/Loadout';
import { World } from '../sim/World';
import { TICK_MS } from '../sim/kinematics';
import { Rng, randomSeed } from '../sim/rng';
import type { SimEvent } from '../sim/events';
import { FighterView } from '../view/FighterView';
import { ART, artScale, FEET_ORIGIN_Y, STAGE_SURFACE } from '../data/art';
import { CombatView } from '../view/CombatView';
import { CrateView, Popups } from '../view/Juice';
import { PlayerInput } from '../input/PlayerInput';
import { fromNetMatch, type NetMatchConfig } from '../net/protocol';
import { net, leaveNet } from '../net/session';
import { NetHost } from '../net/NetHost';
import { NetClient } from '../net/NetClient';
import { bg } from '../net/background';

export interface FightData {
  heroId?: string;
  bossIndex?: number;
  seed?: number;
  /** 'boss' (default): co-op vs a boss. 'brawl': your team vs a rival team on a random map. 'dungeon': one room of a crawl. */
  mode?: GameMode;
  /** dungeon: the run so far (omit to start a new run) */
  dungeon?: RunState;
  /** online: this tab hosts the match or mirrors the host's */
  net?: 'host' | 'client';
  match?: NetMatchConfig;
  /** client: which of match.humans is this player */
  humanIndex?: number;
}

/** 1 player + 4 AI allies vs. boss + up to 4 minions = 10 fighters on the map. */
const ALLY_COUNT = 4;
const ZOOM = 1.2; // was 0.7; bigger characters (0.95 was still small)
/** Most sim ticks run in one render frame; after a long stall (tab switch) the backlog is dropped instead of fast-forwarded. */
const MAX_TICKS_PER_FRAME = 5;

const STREAK_LINES: Record<number, string> = { 2: 'DOUBLE KO!', 3: 'TRIPLE KO!', 4: 'QUAD KO!', 5: '99.9% UPTIME!', 6: 'FIVE NINES!' };
const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;

/** Draws and drives a World: reads local input, advances the sim in fixed 60 Hz ticks,
 *  plays the sim's events (sound, effects, camera) and interpolates sprites between ticks.
 *  Online: the host runs the World as usual plus remote players' inputs (NetHost); a client never steps its World,
 *  it sends inputs each tick and mirrors the host's snapshots (NetClient), drawn one snapshot interval behind. */
export class FightScene extends Phaser.Scene {
  private heroDef!: FighterDef;
  private bossDef!: BossDef;
  private stage!: StageDef;
  private bossIndex = 0;
  private seed = 0;
  private mode: 'solo' | 'host' | 'client' = 'solo';
  private gmode: GameMode = 'boss';
  private run: RunState | null = null;
  private room: RoomSpec | null = null;
  private roomName = '';
  private match: NetMatchConfig | null = null;
  private humanIndex = 0;
  private host: NetHost | null = null;
  private client: NetClient | null = null;
  private localIntent = emptyIntent();
  private netHud = false;

  private world!: World;
  private local!: Fighter;
  private input_!: PlayerInput;
  private views = new Map<Fighter, FighterView>();
  private combatView!: CombatView;
  private popups!: Popups;
  private crateView!: CrateView;
  private markers: { f: Fighter; v: FighterView; m: Phaser.GameObjects.Text }[] = [];
  private ring!: Phaser.GameObjects.Ellipse;
  private acc = 0;
  private ending = false;
  private spectating: Fighter | null = null;
  /** solo-only feel: freeze a few ms on big hits, slow-mo on the final blow */
  private hitStop = 0;
  private slowMs = 0;
  private escHandler = (): void => {
    if (this.mode !== 'solo') leaveNet(); // leaving an online match leaves the game (the host leaving ends it for everyone)
    this.scene.start('Menu');
  };

  constructor() {
    super('Fight');
  }

  init(data: FightData): void {
    this.mode = data.net && data.match ? data.net : 'solo';
    this.gmode = this.mode === 'solo' ? data.mode ?? 'boss' : 'boss';
    this.match = data.match ?? null;
    this.humanIndex = data.humanIndex ?? 0;
    this.host = this.mode === 'host' && net instanceof NetHost ? net : null;
    this.client = this.mode === 'client' && net instanceof NetClient ? net : null;
    this.run = null;
    this.room = null;
    this.roomName = '';
    if (this.match) {
      this.heroDef = this.match.humans[this.humanIndex] ?? this.match.humans[0];
      this.bossIndex = this.match.bossIndex;
      this.seed = this.match.seed;
      this.bossDef = bosses[this.bossIndex] ?? bosses[0];
      const cfg = fromNetMatch(this.match);
      this.stage = cfg.stage;
      this.gmode = cfg.mode ?? 'boss'; // online: boss co-op or team brawl
      return;
    }
    const base = heroes.find((h) => h.id === data.heroId) ?? heroes[0];
    this.bossIndex = data.bossIndex ?? 0;
    if (this.gmode === 'dungeon') {
      let run = data.dungeon ?? newRun(base.id, data.seed ?? randomSeed(), getLoadout(base.id));
      // started without the map screen (dev / tests): walk into the first fight on offer
      if (run.at < 0) run = enterNode(run, (choices(run).find((n) => ROOM_KINDS[n.kind].fight) ?? choices(run)[0]).id);
      this.run = run;
      const room = buildRoom(run);
      this.room = room;
      this.heroDef = runHero(run);
      this.bossDef = room.boss;
      this.stage = room.stage;
      this.roomName = room.title;
      this.seed = room.seed;
    } else {
      this.heroDef = applyLoadout(base, getLoadout(base.id)); // gear picked in the Character Manager
      this.seed = data.seed ?? randomSeed();
      this.bossDef = bosses[this.bossIndex] ?? bosses[0];
      this.stage = this.gmode === 'brawl' ? generateStage(this.seed) : stages[this.bossDef.stageId];
    }
  }

  create(): void {
    this.views.clear();
    this.markers.length = 0;
    this.spectating = null;
    this.ending = false;
    this.acc = 0;
    this.hitStop = 0;
    this.slowMs = 0;
    const st = this.stage;
    this.cameras.main.setBackgroundColor(st.bg);
    this.drawBackdrop();
    this.drawPlatforms();

    this.combatView = new CombatView(this);
    this.popups = new Popups(this);
    this.crateView = new CrateView(this);
    if (this.match) {
      this.world = new World(fromNetMatch(this.match)); // same config on host and clients = same fighters and ids
    } else if (this.gmode === 'brawl') {
      // your team (you + 3 AI) vs a rival crew of 4, picked from the roster by the match seed
      const rng = new Rng(this.seed);
      const pool = heroes.filter((h) => h.id !== this.heroDef.id);
      const pick = (): FighterDef => pool.splice(rng.int(0, pool.length - 1), 1)[0];
      const allies = [0, 1, 2].map((i) => {
        const h = pick();
        return applyLoadout(h, allyLoadout(h.id, i));
      });
      const rivals = [0, 1, 2, 3].map((i) => {
        const h = pick();
        return { ...applyLoadout(h, allyLoadout(h.id, i + 3)), stocks: 3 };
      });
      this.world = new World({ stage: st, boss: this.bossDef, humans: [this.heroDef], allies, rivals, seed: this.seed, mode: 'brawl' });
    } else if (this.gmode === 'dungeon' && this.run && this.room) {
      this.world = new World(roomConfig(this.run, this.room));
    } else {
      // AI allies fill out the hero team with themed gear so they feel varied
      const pool = heroes.filter((h) => h.id !== this.heroDef.id);
      const allies: FighterDef[] = [];
      for (let i = 0; i < ALLY_COUNT; i++) {
        const base = pool[i % pool.length];
        allies.push(applyLoadout(base, allyLoadout(base.id, i)));
      }
      this.world = new World({ stage: st, boss: this.bossDef, humans: [this.heroDef], allies, seed: this.seed });
    }
    this.local = this.world.humans[this.humanIndex] ?? this.world.humans[0];
    this.host?.beginMatch(this.world);
    this.client?.beginMatch(this.world, this.humanIndex);
    // online: "Bob dropped out: AI took over" and friends
    const say = (text: string): void => void this.events.emit('hud:banner', text.toUpperCase(), '#facc15');
    if (this.host) this.host.onNotice = say;
    if (this.client) this.client.onNotice = say;
    this.netHud = false;
    this.input_ = new PlayerInput(this);
    this.playEvents(); // creates the views for the starting fighters
    this.drawLedgeMarkers();

    // ground ring under the local player so they stay findable in a crowd
    this.ring = this.add.ellipse(0, 0, 54, 14).setStrokeStyle(2, 0xffffff, 0.75).setDepth(3);

    // camera: follow the player, zoomed out so the crowd fits
    const cam = this.cameras.main;
    cam.setBounds(0, 0, st.width, st.height);
    cam.setZoom(ZOOM * RES);
    cam.startFollow(this.views.get(this.local)!, true, 0.08, 0.08);

    // HUD lives in its own scene so the zoom doesn't touch it
    const w = this.world;
    const mode = this.gmode;
    const run = this.run;
    const hudData: HUDData = {
      online: this.mode !== 'solo',
      player: this.local,
      boss: w.boss,
      stats: () => {
        const s = { minions: w.count('enemy', true), wave: w.spawner.wave, allies: w.count('hero') - (this.local.alive ? 1 : 0) };
        if (this.netHud) return { ...s, info: this.netInfo() };
        if (mode === 'brawl') return { ...s, info: `BRAWL · your team ${w.count('hero')}  ·  rivals ${w.count('enemy')}  ·  P pause` };
        if (mode === 'dungeon' && run) return { ...s, info: `${this.roomName} · ${w.reserveLeft > 0 ? `HORDE: ${w.reserveLeft} more to KO` : `minions ${s.minions}`}  ·  relics ${run.relics.length}  ·  P pause` };
        return s;
      },
    };
    this.scene.stop('HUD');
    this.scene.launch('HUD', hudData);
    const room = this.room;
    if (mode === 'dungeon' && room)
      this.time.delayedCall(300, () => this.events.emit('hud:banner', `${room.title}${room.mod ? `  ${room.mod.icon} ${room.mod.name.toUpperCase()}` : ''}\n${room.reserve > 0 ? 'CLEAR THE HORDE' : room.name.toUpperCase()}`, '#2ee6d6'));
    if (mode === 'brawl') this.time.delayedCall(300, () => this.events.emit('hud:banner', 'BRAWL!', '#ffa31a'));
    const kb = this.input.keyboard!;
    kb.once('keydown-ESC', this.escHandler);
    const f3 = (): void => void (this.netHud = !this.netHud && this.mode !== 'solo');
    kb.on('keydown-F3', f3);
    this.events.once('shutdown', () => {
      kb.off('keydown-ESC', this.escHandler);
      kb.off('keydown-F3', f3);
      if (this.host) this.host.onNotice = null;
      if (this.client) this.client.onNotice = null;
      this.scene.stop('HUD');
      this.combatView.destroy();
      this.popups.destroy();
      this.crateView.destroy();
      this.views.clear();
      this.markers.length = 0;
      this.spectating = null;
    });
  }

  /** F3 online: connection numbers instead of the usual info line. */
  private netInfo(): string {
    const c = this.client;
    if (c) return `ping ${Math.round(c.rtt)} ms · others drawn ${Math.round(c.stats.delay)} ms back · ${c.stats.pending} inputs in flight · ${c.stats.corrections} corrections (last ${c.stats.lastError.toFixed(1)} px) · F3 hide`;
    const h = this.host;
    return h ? `host · ${h.players.filter((p) => p.slot !== 0).map((p) => `${p.name} ${p.ping} ms`).join(' · ') || 'no players connected'} · F3 hide` : '';
  }

  update(time: number, delta: number): void {
    // a hidden host tab is driven by the background ticker; ignore the browser's own (about 1 per second) frames there
    if (this.host && document.hidden && !bg.stepping) return;
    this.input_.poll();
    const solo = this.mode === 'solo';
    const slow = this.slowMs > 0 ? 0.3 : 1;
    if (this.slowMs > 0) this.slowMs -= delta;
    if (this.hitStop > 0) this.hitStop -= delta; // freeze frame: the sim simply waits
    else this.acc += Math.min(delta, 250) * (solo ? slow : 1);
    let n = 0;
    const client = this.client;
    while (this.acc >= TICK_MS && n < MAX_TICKS_PER_FRAME) {
      if (client) {
        // a client only sends its controls; the host's World decides what happens
        this.input_.consume(this.localIntent);
        client.sendInput(this.localIntent);
      } else {
        this.input_.consume(this.local.intent);
        this.host?.beforeTick();
        this.world.step(TICK_MS);
        this.host?.afterTick();
        this.playEvents();
      }
      this.acc -= TICK_MS;
      n++;
    }
    if (n === MAX_TICKS_PER_FRAME) this.acc = 0;

    let alpha = 0;
    if (client) {
      client.sync(); // snapshots in: our fighter corrected, everyone else placed at the drawn moment
      this.playEvents();
    }
    alpha = this.acc / TICK_MS;

    const vd = delta * (solo ? slow : 1);
    for (const v of this.views.values()) v.sync(alpha, vd);
    this.combatView.update(vd, client ? client.shots : this.world.combat.shots, alpha);
    this.crateView.update(this.world.crates, time);
    this.popups.update(vd);
    for (const { f, v, m } of this.markers) {
      m.setVisible(f.alive);
      if (f.alive) m.setPosition(v.x, v.y - v.displayHeight / 2 - 14);
    }
    const lv = this.views.get(this.local)!;
    this.ring.setVisible(this.local.alive).setPosition(lv.x, lv.y + this.local.foot);

    // spectate an ally if the player is out
    if (!this.local.alive && !this.world.result && (!this.spectating || !this.spectating.alive)) {
      this.spectating = this.world.fighters.find((f) => f.alive && f.team === 'hero') ?? null;
      if (this.spectating) this.cameras.main.startFollow(this.views.get(this.spectating)!, true, 0.08, 0.08);
    }
  }

  /** Turn the sim's events from the last tick into sprites, sound and effects. */
  private playEvents(): void {
    const ev = this.world.events;
    for (const e of ev) this.playEvent(e);
    ev.length = 0;
  }

  private playEvent(e: SimEvent): void {
    const fx = this.combatView;
    const solo = this.mode === 'solo';
    switch (e.k) {
      case 'spawn': {
        const v = new FighterView(this, e.f);
        v.onRespawn = (f) => this.combatView.respawn(f);
        this.views.set(e.f, v);
        if (e.f === this.world.boss && this.world.tick < 5) v.intro(); // the boss drops in when the fight starts
        if (e.f.team === 'enemy' && e.f !== this.world.boss && this.world.tick > 0) fx.puff(e.f.x, e.f.y); // reinforcements arrive mid-fight
        if (e.f.team === 'hero') {
          // you = white, other online players = yellow, AI allies = cyan
          const color = e.f === this.local ? '#ffffff' : this.world.humans.includes(e.f) ? '#facc15' : '#67e8f9';
          this.markers.push({ f: e.f, v, m: this.add.text(0, 0, '▼', { fontSize: '24px', color }).setOrigin(0.5).setDepth(15) });
        }
        break;
      }
      case 'despawn': {
        const i = this.markers.findIndex((m) => m.f === e.f);
        if (i >= 0) {
          this.markers[i].m.destroy();
          this.markers.splice(i, 1);
        }
        this.views.get(e.f)?.destroy();
        this.views.delete(e.f);
        break;
      }
      case 'swing':
        fx.swing(e.f, e.range, e.dir);
        this.events.emit('sfx:swing');
        break;
      case 'ultimate':
        if (e.phase === 'start') {
          this.popups.text(e.f.x, e.f.y - e.f.body.height * 0.9, `${e.f.def.name.toUpperCase()} ULTIMATE!`, hex(e.f.def.color), 22, 1100, -40, 0.9);
          fx.ultimateStart(e.f);
          this.events.emit('sfx:special');
        } else {
          fx.ultimate(e.f);
          this.popups.ring(e.f.x, e.f.y, 20, 300, e.f.def.color, 520, 0.25);
          this.cameras.main.shake(260, 0.014);
          this.events.emit('sfx:boom');
          if (solo) this.hitStop = Math.max(this.hitStop, 90);
        }
        break;
      case 'special':
        fx.specialCast(e.f);
        this.events.emit('sfx:special');
        break;
      case 'jump':
        fx.jump(e.f, e.grounded);
        this.events.emit('sfx:jump');
        break;
      case 'land':
        this.events.emit('sfx:land', e.vy);
        if (e.dust) fx.land(e.f, e.vy);
        break;
      case 'hit': {
        this.events.emit('sfx:hit', e.power, e.f.x);
        if (e.power > 700) this.cameras.main.shake(100, 0.004);
        fx.hit(e.f.x, e.f.y, e.power, e.by, e.special);
        const dmg = e.dmg ?? 0;
        // damage number: small and white for chip damage, big and warm for heavy hits, orange CRIT! for crits
        if (dmg > 0) {
          const big = Math.min(1, dmg / 14);
          if (e.crit) {
            this.popups.text(e.f.x, e.f.y - e.f.body.height * 0.6, `CRIT! ${Math.round(dmg)}`, '#ffa31a', 26, 950, -70, 0.9);
            this.events.emit('sfx:crit');
          } else if (e.f === this.local || e.f.team === 'enemy') {
            this.popups.text(e.f.x + (Math.random() - 0.5) * 16, e.f.y - e.f.body.height * 0.55, String(Math.round(dmg)), big > 0.6 ? '#ffe066' : '#ffffff', 16 + big * 10, 650, -55, 0.5);
          }
        }
        if (solo && (e.crit || e.power > 800)) this.hitStop = Math.max(this.hitStop, e.crit ? 75 : 45);
        break;
      }
      case 'blast':
        fx.koBlast(e.x, e.y, this.stage.width / 2);
        fx.ring(e.x, e.y);
        if (e.killer && e.killer.team === 'hero') this.views.get(e.killer)?.cheer('taunt');
        if (e.f === this.local) this.cameras.main.shake(180, 0.01);
        this.events.emit('sfx:ko');
        if (e.killer === this.local) {
          this.popups.text(e.x, Math.min(e.y, this.stage.height - 90), '+KO', '#facc15', 30, 900, -50, 1);
          if (solo) this.hitStop = Math.max(this.hitStop, 110);
          this.cameras.main.shake(140, 0.006);
        }
        break;
      case 'combo':
        if (e.f === this.local) this.events.emit('sfx:combo', e.n);
        break;
      case 'streak': {
        const line = STREAK_LINES[Math.min(6, e.n)] ?? 'UNSTOPPABLE ADMIN!';
        if (e.f === this.local) {
          this.events.emit('hud:banner', line, '#facc15');
          this.events.emit('sfx:streak');
        } else this.popups.text(e.f.x, e.f.y - e.f.body.height, `${e.f.def.name}: ${line}`, '#e2e8f0', 14, 1100, -40, 0.4);
        break;
      }
      case 'ledge':
        fx.dust(e.f.x + e.f.facing * 10, e.f.body.top + 6, 3);
        if (e.kind === 'grab') {
          this.events.emit('sfx:ledge');
          if (e.f === this.local) this.popups.text(e.f.x, e.f.body.top - 16, e.n >= 2 ? 'LAST GRAB!' : 'LEDGE!', '#ffc857', 15, 600, -35, 0.4);
        } else if (e.kind === 'climb') this.events.emit('sfx:jump');
        break;
      case 'crate':
        this.events.emit('sfx:crate');
        this.popups.text(e.x, 60, `${POWERS[e.power].icon} CRATE!`, hex(POWERS[e.power].color), 18, 900, 40, 0.5);
        break;
      case 'pickup': {
        const def = POWERS[e.power];
        const col = hex(def.color);
        this.popups.text(e.f.x, e.f.y - e.f.body.height * 0.9, `${def.icon} ${def.name.toUpperCase()}`, col, 20, 1500, -42, 0.9);
        this.popups.text(e.f.x, e.f.y - e.f.body.height * 0.9 + 22, def.blurb, '#e2e8f0', 12, 1500, -42, 0.3);
        this.popups.ring(e.f.x, e.f.body.bottom - 4, 20, 150, def.color, 520, 0.35);
        fx.pickup(e.f);
        this.events.emit('sfx:pickup');
        if (e.f === this.local) this.events.emit('hud:banner', def.name.toUpperCase(), col);
        break;
      }
      case 'shock':
        fx.shock(e.x, e.y, e.r, this.world.boss.def.id);
        this.popups.ring(e.x, e.y - 6, 20, e.r, 0xffa31a, 520, 0.18);
        this.cameras.main.shake(220, 0.012);
        this.events.emit('sfx:boom');
        break;
      case 'summon':
        this.popups.ring(e.f.x, e.f.y, 30, 200, 0x9b5cff, 600, 0.6);
        this.popups.text(e.f.x, e.f.y - e.f.body.height * 0.8, 'REINFORCEMENTS!', '#c4b5fd', 18, 1100, -40, 0.6);
        break;
      case 'arrive':
        this.views.get(e.f)?.intro();
        this.events.emit('hud:banner', `${e.f.def.name.toUpperCase()}\nARRIVES`, '#f43f5e');
        this.cameras.main.shake(200, 0.008);
        this.events.emit('sfx:boom');
        break;
      case 'freeze':
        this.popups.ring(e.x, e.y, 20, e.r, 0xf6ead2, 700, 0.5);
        this.popups.text(e.x, e.y - 60, 'HAVE YOU TRIED...', '#f6ead2', 16, 1000, -35, 0.5);
        this.events.emit('sfx:boom');
        break;
      case 'end':
        if (this.ending) break;
        this.ending = true;
        if (e.won) {
          for (const [f, v] of this.views) {
            if (f.team === 'hero') v.cheer('victory');
            else if (f !== this.world.boss) v.defeat(); // the boss's bots shut down with it
          }
          this.bossDefeat();
        }
        if (solo) {
          this.slowMs = 1000;
          if (e.won) this.combatView.confetti(this.local.x, this.local.y - 120);
          this.cameras.main.flash(300, 255, 255, 255);
        }
        this.time.delayedCall(solo ? 1900 : 1200, () => this.finish(e.won));
        break;
    }
  }

  /** Win tableau: the boss (already gone off the blast zone) crashes back onto the stage in its defeat frames, near the camera. */
  private bossDefeat(): void {
    const b = this.world.boss;
    const key = `${b.def.id}:defeat`;
    if (b.alive || !ART[b.def.id] || !this.anims.exists(key)) return;
    const g = this.stage.ground;
    const x = Phaser.Math.Clamp(this.cameras.main.midPoint.x + 140, g.left + 90, g.right - 90);
    const sc = artScale(b.def.id, b.def.scale);
    const s = this.add.sprite(x, g.top, b.def.id).setOrigin(0.5, FEET_ORIGIN_Y).setScale(sc).setDepth(5).setAlpha(0);
    s.setFlipX(this.local.x > x === false);
    if (ART[b.def.id].smooth) s.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
    s.play(key);
    this.tweens.add({ targets: s, alpha: 1, duration: 160 });
    this.combatView.puff(x, g.top - 30);
    this.combatView.koBlast(x, g.top - 60);
  }

  /** Match over: back to the result screen, or on to the loot pick in a dungeon. */
  private finish(won: boolean): void {
    const w = this.world;
    if (this.gmode === 'dungeon' && this.run) {
      const run = finishRoom(this.run, { won, stocks: this.local.stocks, score: this.local.score, kos: this.local.kos, bestCombo: this.local.bestCombo, timeMs: w.tick * TICK_MS });
      if (won) this.scene.start('Loot', { run, cleared: this.roomName }); // reward, then the map (or the win screen after the last boss)
      else this.scene.start('Result', { won: false, heroId: this.heroDef.id, bossIndex: this.bossIndex, mode: 'dungeon', run });
      return;
    }
    this.scene.start('Result', {
      won,
      heroId: this.heroDef.id,
      bossIndex: this.bossIndex,
      net: this.mode === 'solo' ? undefined : this.mode,
      mode: this.gmode,
      score: this.local.score,
      bestCombo: this.local.bestCombo,
    });
  }

  /** Bright brackets on every grabbable platform corner, so you can see where Smash-style ledge grabs work. */
  private drawLedgeMarkers(): void {
    const g = this.add.graphics().setDepth(3);
    const tint = this.stage.tint?.edge ?? 0xffc857;
    for (const L of this.world.ledges) {
      g.lineStyle(3, tint, 0.9);
      g.beginPath();
      g.moveTo(L.x - L.side * 14, L.y);
      g.lineTo(L.x, L.y);
      g.lineTo(L.x, L.y + 16);
      g.strokePath();
    }
  }

  private drawPlatforms(): void {
    const art = this.stage.art;
    const tint = this.stage.tint;
    const PIX = 0.49; // same world-pixels-per-source-pixel as the character sprites
    for (const p of this.stage.platforms) {
      const key = art ? `stage_${p.solid ? art.solid : art.soft}` : '';
      if (key && this.textures.exists(key) && /_(main|soft)$/.test(key)) {
        // Codex platform piece: stretched to the collision width, with the row of the art that is the walking surface
        // (below the railings / props / empty margin drawn above it) on the platform top, so nobody floats above the floor
        const img = this.add.image(p.x, p.y - p.h / 2, key).setOrigin(0.5, 0).setDepth(2);
        img.setScale(p.w / img.width);
        img.y -= (STAGE_SURFACE[key.replace('stage_', '')] ?? 0) * img.scaleY;
      } else if (key && this.textures.exists(key)) {
        const h = this.textures.get(key).getSourceImage().height * PIX;
        this.add.tileSprite(p.x, p.y - p.h / 2 + h / 2, p.w, h, key).setTileScale(PIX).setDepth(2);
      } else {
        const fill = tint ? (p.solid ? tint.solid : tint.soft) : p.solid ? 0x334155 : 0x64748b;
        const edge = tint ? tint.edge : p.solid ? 0x64748b : 0x94a3b8;
        this.add.rectangle(p.x, p.y, p.w, p.h, fill).setStrokeStyle(2, edge).setDepth(2);
      }
    }
  }

  private drawBackdrop(): void {
    const layers = (this.stage.art?.backdrop ?? []).map((k) => `stage_${k}`).filter((k) => this.textures.exists(k));
    if (layers.length && layers.every((k) => /_(far|mid)$/.test(k))) {
      // parallax: the far layer barely follows the camera, the mid layer a bit more; both are centred on the world so the camera never runs off them
      this.add.rectangle(this.stage.width / 2, this.stage.height / 2, this.stage.width + 1600, this.stage.height + 1600, 0x0e1224).setDepth(0);
      layers.forEach((k) => {
        const f = k.endsWith('_far') ? 0.3 : 0.55;
        const img = this.add.image(this.stage.width / 2, this.stage.height / 2, k).setDepth(k.endsWith('_far') ? 0 : 1).setScrollFactor(f);
        img.setScale(this.stage.height / img.height);
      });
      return;
    }
    if (layers.length) {
      // stack the layers upward from just under the main platform; dark floor below
      let y = this.stage.ground.top + 20;
      this.add.rectangle(this.stage.width / 2, (y + this.stage.height + 400) / 2, this.stage.width + 400, this.stage.height + 400 - y, 0x0e1224).setDepth(0);
      for (const k of layers) {
        const img = this.add.image(this.stage.width / 2, y, k).setOrigin(0.5, 1).setDepth(0);
        img.setScale(this.stage.width / img.width);
        y -= img.displayHeight;
      }
      return;
    }
    const { width, ground } = this.stage;
    const g = this.add.graphics().setDepth(0);
    g.fillStyle(this.stage.rack);
    const top = ground.top - 620;
    const cols = Math.floor(width / 160);
    for (let i = 0; i < cols; i++) g.fillRect(25 + i * 160, top, 110, 600);
    const edge = this.stage.tint?.edge;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < 13; j++) {
        const led = this.add.rectangle(41 + i * 160, top + 24 + j * 44, 6, 6, edge ?? (j % 3 === 0 ? 0x22c55e : 0x38bdf8)).setDepth(1);
        this.tweens.add({ targets: led, alpha: 0.15, duration: 400 + ((i * 7 + j * 13) % 9) * 120, yoyo: true, repeat: -1 });
      }
    }
  }
}
