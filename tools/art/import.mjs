// Turns ChatGPT (or any) artwork into game-ready pixel assets.
//
//   node tools/art/import.mjs portrait --in concept.webp --crop 110,605,350,360 --id helpdesk [--size 96] [--colours 32]
//   node tools/art/import.mjs sheet    --in poses.png --id helpdesk --cols 8 --rows 3 \
//        --tags idle:4,run:6,jump:1,fall:1,melee:4,special:3,hurt:2,launch:1 [--frame 64] [--height 50] [--colours 32]
//
// Background is removed by flood-filling from the image border (works on a flat chroma colour such as
// magenta, or a plain cream/white backdrop). Each frame is scaled by ONE shared factor, feet-aligned to the
// bottom of the frame, centred on the feet, palette-limited, and written as an Aseprite-style PNG + JSON.
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const [mode, ...rest] = process.argv.slice(2);
const opt = {};
for (let i = 0; i < rest.length; i += 2) opt[rest[i].replace(/^--/, '')] = rest[i + 1];
const num = (k, d) => (opt[k] !== undefined ? Number(opt[k]) : d);

const DEFAULT_DUR = { idle: 200, run: 80, jump: 100, fall: 100, melee: 100, special: 110, hurt: 100, launch: 100, land: 70, melee2: 90, ultimate: 120, respawn: 140, ko: 200, taunt: 160, victory: 180 };

async function load(path, crop) {
  let s = sharp(path).ensureAlpha();
  if (crop) {
    const [left, top, width, height] = crop.split(',').map(Number);
    s = s.extract({ left, top, width, height });
  }
  const { data, info } = await s.raw().toBuffer({ resolveWithObject: true });
  return { d: new Uint8Array(data), w: info.width, h: info.height };
}

function refColor(img) {
  const pts = [[1, 1], [img.w - 2, 1], [1, img.h - 2], [img.w - 2, img.h - 2]];
  const sum = [0, 0, 0];
  for (const [x, y] of pts) for (let c = 0; c < 3; c++) sum[c] += img.d[(y * img.w + x) * 4 + c];
  return sum.map((v) => v / pts.length);
}

function removeBg(img, ref, tol) {
  const { d, w, h } = img;
  const near = (i, t) => Math.max(Math.abs(d[i * 4] - ref[0]), Math.abs(d[i * 4 + 1] - ref[1]), Math.abs(d[i * 4 + 2] - ref[2])) <= t;
  const seen = new Uint8Array(w * h);
  const stack = [];
  // Border seeds must be close to the backdrop colour; the fill then spreads across gentle gradients
  // (small step between neighbours, bounded distance from the backdrop) but never across dark outlines.
  const STEP = num('step', 22), CAP = num('cap', 60);
  const step = (i, j) => Math.max(Math.abs(d[i * 4] - d[j * 4]), Math.abs(d[i * 4 + 1] - d[j * 4 + 1]), Math.abs(d[i * 4 + 2] - d[j * 4 + 2]));
  const push = (x, y, from) => {
    const i = y * w + x;
    if (seen[i]) return;
    if (from === undefined ? !near(i, tol) : !(near(i, CAP) && step(i, from) <= STEP)) return;
    seen[i] = 1;
    stack.push(i);
  };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (stack.length) {
    const i = stack.pop();
    const x = i % w, y = (i / w) | 0;
    if (x > 0) push(x - 1, y, i);
    if (x < w - 1) push(x + 1, y, i);
    if (y > 0) push(x, y - 1, i);
    if (y < h - 1) push(x, y + 1, i);
  }
  // Enclosed pockets of backdrop (inside a cable loop, between an arm and the body): remove large ones only,
  // so small light details like eye whites and glints survive.
  const MIN_HOLE = num('hole', 300);
  const comp = new Uint8Array(w * h);
  for (let s = 0; s < w * h; s++) {
    if (seen[s] || comp[s] || !near(s, 22)) continue;
    const members = [s];
    comp[s] = 1;
    for (let k = 0; k < members.length; k++) {
      const i = members[k];
      const x = i % w, y = (i / w) | 0;
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (seen[j] || comp[j] || !near(j, 45) || step(i, j) > 12) continue;
        comp[j] = 1;
        members.push(j);
      }
    }
    if (members.length >= MIN_HOLE) for (const i of members) seen[i] = 1;
  }
  for (let i = 0; i < w * h; i++) if (seen[i]) d[i * 4 + 3] = 0;
  // Despill the magenta key colour: bright magenta (pockets, anti-aliased edges) is removed; dark magenta
  // fringe on outlines is recoloured to the navy outline colour. Pass --despill 0 for art that is genuinely magenta.
  if (opt.despill !== '0') {
    for (let i = 0; i < w * h; i++) {
      if (!d[i * 4 + 3]) continue;
      const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
      if (g < Math.min(r, b) - 45 && Math.abs(r - b) < 40) {
        if ((r + g + b) / 3 < 120) { d[i * 4] = 20; d[i * 4 + 1] = 20; d[i * 4 + 2] = 43; }
        else d[i * 4 + 3] = 0;
      }
    }
  }
  // fringe pass: light anti-aliased edge pixels that still look like the backdrop
  for (let pass = 0; pass < 2; pass++) {
    const kill = [];
    for (let y = 1; y < h - 1; y++)
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (!d[i * 4 + 3] || !near(i, tol * 1.9)) continue;
        if (!d[(i - 1) * 4 + 3] || !d[(i + 1) * 4 + 3] || !d[(i - w) * 4 + 3] || !d[(i + w) * 4 + 3]) kill.push(i);
      }
    for (const i of kill) d[i * 4 + 3] = 0;
  }
  return img;
}

function bbox(img) {
  let x0 = img.w, y0 = img.h, x1 = -1, y1 = -1;
  for (let y = 0; y < img.h; y++)
    for (let x = 0; x < img.w; x++)
      if (img.d[(y * img.w + x) * 4 + 3]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Split an image into rows of poses using empty gaps. Returns [[rect, rect, ...], ...] (row-major). */
function segment(img, gap, rowGap) {
  const alphaAt = (x, y) => img.d[(y * img.w + x) * 4 + 3] > 0;
  const runs = (has, minGap) => {
    const out = [];
    let start = -1, last = -1;
    for (let i = 0; i <= has.length; i++) {
      if (i < has.length && has[i]) { if (start < 0) start = i; last = i; }
      else if (start >= 0 && (i === has.length || i - last >= minGap)) { out.push([start, last]); start = -1; }
    }
    return out;
  };
  const rowHas = Array.from({ length: img.h }, (_, y) => { for (let x = 0; x < img.w; x++) if (alphaAt(x, y)) return 1; return 0; });
  const rows = [];
  for (const [y0, y1] of runs(rowHas, rowGap)) {
    const colHas = Array.from({ length: img.w }, (_, x) => { for (let y = y0; y <= y1; y++) if (alphaAt(x, y)) return 1; return 0; });
    const rects = [];
    for (const [x0, x1] of runs(colHas, gap)) {
      const bb = bbox(sub(img, { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }));
      if (!bb || bb.w < num('minw', 12) || bb.h < num('minh', 24)) continue; // stray specks
      rects.push({ x: x0 + bb.x, y: y0 + bb.y, w: bb.w, h: bb.h });
    }
    if (rects.length) rows.push(rects);
  }
  return rows;
}

function sub(img, r) {
  const out = { d: new Uint8Array(r.w * r.h * 4), w: r.w, h: r.h };
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++)
    for (let c = 0; c < 4; c++) out.d[(y * r.w + x) * 4 + c] = img.d[((r.y + y) * img.w + r.x + x) * 4 + c];
  return out;
}

async function scale(img, nw, nh, soft = false) {
  const { data } = await sharp(Buffer.from(img.d), { raw: { width: img.w, height: img.h, channels: 4 } })
    .resize(nw, nh, { kernel: 'lanczos3' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const d = new Uint8Array(data);
  if (!soft) for (let i = 3; i < d.length; i += 4) d[i] = d[i] < 128 ? 0 : 255; // hard pixel edges (soft = smooth edges for the finer art style)
  return { d, w: nw, h: nh };
}

function blit(dst, src, ox, oy) {
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
    const dx = ox + x, dy = oy + y;
    if (dx < 0 || dy < 0 || dx >= dst.w || dy >= dst.h) continue;
    const s = (y * src.w + x) * 4;
    if (!src.d[s + 3]) continue;
    const t = (dy * dst.w + dx) * 4;
    for (let c = 0; c < 4; c++) dst.d[t + c] = src.d[s + c];
  }
}

const blank = (w, h) => ({ d: new Uint8Array(w * h * 4), w, h });

async function savePng(img, path, colours) {
  mkdirSync(dirname(path), { recursive: true });
  await sharp(Buffer.from(img.d), { raw: { width: img.w, height: img.h, channels: 4 } })
    .png({ palette: true, colours, dither: 0 })
    .toFile(path);
}

async function preview(img, path, factor, bg = { r: 58, g: 66, b: 86 }) {
  mkdirSync(dirname(path), { recursive: true });
  await sharp(Buffer.from(img.d), { raw: { width: img.w, height: img.h, channels: 4 } })
    .resize(img.w * factor, img.h * factor, { kernel: 'nearest' })
    .flatten({ background: bg })
    .png()
    .toFile(path);
}

async function runPortrait() {
  const size = num('size', 96);
  const src = await load(opt.in, opt.crop);
  removeBg(src, refColor(src), num('tol', 38));
  const bb = bbox(src);
  if (!bb) throw new Error('nothing left after background removal');
  const s = Math.min(size / bb.w, size / bb.h);
  const art = await scale(sub(src, bb), Math.max(1, Math.round(bb.w * s)), Math.max(1, Math.round(bb.h * s)), opt.soft === "1");
  const out = blank(size, size);
  blit(out, art, Math.round((size - art.w) / 2), size - art.h);
  const dest = `${root}public/assets/portraits/${opt.id}.png`;
  await savePng(out, dest, num('colours', 32));
  await preview(out, `${root}docs/art/${opt.id}-portrait-preview.png`, 4);
  console.log(`portrait ${opt.id}: ${bb.w}x${bb.h} -> ${art.w}x${art.h} in ${size}x${size}`);
}

async function runSheet() {
  const F = num('frame', 64);
  const standH = num('height', 50);
  const cols = num('cols', 8), rows = num('rows', 3);
  const tags = opt.tags.split(',').map((t) => { const [name, n] = t.split(':'); return { name, n: Number(n) }; });
  const total = tags.reduce((n, t) => n + t.n, 0);
  const src = await load(opt.in, opt.crop);
  removeBg(src, refColor(src), num('tol', 38));

  const cells = [];
  if (opt.auto) {
    // Free-form layout: find rows, then poses inside each row, by gaps in the artwork.
    const rects = segment(src, num('gap', 10), num('rowgap', 8));
    console.log('segments per row:', rects.map((r) => r.length).join(', '));
    const flat = rects.flat();
    if (flat.length !== total) throw new Error(`found ${flat.length} poses but --tags adds up to ${total}; adjust --gap or --crop`);
    for (const r of flat) cells.push({ art: sub(src, r), bb: r });
  } else {
    const cw = Math.floor(src.w / cols), ch = Math.floor(src.h / rows);
    for (let i = 0; i < total; i++) {
      const cell = sub(src, { x: (i % cols) * cw, y: Math.floor(i / cols) * ch, w: cw, h: ch });
      const bb = bbox(cell);
      if (!bb) throw new Error(`frame ${i} is empty: check --cols/--rows`);
      cells.push({ art: sub(cell, bb), bb });
    }
  }
  const s = standH / cells[0].bb.h; // ONE scale for every frame, taken from the first idle pose
  const strip = blank(total * F, F);
  const warnings = [];
  for (let i = 0; i < total; i++) {
    const { art } = cells[i];
    const sw = Math.max(1, Math.round(art.w * s)), sh = Math.max(1, Math.round(art.h * s));
    const scaled = await scale(art, sw, sh);
    // anchor on the feet: mean x of opaque pixels in the bottom quarter
    let sum = 0, cnt = 0;
    for (let y = Math.floor(sh * 0.85); y < sh; y++)
      for (let x = 0; x < sw; x++) {
        const p = (y * sw + x) * 4;
        if (!scaled.d[p + 3]) continue;
        const [r, g, b] = [scaled.d[p], scaled.d[p + 1], scaled.d[p + 2]];
        if (Math.min(r, g, b) > 140 || (b > r + 50 && b > 140)) continue; // ignore bright swoosh / glow effects
        sum += x; cnt++;
      }
    const anchor = cnt ? sum / cnt : sw / 2;
    const ox = Math.round(F / 2 - anchor), oy = F - 2 - sh; // soles on row F-2
    if (ox < 0 || ox + sw > F || oy < 0) warnings.push(`frame ${i} is clipped (${sw}x${sh}); try a smaller --height`);
    const f = blank(F, F);
    blit(f, scaled, ox, oy);
    blit(strip, f, i * F, 0);
  }

  await savePng(strip, `${root}public/assets/sprites/${opt.id}.png`, num('colours', 32));
  const durOverride = opt.dur ? Object.fromEntries(opt.dur.split(',').map((p) => p.split(':'))) : {};
  const frames = [], frameTags = [];
  let n = 0;
  for (const t of tags) {
    frameTags.push({ name: `${opt.id}:${t.name}`, from: n, to: n + t.n - 1, direction: 'forward' });
    for (let k = 0; k < t.n; k++, n++)
      frames.push({
        filename: String(n), frame: { x: n * F, y: 0, w: F, h: F }, rotated: false, trimmed: false,
        spriteSourceSize: { x: 0, y: 0, w: F, h: F }, sourceSize: { w: F, h: F },
        duration: Number(durOverride[t.name] ?? DEFAULT_DUR[t.name] ?? 100),
      });
  }
  writeFileSync(`${root}public/assets/sprites/${opt.id}.json`, JSON.stringify({
    frames, meta: { app: 'tran-tech-brawl/tools/art/import.mjs', version: '1', image: `${opt.id}.png`, format: 'RGBA8888', size: { w: strip.w, h: F }, scale: '1', frameTags },
  }));

  // contact sheet preview
  const pc = 8, pr = Math.ceil(total / pc);
  const grid = blank(pc * F, pr * F);
  for (let i = 0; i < total; i++) blit(grid, sub(strip, { x: i * F, y: 0, w: F, h: F }), (i % pc) * F, Math.floor(i / pc) * F);
  await preview(grid, `${root}docs/art/${opt.id}-preview.png`, 4);
  console.log(`sheet ${opt.id}: ${total} frames, scale ${s.toFixed(3)}`);
  for (const w of warnings) console.warn('WARN', w);
}

/** Single image (background layer, platform): crop, optional bg removal (--keepbg 1 to keep it), optional --scale. */
async function runImage() {
  const src = await load(opt.in, opt.crop);
  let out = src;
  if (opt.keepbg !== '1') {
    removeBg(src, refColor(src), num('tol', 38));
    const bb = bbox(src);
    if (!bb) throw new Error('nothing left after background removal');
    out = sub(src, bb);
  }
  const s = num('scale', 1);
  if (s !== 1) out = await scale(out, Math.max(1, Math.round(out.w * s)), Math.max(1, Math.round(out.h * s)));
  const dir = opt.dir ?? 'stages';
  await savePng(out, `${root}public/assets/${dir}/${opt.id}.png`, num('colours', 64));
  console.log(`image ${dir}/${opt.id}: ${out.w}x${out.h}`);
}

/** Effect strip: auto-segment poses, scale, centre each in an equal cell, write a plain spritesheet. */
async function runFx() {
  const src = await load(opt.in, opt.crop);
  removeBg(src, refColor(src), num('tol', 38));
  const rects = segment(src, num('gap', 6), num('rowgap', 6)).flat();
  const s = num('scale', 0.5);
  const arts = [];
  for (const r of rects) arts.push(await scale(sub(src, r), Math.max(1, Math.round(r.w * s)), Math.max(1, Math.round(r.h * s))));
  const cw = Math.max(...arts.map((a) => a.w)), ch = Math.max(...arts.map((a) => a.h));
  const strip = blank(cw * arts.length, ch);
  arts.forEach((a, i) => blit(strip, a, i * cw + Math.round((cw - a.w) / 2), Math.round((ch - a.h) / 2)));
  await savePng(strip, `${root}public/assets/fx/${opt.id}.png`, num('colours', 32));
  console.log(`fx ${opt.id}: ${arts.length} frames of ${cw}x${ch}`);
}

/**
 * One-image-per-frame import (Codex workflow). Reads art-raw/<dir>/<tag>_<n>.png (1024x1024, magenta bg, feet on y=960,
 * body centre x=512, same scale every frame), removes the background, scales the WHOLE canvas by ONE factor (taken from
 * idle_1's height so --height is the standing height in game pixels) and writes the usual <id>.png + <id>.json strip.
 *   node tools/art/import.mjs frames --dir art-raw/heroes/zac --id zac --frame 128 --height 52 \
 *        --tags idle:4,run:6,jump:1,fall:1,melee:4,special:3,hurt:2,launch:1
 */
async function runFrames() {
  const F = num('frame', 128);
  const standH = num('height', 52);
  const tags = opt.tags.split(',').map((t) => { const [name, n] = t.split(':'); return { name, n: Number(n) }; });
  const total = tags.reduce((n, t) => n + t.n, 0);
  const dir = opt.dir.startsWith('/') || /^[A-Za-z]:/.test(opt.dir) ? opt.dir : `${root}${opt.dir}`;
  const imgs = [];
  for (const t of tags) for (let k = 1; k <= t.n; k++) {
    const img = await load(`${dir}/${t.name}_${k}.png`);
    removeBg(img, [255, 0, 255], num('tol', 38));
    imgs.push({ img, tag: t.name, k, bb: bbox(img) });
  }
  const ref = imgs.find((f) => f.tag === 'idle' && f.k === 1) ?? imgs[0];
  const s = opt.scale ? Number(opt.scale) : standH / ref.bb.h; // one scale for the whole character (--scale = game px per source px)
  const cols = num('cols', 8), rows = Math.ceil(total / cols);
  const strip = blank(cols * F, rows * F);
  const warnings = [];
  for (let i = 0; i < imgs.length; i++) {
    const { img, tag, k, bb } = imgs[i];
    if (!bb) { warnings.push(`${tag}_${k} is empty`); continue; }
    const nw = Math.round(img.w * s), nh = Math.round(img.h * s);
    const scaled = await scale(img, nw, nh, opt.soft !== '0');
    const ox = Math.round(F / 2 - (img.w / 2) * s), oy = Math.round(F - 2 - (960 * img.h / 1024) * s);
    const f = blank(F, F);
    blit(f, scaled, ox, oy);
    const fb = bbox(f);
    if (!fb || fb.x <= 0 || fb.y <= 0 || fb.x + fb.w >= F) warnings.push(`${tag}_${k} is clipped by the frame: scale/position drift, redraw smaller or lower --height`);
    const grounded = !['jump', 'fall', 'launch', 'ultimate', 'special', 'ko'].includes(tag);
    if (grounded && Math.abs((bb.y + bb.h) * 1024 / img.h - 960) > 28) warnings.push(`${tag}_${k}: feet are ${Math.round((bb.y + bb.h) * 1024 / img.h - 960)}px from the y=960 baseline (canvas px)`);
    if (Math.abs(bb.h / ref.bb.h - 1) > 0.18 && grounded && tag !== 'melee' && tag !== 'land') warnings.push(`${tag}_${k}: height is ${Math.round((bb.h / ref.bb.h) * 100)}% of idle_1: scale drift`);
    blit(strip, f, (i % cols) * F, Math.floor(i / cols) * F);
  }
  await savePng(strip, `${root}public/assets/sprites/${opt.id}.png`, num('colours', 256));
  const durOverride = opt.dur ? Object.fromEntries(opt.dur.split(',').map((p) => p.split(':'))) : {};
  const frames = [], frameTags = [];
  let n = 0;
  for (const t of tags) {
    frameTags.push({ name: `${opt.id}:${t.name}`, from: n, to: n + t.n - 1, direction: 'forward' });
    for (let k = 0; k < t.n; k++, n++)
      frames.push({ filename: String(n), frame: { x: (n % cols) * F, y: Math.floor(n / cols) * F, w: F, h: F }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: F, h: F }, sourceSize: { w: F, h: F }, duration: Number(durOverride[t.name] ?? DEFAULT_DUR[t.name] ?? 100) });
  }
  writeFileSync(`${root}public/assets/sprites/${opt.id}.json`, JSON.stringify({ frames, meta: { app: 'tran-tech-brawl/tools/art/import.mjs', version: '1', image: `${opt.id}.png`, format: 'RGBA8888', size: { w: strip.w, h: strip.h }, scale: '1', frameTags } }));
  await preview(strip, `${root}docs/art/${opt.id}-preview.png`, 1);
  console.log(`frames ${opt.id}: ${total} frames, scale ${s.toFixed(4)} (idle_1 is ${ref.bb.h}px tall in the source)`);
  for (const w of warnings) console.warn('WARN', w);
}

if (mode === 'frames') await runFrames();
else if (mode === 'portrait') await runPortrait();
else if (mode === 'image') await runImage();
else if (mode === 'fx') await runFx();
else if (mode === 'sheet') await runSheet();
else console.log('usage: node tools/art/import.mjs portrait|sheet --in <image> --id <id> ...');
