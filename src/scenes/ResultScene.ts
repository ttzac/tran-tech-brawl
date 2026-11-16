import Phaser from 'phaser';
import { fitUi } from '../ui/hires';
import { Sfx } from '../systems/Sfx';
import { net, leaveNet } from '../net/session';
import { NetHost } from '../net/NetHost';
import type { GameMode } from '../data/types';
import { FLOORS, relicById, type RunState } from '../data/dungeon';
import { roomsPerRun } from '../sim/crawl';

const FONT = 'Consolas, "Courier New", monospace';

/** Optional extra fields. If FightScene passes `timeMs` / `kos` they win; otherwise the
 *  HUD scene's registry entry 'fightStats' ({ timeMs, kos }) is used. */
interface ResultData {
  won: boolean;
  heroId: string;
  bossIndex: number;
  timeMs?: number;
  kos?: number;
  /** online match: the host takes everyone back to the lobby; players wait for that */
  net?: 'host' | 'client';
  mode?: GameMode;
  /** dungeon: the finished run */
  run?: RunState;
  score?: number;
  bestCombo?: number;
}

function flavour(mode: GameMode | undefined, won: boolean, run?: RunState): string {
  if (mode === 'dungeon') return won ? `All ${FLOORS} floors down. The auditors are very impressed.` : `Fell on floor ${(run?.floor ?? 0) + 1} of ${FLOORS} after ${run?.cleared ?? 0} room${run?.cleared === 1 ? '' : 's'}.`;
  if (mode === 'brawl') return won ? 'Last team standing. Ticket closed.' : 'Your crew got benched. Rematch?';
  return won ? 'Ticket closed. Boss rebooted.' : 'Escalate and try again.';
}

/** Best dungeon score on this PC (updated with this run); Solo Crawl keeps its own record. */
function bestRun(run: RunState): { score: number; isNew: boolean } {
  const key = run.solo ? 'ttb.solo.best' : 'ttb.dungeon.best';
  let old = 0;
  try {
    old = Number(localStorage.getItem(key)) || 0;
    if (run.score > old) localStorage.setItem(key, String(run.score));
  } catch {
    // storage blocked: no best score
  }
  return { score: Math.max(old, run.score), isNew: run.score > old && run.score > 0 };
}

export class ResultScene extends Phaser.Scene {
  private data0!: ResultData;

  constructor() {
    super('Result');
  }

  init(data: ResultData): void {
    this.data0 = data;
  }

  create(): void {
    fitUi(this);
    const { won, heroId, bossIndex, mode, run } = this.data0;
    const reg = this.registry.get('fightStats') as { timeMs: number; kos: number } | undefined;
    // a dungeon run shows its totals, not just the last room
    const timeMs = run?.timeMs ?? this.data0.timeMs ?? reg?.timeMs;
    const kos = run?.kos ?? this.data0.kos ?? reg?.kos;

    this.cameras.main.setBackgroundColor(0x0b0f1a);
    Sfx.attach(this);
    Sfx.play(won ? 'win' : 'lose');

    const col = won ? '#4ade80' : '#f87171';
    const title = this.add
      .text(480, 150, mode === 'dungeon' ? (won ? (run?.solo ? 'SOLO CLEARED' : 'DUNGEON CLEARED') : 'RUN OVER') : won ? 'VICTORY' : 'DEFEATED', { fontFamily: FONT, fontSize: mode === 'dungeon' && won ? '64px' : '80px', fontStyle: 'bold', color: col })
      .setOrigin(0.5)
      .setStroke('#000000', 10)
      .setScale(0.3)
      .setAlpha(0);
    this.tweens.add({ targets: title, scale: 1, alpha: 1, duration: 350, ease: 'Back.Out' });
    // Codex banner art above the title ("SYSTEM RESTORED" / "SYSTEM DOWN")
    const bannerKey = won ? 'ui_hud_victory_banner' : 'ui_hud_defeat_banner';
    if (this.textures.exists(bannerKey)) {
      const banner = this.add.image(480, 58, bannerKey).setScale(0.3).setAlpha(0);
      this.tweens.add({ targets: banner, scale: 0.55, alpha: 1, duration: 400, delay: 150, ease: 'Back.Out' });
    }
    // the hero you played, in their winning or hurting mood
    const mood = `portrait_${heroId}_${won ? 'win' : 'hurt'}`;
    if (this.textures.exists(mood)) {
      this.add.rectangle(150, 300, 148, 148, 0x131a2b).setStrokeStyle(3, won ? 0x4ade80 : 0xf87171);
      this.add.image(150, 300, mood).setDisplaySize(140, 140);
    }
    this.add
      .text(480, 220, flavour(mode, won, run), { fontFamily: FONT, fontSize: '20px', color: '#94a3b8' })
      .setOrigin(0.5);

    // style stats: score, best combo (and the relics you carried in a dungeon)
    const score = run?.score ?? this.data0.score;
    const combo = run?.bestCombo ?? this.data0.bestCombo;
    if (score !== undefined) {
      const box = (x: number, label: string, value: string) => {
        this.add.rectangle(x, 388, 150, 52, 0x131a2b).setStrokeStyle(2, 0x334155);
        this.add.text(x, 374, label, { fontFamily: FONT, fontSize: '11px', color: '#64748b' }).setOrigin(0.5);
        this.add.text(x, 394, value, { fontFamily: FONT, fontSize: '22px', fontStyle: 'bold', color: '#facc15' }).setOrigin(0.5);
      };
      box(360, 'SCORE', String(score));
      box(530, 'BEST COMBO', String(combo ?? 0));
      if (run) box(700, 'ROOMS', `${run.path.length + run.floor * (roomsPerRun(run) / FLOORS)} / ${roomsPerRun(run)}`);
    }
    if (run) {
      // the build you carried, the seed (same seed = same dungeon) and your best run on this PC
      const best = bestRun(run);
      const relics = run.relics.map((id) => relicById(id)?.icon ?? '').join(' ');
      this.add.text(480, 252, relics ? `Relics: ${relics}` : 'No relics picked up', { fontFamily: FONT, fontSize: '16px', color: '#e2e8f0' }).setOrigin(0.5);
      this.add
        .text(480, 478, `seed ${run.seed.toString(16).toUpperCase()}   ·   ${best.isNew ? 'NEW BEST SCORE!' : `best score ${best.score}`}`, { fontFamily: FONT, fontSize: '13px', color: best.isNew ? '#facc15' : '#64748b' })
        .setOrigin(0.5);
    }

    if (timeMs !== undefined || kos !== undefined) {
      const s = Math.floor((timeMs ?? 0) / 1000);
      const time = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      const stat = (x: number, label: string, value: string) => {
        this.add.rectangle(x, 310, 200, 80, 0x131a2b).setStrokeStyle(2, 0x334155);
        this.add.text(x, 292, label, { fontFamily: FONT, fontSize: '14px', color: '#64748b' }).setOrigin(0.5);
        this.add.text(x, 322, value, { fontFamily: FONT, fontSize: '36px', fontStyle: 'bold', color: '#e2e8f0' }).setOrigin(0.5);
      };
      if (timeMs !== undefined) stat(kos !== undefined ? 380 : 480, 'TIME', time);
      if (kos !== undefined) stat(timeMs !== undefined ? 580 : 480, 'KOs', String(kos));
    }

    const online = this.data0.net;
    const label = online === 'host' ? 'ENTER = back to the lobby   ·   Esc = end the game' : online === 'client' ? 'Waiting for the host...   ·   Esc = leave' : mode === 'dungeon' ? 'ENTER = new run   ·   Esc = menu   ·   M = mute' : 'ENTER = rematch   ·   Esc = menu   ·   M = mute';
    const prompt = this.add.text(480, 446, label, { fontFamily: FONT, fontSize: '20px', color: '#facc15' }).setOrigin(0.5);
    this.tweens.add({ targets: prompt, alpha: 0.5, yoyo: true, repeat: -1, duration: 700 });

    // M is the global mute key (Sfx), so menu moved to Esc / Backspace.
    const kb = this.input.keyboard!;
    if (online) {
      // the client's NetClient routes it to the lobby (or the next fight) when the host moves on
      const leave = () => {
        Sfx.play('select');
        leaveNet();
        this.scene.start('Menu', { heroId });
      };
      kb.once('keydown-ESC', leave);
      kb.once('keydown-BACKSPACE', leave);
      if (online === 'host')
        kb.once('keydown-ENTER', () => {
          Sfx.play('select');
          if (net instanceof NetHost) net.backToLobby();
          this.scene.start('Lobby', { mode: 'resume' });
        });
      return;
    }
    kb.once('keydown-ENTER', () => {
      Sfx.play('select');
      if (mode === 'dungeon') this.scene.start('Map', { heroId, solo: run?.solo }); // a brand-new run (same kind)
      else this.scene.start('Fight', { heroId, bossIndex, mode });
    });
    const toMenu = () => {
      Sfx.play('select');
      this.scene.start('Menu', { heroId });
    };
    kb.once('keydown-ESC', toMenu);
    kb.once('keydown-BACKSPACE', toMenu);
  }
}
