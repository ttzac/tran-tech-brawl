// Single-image import: keys out the magenta backdrop (optional), crops to the artwork (optional), resizes, writes a palette PNG.
//   node tools/art/keyfit.mjs --in art-raw/items/weapon_cable.png --out items/weapon_cable --key 1 --crop 1 --fit 64      (fit inside a 64x64 square)
//   node tools/art/keyfit.mjs --in art-raw/stages/serverroom/bg_far.png --out stages/serverroom_far --width 1920 [--colours 256]
//   --key 0 keeps the image as is. --out is relative to public/assets, without .png. --height / --width set one side; --fit N a square.
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const o = {}; const a = process.argv.slice(2);
for (let i = 0; i < a.length; i += 2) o[a[i].replace(/^--/, '')] = a[i + 1];
const { data, info } = await sharp(root + o.in).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const d = new Uint8Array(data);
if (o.key !== '0') {
  for (let p = 0; p < d.length; p += 4) {
    const r = d[p], g = d[p + 1], b = d[p + 2];
    if (r > 170 && b > 170 && g < 120) d[p + 3] = 0;
    else if (r > 150 && b > 150 && g < r - 55 && g < b - 55) { d[p] = Math.min(r, g + 30); d[p + 2] = Math.min(b, g + 30); } // pink fringe
  }
}
let img = sharp(Buffer.from(d), { raw: { width: info.width, height: info.height, channels: 4 } });
let w = info.width, h = info.height;
if (o.crop === '1') {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  w = x1 - x0 + 1; h = y1 - y0 + 1;
  img = sharp(await img.extract({ left: x0, top: y0, width: w, height: h }).png().toBuffer());
}
if (o.fit) img = img.resize(+o.fit, +o.fit, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: 'lanczos3' });
else if (o.width || o.height) img = img.resize(o.width ? +o.width : null, o.height ? +o.height : null, { kernel: 'lanczos3' });
const out = `${root}public/assets/${o.out}.png`;
mkdirSync(dirname(out), { recursive: true });
await img.png({ palette: true, colours: +(o.colours ?? 256), dither: 0.0 }).toFile(out);
const m = await sharp(out).metadata();
console.log(`${o.out}: ${m.width}x${m.height}`);
