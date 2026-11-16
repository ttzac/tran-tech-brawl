// Per-frame effect import: node tools/art/fxframes.mjs --prefix art-raw/fx/fx_hit_small_ --n 4 --id hit_small --cell 96
// Keys out the #FF00FF background, crops every frame to the union bounding box, scales to the cell, writes a strip.
import sharp from 'sharp';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const o = {}; const a = process.argv.slice(2);
for (let i = 0; i < a.length; i += 2) o[a[i].replace(/^--/, '')] = a[i + 1];
// a Codex "_contained" frame is the same art re-done smaller so it clears the canvas margin; centre it on a 1024 magenta canvas
const padded = (base) => {
  if (!existsSync(base + '_contained.png')) return sharp(base + '.png');
  return sharp(base + '_contained.png').flatten({ background: '#ff00ff' }).extend({ top: 102, bottom: 102, left: 102, right: 102, background: '#ff00ff' });
};
const n = Number(o.n), cell = Number(o.cell ?? 96);
const imgs = [];
for (let i = 1; i <= n; i++) {
  const { data, info } = await padded(`${root}${o.prefix}${i}`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const d = new Uint8Array(data);
  for (let p = 0; p < d.length; p += 4) {
    const r = d[p], g = d[p + 1], b = d[p + 2];
    if (r > 200 && b > 200 && g < 90) d[p + 3] = 0;
    else if (r > 170 && b > 170 && g < 140) { // fringe: remove magenta spill
      const t = Math.min(r, b); d[p] = Math.min(r, g + 40); d[p + 2] = Math.min(b, g + 40); void t;
    }
  }
  imgs.push({ d, w: info.width, h: info.height });
}
let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
for (const { d, w, h } of imgs) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
const cw = x1 - x0 + 1, ch = y1 - y0 + 1, s = (cell - 2) / Math.max(cw, ch);
const tw = Math.round(cw * s), th = Math.round(ch * s);
const comps = [];
for (let i = 0; i < n; i++) {
  const buf = await sharp(Buffer.from(imgs[i].d), { raw: { width: imgs[i].w, height: imgs[i].h, channels: 4 } })
    .extract({ left: x0, top: y0, width: cw, height: ch }).resize(tw, th, { kernel: 'lanczos3' }).png().toBuffer();
  comps.push({ input: buf, left: i * cell + ((cell - tw) >> 1), top: (cell - th) >> 1 });
}
const out = `${root}public/assets/fx/${o.id}.png`;
await sharp({ create: { width: cell * n, height: cell, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(comps).png().toBuffer().then((b) => sharp(b).png({ palette: true, colours: 256, dither: 0 }).toFile(out)); // 256-colour palette: about a third of the file size
console.log(`fx ${o.id}: ${n} frames of ${cell}x${cell} (union box ${cw}x${ch}, scale ${s.toFixed(3)})`);
