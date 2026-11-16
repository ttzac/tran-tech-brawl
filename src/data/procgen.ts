import type { StageDef } from './types';
import { Rng } from '../sim/rng';

/** Shared blast zone: leave it and you lose a stock. */
export const BLAST = { left: -300, right: 2220, top: -400, bottom: 1400 };

export interface Theme {
  id: string;
  name: string;
  bg: number;
  rack: number;
  tint: { solid: number; soft: number; edge: number };
  /** stage art that exists in public/assets/stages (only the first two themes have art yet; the rest wait for Codex) */
  art?: StageDef['art'];
}

/** Biomes for procedural maps. Add one here + its Codex art prompts (codex/world.mjs STAGES) and it is in rotation. */
export const THEMES: Theme[] = [
  { id: 'serverroom', name: 'Server Room', bg: 0x443d71, rack: 0x131d33, tint: { solid: 0x334155, soft: 0x64748b, edge: 0x94a3b8 }, art: { solid: 'bench', soft: 'hang', backdrop: ['server', 'sky'] } },
  { id: 'rooftop', name: 'Rooftop', bg: 0x443d71, rack: 0x2a1530, tint: { solid: 0x3b2a44, soft: 0x7c5a8a, edge: 0xb48bc4 }, art: { solid: 'bench', soft: 'hang', backdrop: ['sky'] } },
  { id: 'promptfactory', name: 'Prompt Factory', bg: 0x14352c, rack: 0x0a1f19, tint: { solid: 0x1f4d3f, soft: 0x2f8f6f, edge: 0x4dff88 } },
  { id: 'ramvault', name: 'RAM Vault', bg: 0x1b1f4d, rack: 0x2a1a5e, tint: { solid: 0x2a2f7a, soft: 0x4f46e5, edge: 0x9b5cff } },
  { id: 'cloud', name: 'The Cloud', bg: 0x5b8def, rack: 0x8fb4ff, tint: { solid: 0xdbeafe, soft: 0xbfdbfe, edge: 0xffffff } },
  { id: 'printer', name: 'Printer Incident', bg: 0x4a4a52, rack: 0x2b2b33, tint: { solid: 0x6b7280, soft: 0x9ca3af, edge: 0xf6ead2 } },
  { id: 'cupboard', name: 'Comms Cupboard', bg: 0x3a2f24, rack: 0x1d1812, tint: { solid: 0x5b4636, soft: 0x8b6b4f, edge: 0xffc857 } },
];
export const themeById = (id: string): Theme => THEMES.find((t) => t.id === id) ?? THEMES[0];

export type Layout = 'classic' | 'islands' | 'tower' | 'wide';
export const LAYOUTS: Layout[] = ['classic', 'islands', 'tower', 'wide'];

const W = 1920;
const H = 1080;
const GROUND_Y = 860;
const ROW_STEP = 145; // vertical spacing between rows: a single jump clears ~128 px, a double jump ~250
const X_MIN = 240;
const X_MAX = W - 240;

type P = StageDef['platforms'][number];

/** Build a playable map from a seed: same seed, same map (so a network host and its clients agree, and tests can replay it).
 *  Every layout has one big solid "ground" slab (the bots' home), soft one-way platforms stacked in rows above it,
 *  and optionally floating solid islands (more ledges to grab). Each platform is placed within reach of one below it. */
export function generateStage(seed: number, opts: { theme?: string; layout?: Layout } = {}): StageDef {
  const rng = new Rng((seed ^ 0x9e3779b9) >>> 0);
  const theme = opts.theme ? themeById(opts.theme) : THEMES[rng.int(0, THEMES.length - 1)];
  const layout = opts.layout ?? LAYOUTS[rng.int(0, LAYOUTS.length - 1)];
  const between = (a: number, b: number) => a + rng.next() * (b - a);

  const mainW = Math.round(layout === 'tower' ? between(560, 720) : layout === 'islands' ? between(620, 820) : layout === 'wide' ? between(1400, 1500) : between(900, 1300));
  const mainX = W / 2 + Math.round(between(-60, 60));
  const ground: P = { x: mainX, y: GROUND_Y, w: mainW, h: 40, solid: true };
  const platforms: P[] = [ground];
  // `below` = the platforms the next row may be reached from
  let below: P[] = [ground];

  const place = (y: number, count: number, wMin: number, wMax: number, solid: boolean, h: number): P[] => {
    const placed: P[] = [];
    for (let n = 0; n < count; n++) {
      for (let tries = 0; tries < 8; tries++) {
        const sup = below[rng.int(0, below.length - 1)];
        const w = Math.round(between(wMin, wMax));
        const x = Math.round(Math.min(X_MAX, Math.max(X_MIN, sup.x + between(-300, 300))));
        const clash = placed.some((o) => Math.abs(o.x - x) < (o.w + w) / 2 + 50);
        if (clash) continue;
        placed.push({ x, y, w, h, solid });
        break;
      }
    }
    return placed;
  };

  const rows: [number, number][] =
    layout === 'tower' ? [[700, 3], [555, 3], [410, 2], [265, 1]]
    : layout === 'islands' ? [[710, 2], [565, 2], [420, 1]]
    : layout === 'wide' ? [[700, 3], [555, 2], [415, 2]]
    : [[700, 3], [555, 2], [415, 1]];
  rows.forEach(([y, base], rowIndex) => {
    const count = Math.max(1, base + rng.int(-1, 1));
    // 'islands': the lowest two rows are solid floating slabs (ledges to fight over)
    const solid = layout === 'islands' && rowIndex < 2;
    const row = place(y, count, solid ? 260 : 190, solid ? 340 : 270, solid, solid ? 40 : 12);
    if (row.length === 0) return;
    platforms.push(...row);
    below = row;
  });

  const gl = ground.x - ground.w / 2;
  const gr = ground.x + ground.w / 2;
  const span = gr - gl;
  return {
    id: `proc-${(seed >>> 0).toString(16)}`,
    name: `${theme.name} (${layout})`,
    width: W,
    height: H,
    bg: theme.bg,
    rack: theme.rack,
    platforms,
    spawns: [{ x: Math.round(gl + span * 0.22), y: 560 }, { x: Math.round(gl + span * 0.78), y: 560 }],
    blast: BLAST,
    ground: { left: gl, right: gr, top: GROUND_Y - 20 },
    art: theme.art,
    theme: theme.id,
    tint: theme.tint,
  };
}

/** Sanity checks used by the tests (and handy in the console): returns a list of problems, empty = fine. */
export function checkStage(st: StageDef): string[] {
  const bad: string[] = [];
  if (!st.platforms.some((p) => p.solid)) bad.push('no solid platform');
  if (st.platforms.length < 4) bad.push('too few platforms');
  for (const p of st.platforms) {
    if (p.x - p.w / 2 < 0 || p.x + p.w / 2 > st.width) bad.push(`platform off the map at x=${p.x}`);
    if (p.y < 150 || p.y > st.height) bad.push(`platform out of vertical range y=${p.y}`);
  }
  for (let i = 0; i < st.platforms.length; i++)
    for (let j = i + 1; j < st.platforms.length; j++) {
      const a = st.platforms[i];
      const b = st.platforms[j];
      if (Math.abs(a.y - b.y) < a.h / 2 + b.h / 2 + 20 && Math.abs(a.x - b.x) < (a.w + b.w) / 2) bad.push(`platforms ${i} and ${j} overlap`);
    }
  // reachability: every non-ground platform has one below within a jump and 300 px sideways of its edge
  for (const p of st.platforms) {
    if (p.y >= GROUND_Y - 1) continue;
    const top = (r: P) => r.y - r.h / 2; // jumps are measured between standing surfaces
    const ok = st.platforms.some((q) => q !== p && top(q) - top(p) > 0 && top(q) - top(p) <= ROW_STEP + 5 && Math.abs(q.x - p.x) <= (q.w + p.w) / 2 + 300);
    if (!ok) bad.push(`platform at (${p.x}, ${p.y}) is unreachable`);
  }
  for (const sp of st.spawns) if (!st.platforms.some((p) => sp.x > p.x - p.w / 2 && sp.x < p.x + p.w / 2 && p.y > sp.y)) bad.push(`spawn at ${sp.x} has nothing below`);
  return bad;
}
