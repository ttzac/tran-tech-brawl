// Head-size check and fit. Crops every raw frame around its face at the size the import will use (tools/art/rescale.json factors
// applied), all at one zoom, so every head in docs/art/measure/<id>-heads.jpg should look the same size as the first (idle_1).
//   node tools/art/heads.mjs [--fit] [zac caleb ...]        needs docs/art/measure/<id>.json (node tools/art/measure.mjs)
// The number after the factor is the measured head size against idle_1 (1.00 = same): the count of head-coloured pixels (skin +
// the hair colours learned from idle_1) around the face. --fit adjusts the factors until that reads 1 (frames listed under
// "_lock" keep their hand-set factor). Face not found? add "frame": [x, y] (raw px) under "_centres" and fit again.
import sharp from 'sharp';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ALL, loadRaw } from './measure.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const fixFile = `${root}tools/art/rescale.json`;
const fix = existsSync(fixFile) ? JSON.parse(readFileSync(fixFile, 'utf8')) : {};
fix._centres ??= {}; fix._lock ??= {};
const args = process.argv.slice(2), fit = args.includes('--fit');
const ids = args.filter((a) => !a.startsWith('--')).length ? args.filter((a) => !a.startsWith('--')) : ALL.map((d) => d.split('/').pop());
const C = 200, cols = 8, PAD = 600;
const isBg = (r, g, b) => g < Math.min(r, b) - 60 && Math.abs(r - b) < 70 && r > 110;
const isSkin = (r, g, b) => r > 150 && r - g > 18 && r - g < 95 && g - b > 8 && g - b < 85 && r - b > 40 && r - b < 150;
const bin = (r, g, b) => ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);

for (const id of ids) {
  const rows = JSON.parse(readFileSync(`${root}docs/art/measure/${id}.json`, 'utf8'));
  const ref = rows.find((r) => r.name === 'idle_1');
  if (!fix[id]) {
    fix[id] = {};
    for (const r of rows) {
      const g = r.skin && r.skin > 0.55 && r.skin < 1.8 ? r.skin : r.ratio;
      if (Math.abs(1 / g - 1) >= 0.05) fix[id][r.name] = +(1 / g).toFixed(2);
    }
  }
  const win = Math.min(440, Math.max(230, ref.rs * 4.6)), ring = (ref.rs / win) * C;
  const padded = new Map();
  const crop = async (r, f) => {
    if (!padded.has(r.name)) padded.set(r.name, await sharp((await loadRaw(r.file)).full).extend({ top: PAD, bottom: PAD, left: PAD, right: PAD, background: '#ff00ff' }).png().toBuffer());
    const w = Math.round(win / f), [cx, cy] = fix._centres[id]?.[r.name] ?? [r.sx, r.sy];
    return sharp(padded.get(r.name)).extract({ left: Math.round(cx + PAD - w / 2), top: Math.round(cy + PAD - w / 2), width: w, height: w }).resize(C, C).removeAlpha().raw().toBuffer();
  };
  // hair colours: the common non-skin, non-outline colours around and above idle_1's face
  const base = await crop(ref, 1), hist = new Map();
  let n = 0;
  for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) {
    const dx = x - C / 2, dy = y - C / 2;
    if (dx * dx + dy * dy > (ring * 2.1) ** 2 || dy > ring * 0.4) continue;
    const i = (y * C + x) * 3, r = base[i], g = base[i + 1], b = base[i + 2];
    if (isBg(r, g, b) || isSkin(r, g, b) || Math.max(r, g, b) < 70) continue;
    hist.set(bin(r, g, b), (hist.get(bin(r, g, b)) ?? 0) + 1); n++;
  }
  const hair = new Set([...hist].filter(([, c]) => c > n * 0.04).map(([k]) => k));
  const headArea = (px) => {
    let a = 0;
    for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) {
      const dx = x - C / 2, dy = y - C / 2;
      if (dx * dx + dy * dy > (ring * 2.3) ** 2) continue;
      const i = (y * C + x) * 3, r = px[i], g = px[i + 1], b = px[i + 2];
      if (!isBg(r, g, b) && (isSkin(r, g, b) || hair.has(bin(r, g, b)))) a++;
    }
    return a;
  };
  const a0 = headArea(base), est = {};
  for (let pass = 0; pass < (fit ? 6 : 1); pass++) {
    for (const r of rows) {
      const f = fix[id][r.name] ?? 1;
      est[r.name] = Math.sqrt(headArea(await crop(r, f)) / a0);
      if (fit && pass < 5 && r.name !== 'idle_1' && !fix._lock[id]?.includes(r.name) && est[r.name] > 0.3) {
        const nf = Math.min(2.2, Math.max(0.45, f / est[r.name] ** 0.85));
        if (Math.abs(nf - 1) < 0.04) delete fix[id][r.name]; else fix[id][r.name] = +nf.toFixed(2);
      }
    }
  }
  const comp = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i], f = fix[id][r.name] ?? 1, x = (i % cols) * C, y = Math.floor(i / cols) * C;
    comp.push({ input: await sharp(await crop(r, f), { raw: { width: C, height: C, channels: 3 } }).png().toBuffer(), left: x, top: y });
    comp.push({ input: Buffer.from(`<svg width="${C}" height="${C}" xmlns="http://www.w3.org/2000/svg"><rect x="0.5" y="0.5" width="${C - 1}" height="${C - 1}" fill="none" stroke="#000"/><circle cx="${C / 2}" cy="${C / 2}" r="${ring}" fill="none" stroke="#fff" stroke-width="1"/><rect x="0" y="0" width="${C}" height="17" fill="#000" fill-opacity="0.6"/><text x="4" y="13" font-family="Arial" font-size="13" font-weight="bold" fill="${Math.abs(est[r.name] - 1) > 0.08 ? '#ff0' : '#fff'}">${r.name} x${f} (${est[r.name].toFixed(2)})</text></svg>`), left: x, top: y });
  }
  await sharp({ create: { width: cols * C, height: Math.ceil(rows.length / cols) * C, channels: 3, background: '#ff00ff' } }).composite(comp).jpeg({ quality: 85 }).toFile(`${root}docs/art/measure/${id}-heads.jpg`);
  console.log(`${id}: hair bins ${hair.size}; off by >8%: ${rows.filter((r) => Math.abs(est[r.name] - 1) > 0.08).map((r) => `${r.name}(${est[r.name].toFixed(2)})`).join(' ') || 'none'}`);
}
writeFileSync(fixFile, JSON.stringify(fix, null, 1));
