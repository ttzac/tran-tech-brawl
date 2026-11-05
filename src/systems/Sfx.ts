import Phaser from 'phaser';

/**
 * Tiny Web Audio synthesiser: no audio files. Usage:
 *   Sfx.attach(scene)            // once per scene that wants sound (grabs Phaser's AudioContext)
 *   Sfx.play('hit', power)       // names: swing special hit jump land ko move select win lose
 *   Sfx.bindFight(fightEvents)   // subscribes the 'sfx:*' contract, returns an unsubscribe fn
 * M toggles mute (persisted in localStorage). The context is resumed on first key/click.
 */
export type SfxName = 'swing' | 'special' | 'hit' | 'jump' | 'land' | 'ko' | 'move' | 'select' | 'win' | 'lose';

const KEY = 'ttb.muted';
const MASTER = 0.22;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let muted = false;
let wired = false;
const stamps: Record<string, number[]> = {};

try {
  muted = localStorage.getItem(KEY) === '1';
} catch {
  /* storage unavailable */
}

function ensure(): AudioContext | null {
  if (ctx) return ctx;
  try {
    const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new C();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : MASTER;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
  } catch {
    ctx = null;
  }
  return ctx;
}

function wire(): void {
  if (wired) return;
  wired = true;
  const resume = () => {
    const c = ensure();
    if (c && c.state !== 'running') void c.resume();
  };
  window.addEventListener('keydown', resume, true);
  window.addEventListener('pointerdown', resume, true);
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyM' && !e.repeat) Sfx.toggleMute();
  });
}

function noise(): AudioBuffer {
  const c = ctx!;
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

/** Oscillator blip with a pitch sweep and a fast attack / exponential decay. */
function tone(f0: number, f1: number, dur: number, type: OscillatorType, vol: number, delay = 0): void {
  const c = ctx!;
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master!);
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** Filtered noise burst. */
function hiss(dur: number, vol: number, f0: number, f1: number, kind: BiquadFilterType = 'bandpass', delay = 0): void {
  const c = ctx!;
  const t = c.currentTime + delay;
  const s = c.createBufferSource();
  s.buffer = noise();
  const fl = c.createBiquadFilter();
  fl.type = kind;
  fl.frequency.setValueAtTime(f0, t);
  fl.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(fl).connect(g).connect(master!);
  s.start(t, Math.random() * 0.5);
  s.stop(t + dur + 0.02);
}

/** Per-kind and global caps inside a 100 ms window (10 fighters can spam events). */
const CAPS: Record<string, number> = { swing: 2, special: 2, hit: 3, jump: 2, land: 2, ko: 2 };
function allowed(name: string): boolean {
  const now = performance.now();
  const total = (stamps['*'] ??= []);
  const mine = (stamps[name] ??= []);
  while (total.length && now - total[0] > 100) total.shift();
  while (mine.length && now - mine[0] > 100) mine.shift();
  if (total.length >= 6 || mine.length >= (CAPS[name] ?? 4)) return false;
  total.push(now);
  mine.push(now);
  return true;
}

const r = (a: number, b: number) => a + Math.random() * (b - a);

export const Sfx = {
  /** Call from any scene's create(). Prefers Phaser's own context so both share one unlock. */
  attach(scene?: Phaser.Scene): void {
    wire();
    const pc = (scene?.sound as unknown as { context?: AudioContext } | undefined)?.context;
    if (pc && !ctx) {
      ctx = pc;
      master = ctx.createGain();
      master.gain.value = muted ? 0 : MASTER;
      const comp = ctx.createDynamicsCompressor();
      master.connect(comp).connect(ctx.destination);
    } else {
      ensure();
    }
  },

  get muted(): boolean {
    return muted;
  },

  setMuted(m: boolean): void {
    muted = m;
    try {
      localStorage.setItem(KEY, m ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (master && ctx) master.gain.setTargetAtTime(m ? 0 : MASTER, ctx.currentTime, 0.01);
    window.dispatchEvent(new CustomEvent('ttb:mute', { detail: m }));
    if (!m) Sfx.play('select');
  },

  toggleMute(): boolean {
    Sfx.setMuted(!muted);
    return muted;
  },

  play(name: SfxName, arg = 0): void {
    if (muted || !ensure() || !master) return;
    if (ctx!.state === 'suspended') void ctx!.resume();
    if (ctx!.state !== 'running' || !allowed(name)) return;
    switch (name) {
      case 'swing':
        hiss(0.14, 0.5, r(900, 1200), 3200, 'bandpass');
        tone(r(260, 300), 120, 0.08, 'triangle', 0.12);
        break;
      case 'special':
        tone(r(420, 480), 1100, 0.2, 'square', 0.16);
        tone(r(210, 240), 520, 0.2, 'sawtooth', 0.1);
        hiss(0.18, 0.25, 600, 2400);
        break;
      case 'hit': {
        const p = Phaser.Math.Clamp(arg / 1600, 0, 1);
        const vol = 0.28 + p * 0.5;
        tone(190 - p * 90, 45, 0.1 + p * 0.16, 'square', vol);
        hiss(0.07 + p * 0.18, vol * 0.9, 3500 - p * 1800, 300, 'lowpass');
        if (p > 0.55) tone(80, 28, 0.3, 'sine', 0.5); // heavy thump
        break;
      }
      case 'jump':
        tone(r(300, 340), 640, 0.12, 'square', 0.1);
        break;
      case 'land': {
        const p = Phaser.Math.Clamp(arg / 900, 0.2, 1);
        hiss(0.07, 0.25 * p, 500, 120, 'lowpass');
        tone(110, 50, 0.07, 'sine', 0.25 * p);
        break;
      }
      case 'ko':
        hiss(0.5, 0.6, 2400, 120, 'lowpass');
        tone(520, 50, 0.55, 'sawtooth', 0.3);
        tone(70, 30, 0.6, 'sine', 0.6);
        break;
      case 'move':
        tone(660, 700, 0.05, 'square', 0.1);
        break;
      case 'select':
        tone(520, 520, 0.07, 'square', 0.14);
        tone(780, 780, 0.1, 'square', 0.14, 0.07);
        break;
      case 'win':
        [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.16, 'square', 0.16, i * 0.12));
        tone(1047, 1047, 0.5, 'square', 0.14, 0.5);
        tone(784, 784, 0.5, 'triangle', 0.14, 0.5);
        break;
      case 'lose':
        [392, 370, 330, 262].forEach((f, i) => tone(f, f * 0.97, 0.22, 'sawtooth', 0.13, i * 0.2));
        tone(131, 98, 0.7, 'triangle', 0.2, 0.8);
        break;
    }
  },

  /** Subscribe to the Fight scene's 'sfx:*' events. Returns an unsubscribe function. */
  bindFight(ev: Phaser.Events.EventEmitter): () => void {
    const h = {
      'sfx:swing': () => Sfx.play('swing'),
      'sfx:special': () => Sfx.play('special'),
      'sfx:hit': (power: number) => Sfx.play('hit', power),
      'sfx:jump': () => Sfx.play('jump'),
      'sfx:land': (fall: number) => Sfx.play('land', fall),
      'sfx:ko': () => Sfx.play('ko'),
    };
    for (const [k, fn] of Object.entries(h)) ev.on(k, fn);
    return () => {
      for (const [k, fn] of Object.entries(h)) ev.off(k, fn);
    };
  },
};
