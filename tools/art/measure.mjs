// Measures the drawn size of every raw character frame, so frames Codex drew bigger or smaller than the rest can be found.
//   node tools/art/measure.mjs [heroes/zac bosses/altwave ...]     (no args: every character)
// Two size measures, both the radius of the biggest circle that fits inside a mask (pose changes them far less than the bounding box):
//   r  = inside the whole silhouette (head / torso blob)      rs = inside skin-coloured pixels only (the face; humans only)
// Writes docs/art/measure/<id>.json (ratios against idle_1) and docs/art/measure/<id>.png (every raw frame at one scale with both circles drawn).
import sharp from 'sharp';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
export const ALL = ['heroes/zac', 'heroes/chain', 'heroes/aiden', 'heroes/david', 'heroes/annemaree', 'heroes/bec', 'heroes/caleb', 'heroes/cameron', 'heroes/jared', 'heroes/lachlan', 'heroes/ryan', 'bosses/altwave', 'bosses/muskbot', 'minions/chatbot', 'minions/neurobot'];
const BODY = /^(idle|run|walk|jump|fall|melee|melee2|attack|special|hurt|launch|land|ultimate|respawn|ko|taunt|victory|intro|defeat|death)_(\d+)\.png$/;
const ORDER = ['idle', 'run', 'walk', 'jump', 'fall', 'melee', 'attack', 'special', 'hurt', 'launch', 'land', 'melee2', 'ultimate', 'respawn', 'ko', 'taunt', 'victory', 'intro', 'defeat', 'death'];
const N = 512;
const CLOSE = 5;

/** Chamfer distance (in N-px) from every set pixel to the nearest unset one. */
function dist(mask) {
  const d = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) d[i] = mask[i] ? 1e6 : 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x; if (!d[i]) continue;
    let v = d[i];
    v = Math.min(v, x > 0 ? d[i - 1] + 3 : 3);
    if (y > 0) { v = Math.min(v, d[i - N] + 3); if (x > 0) v = Math.min(v, d[i - N - 1] + 4); if (x < N - 1) v = Math.min(v, d[i - N + 1] + 4); } else v = Math.min(v, 3);
    d[i] = v;
  }
  for (let y = N - 1; y >= 0; y--) for (let x = N - 1; x >= 0; x--) {
    const i = y * N + x; if (!d[i]) continue;
    let v = d[i];
    v = Math.min(v, x < N - 1 ? d[i + 1] + 3 : 3);
    if (y < N - 1) { v = Math.min(v, d[i + N] + 3); if (x < N - 1) v = Math.min(v, d[i + N + 1] + 4); if (x > 0) v = Math.min(v, d[i + N - 1] + 4); } else v = Math.min(v, 3);
    d[i] = v;
  }
  for (let i = 0; i < N * N; i++) d[i] /= 3;
  return d;
}
function inscribed(mask) {
  const d = dist(mask);
  let best = 0, bi = 0;
  for (let i = 0; i < N * N; i++) if (d[i] > best) { best = d[i]; bi = i; }
  const k = 1024 / N;
  return { r: best * k, cx: (bi % N) * k, cy: ((bi / N) | 0) * k };
}
/** Fill gaps up to 2c wide (eyes, brows, mouth lines inside a face). */
function close(mask, c) {
  const inv = new Uint8Array(N * N);
  for (let i = 0; i < N * N; i++) inv[i] = mask[i] ? 0 : 1;
  const d1 = dist(inv);
  const grown = new Uint8Array(N * N);
  for (let i = 0; i < N * N; i++) grown[i] = d1[i] <= c ? 1 : 0;
  const d2 = dist(grown);
  const out = new Uint8Array(N * N);
  for (let i = 0; i < N * N; i++) out[i] = d2[i] > c ? 1 : 0;
  return out;
}

/** Raw frame (1024 canvas, magenta backdrop; smaller "_contained" files are padded) as N x N RGB. */
export async function loadRaw(file) {
  const meta = await sharp(file).metadata();
  let s = sharp(file).flatten({ background: '#ff00ff' });
  if (meta.width < 1024) { const m = Math.round((1024 - meta.width) / 2); s = s.extend({ top: m, bottom: 1024 - meta.width - m, left: m, right: 1024 - meta.width - m, background: '#ff00ff' }); }
  const full = await s.png().toBuffer();
  const { data } = await sharp(full).resize(N, N, { kernel: 'nearest' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, full };
}

export async function measure(file) {
  const { data, full } = await loadRaw(file);
  const solid = new Uint8Array(N * N), skin = new Uint8Array(N * N);
  let x0 = N, y0 = N, x1 = -1, y1 = -1;
  for (let i = 0; i < N * N; i++) {
    const r = data[i * 3], g = data[i * 3 + 1], b = data[i * 3 + 2];
    if (g < Math.min(r, b) - 60 && Math.abs(r - b) < 70 && r > 110) continue; // magenta backdrop and its fringe
    solid[i] = 1;
    if (r > 150 && r - g > 18 && r - g < 95 && g - b > 8 && r - b > 40 && r - b < 150) skin[i] = 1;
    const x = i % N, y = (i / N) | 0;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 < 0) return null;
  const k = 1024 / N, a = inscribed(solid), s = inscribed(close(skin, CLOSE));
  return { r: a.r, cx: a.cx, cy: a.cy, rs: s.r, sx: s.cx, sy: s.cy, x: x0 * k, y: y0 * k, w: (x1 - x0 + 1) * k, h: (y1 - y0 + 1) * k, bottom: (y1 + 1) * k, full };
}

export function rawFrames(dir) {
  const files = readdirSync(`${root}art-raw/${dir}`).filter((f) => BODY.test(f));
  const key = (f) => { const [, t, n] = f.match(BODY); return ORDER.indexOf(t) * 100 + Number(n); };
  return files.sort((a, b) => key(a) - key(b)).map((f) => {
    const base = f.replace('.png', ''), contained = `${root}art-raw/${dir}/${base}_contained.png`;
    return { base, file: existsSync(contained) ? contained : `${root}art-raw/${dir}/${f}` };
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const dirs = process.argv.slice(2).length ? process.argv.slice(2) : ALL;
  mkdirSync(`${root}docs/art/measure`, { recursive: true });
  for (const dir of dirs) {
    const id = dir.split('/').pop();
    const ms = [];
    for (const { base, file } of rawFrames(dir)) { const m = await measure(file); if (m) ms.push({ name: base, file, ...m }); }
    const ref = ms.find((m) => m.name === 'idle_1');
    const rows = ms.map((m) => ({ name: m.name, ratio: +(m.r / ref.r).toFixed(2), skin: ref.rs > 14 && m.rs > 7 ? +(m.rs / ref.rs).toFixed(2) : null, h: Math.round(m.h), w: Math.round(m.w), bottom: Math.round(m.bottom), sx: Math.round(m.sx), sy: Math.round(m.sy), rs: Math.round(m.rs), file: m.file }));
    writeFileSync(`${root}docs/art/measure/${id}.json`, JSON.stringify(rows, null, 1));
    console.log(`\n${id}: idle_1 r=${Math.round(ref.r)} rs=${Math.round(ref.rs)} h=${Math.round(ref.h)} bottom=${Math.round(ref.bottom)}`);
    console.log(rows.map((r) => `${r.name}=${r.ratio}/${r.skin ?? '-'}`).join(' '));
    // contact sheet: every raw frame at the same scale, silhouette circle (white) and skin circle (green), ratios printed
    const C = 250, cols = 8, rowsN = Math.ceil(ms.length / cols), f = C / 1024;
    const comp = [];
    for (let i = 0; i < ms.length; i++) {
      const m = ms[i], x = (i % cols) * C, y = Math.floor(i / cols) * C;
      comp.push({ input: await sharp(m.full).resize(C, C).png().toBuffer(), left: x, top: y });
      const svg = `<svg width="${C}" height="${C}" xmlns="http://www.w3.org/2000/svg"><rect x="0.5" y="0.5" width="${C - 1}" height="${C - 1}" fill="none" stroke="#000" stroke-opacity="0.4"/><line x1="0" x2="${C}" y1="${960 * f}" y2="${960 * f}" stroke="#000" stroke-opacity="0.5"/><circle cx="${m.cx * f}" cy="${m.cy * f}" r="${m.r * f}" fill="none" stroke="#fff" stroke-width="1.5"/><circle cx="${m.sx * f}" cy="${m.sy * f}" r="${m.rs * f}" fill="none" stroke="#0f0" stroke-width="1.5"/><text x="4" y="14" font-family="Arial" font-size="13" font-weight="bold" fill="#000">${m.name} ${rows[i].ratio} / ${rows[i].skin ?? '-'}</text></svg>`;
      comp.push({ input: Buffer.from(svg), left: x, top: y });
    }
    await sharp({ create: { width: cols * C, height: rowsN * C, channels: 3, background: '#ff00ff' } }).composite(comp).jpeg({ quality: 82 }).toFile(`${root}docs/art/measure/${id}.jpg`);
  }
}
