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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const [mode, ...rest] = process.argv.slice(2);
const opt = {};
for (let i = 0; i < rest.length; i += 2) opt[rest[i].replace(/^--/, '')] = rest[i + 1];
const num = (k, d) => (opt[k] !== undefined ? Number(opt[k]) : d);

const DEFAULT_DUR = { idle: 200, run: 80, jump: 100, fall: 100, melee: 100, special: 110, hurt: 100, launch: 100, land: 70, melee2: 90, ultimate: 120, respawn: 140, ko: 200, taunt: 160, victory: 180 };

async function padContained(file) {
  const { width } = await sharp(file).metadata();
  const m = Math.round((1024 - width) / 2);
  return sharp(file).flatten({ background: '#ff00ff' }).extend({ top: m, bottom: 1024 - width - m, left: m, right: 1024 - width - m, background: '#ff00ff' }).png().toBuffer();
}

async function load(path, crop) {
  let s = sharp(path).ensureAlpha(); // path may be a Buffer
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
 * body centre x=512), removes the background and writes a packed, trimmed atlas <id>.webp + Aseprite-style <id>.json.
 * Every frame is a logical --frame square (the whole 1024 canvas at --scale); only the drawn part is stored.
 *   node tools/art/import.mjs frames --dir art-raw/heroes/zac --id zac --frame 512 --scale 0.5 --tags idle:4,run:6,... --fix tools/art/rescale.json
 * --fix: per-frame size factors (tools/art/rescale.json, made with measure.mjs + heads.mjs). Codex draws frames at different sizes;
 *        each frame is resized by its factor (times the character's "_all" factor) so the head is the same size in every pose.
 *        Grounded frames are resized around their own lowest pixel and stood on the ground line; airborne ones around the ground point.
 */
async function runFrames() {
  const F = num('frame', 512);
  const S = num('scale', 0.5); // game art px per raw px
  // tag syntax: name:n, or name=file:n when the raw files use another prefix (run=walk:4 reads walk_1..4.png),
  // or name=file@start:n to start at another frame (apex=jump@2:1 reads jump_2.png only)
  let tags = opt.tags.split(',').map((t) => {
    const [left, n] = t.split(':');
    const [name, src] = left.split('=');
    const [file, start] = (src ?? name).split('@');
    return { name, file, start: Number(start ?? 1), n: Number(n) };
  });
  // --skip victory_2,ultimate_4 : raw frames that are wrong art (leave them out; the tag just gets shorter, an empty tag is dropped)
  const skip = (opt.skip ?? '').split(',').filter(Boolean);
  for (const t of tags) { t.ks = Array.from({ length: t.n }, (_, i) => i + t.start).filter((k) => !skip.includes(`${t.file}_${k}`)); t.n = t.ks.length; }
  tags = tags.filter((t) => t.n > 0);
  const total = tags.reduce((n, t) => n + t.n, 0);
  const abs = (p) => (p.startsWith('/') || /^[A-Za-z]:/.test(p) ? p : `${root}${p}`);
  const dir = abs(opt.dir);
  const fixAll = opt.fix ? JSON.parse(readFileSync(abs(opt.fix), 'utf8')) : {};
  const fix = fixAll[opt.id] ?? {}, all = fixAll._all?.[opt.id] ?? 1;
  const AIR = ['jump', 'apex', 'fall', 'launch', 'aspecial'];
  const SNAP = 70; // grounded frames whose lowest pixel is within this many raw px of the ground line are stood on it
  const cells = [], warnings = [];
  for (const t of tags) for (const k of t.ks) {
    const base = `${dir}/${t.file}_${k}`;
    const img = await load(existsSync(`${base}_contained.png`) ? await padContained(`${base}_contained.png`) : `${base}.png`); // Codex "_contained" = re-done frame that fits the canvas margin
    removeBg(img, [255, 0, 255], num('tol', 38));
    const bb = bbox(img), name = `${t.file}_${k}`;
    if (!bb) { warnings.push(`${name} is empty`); cells.push({ name, tag: t.name, art: null }); continue; }
    const f = (fix[name] ?? 1) * all, k1024 = 1024 / img.h;
    const bottom = (bb.y + bb.h) * k1024;
    const air = AIR.includes(t.name);
    const ay = air ? 960 : bottom; // raw point that stays put while resizing
    const ty = air || Math.abs(bottom - 960) <= SNAP ? 960 : bottom; // where that point ends up
    // one resample straight from the raw image: crop to the drawn part, resize by factor x scale
    const z = f * S * k1024; // raw px -> 1024-canvas px (k1024) -> game px; frames not drawn on a 1024 canvas (lachlan run_3 is 1254) must be normalised, not inflated
    const sw = Math.max(1, Math.round(bb.w * z)), sh = Math.max(1, Math.round(bb.h * z));
    const scaled = await scale(sub(img, bb), sw, sh, true);
    const x = Math.round(F / 2 + (bb.x * k1024 - 512) * f * S);
    const y = Math.round(F - F / 128 + ((bb.y * k1024 - ay) * f + (ty - 960)) * S); // soles 1/128 of a frame above the bottom edge (2px at 256)
    if (x < 0 || y < 0 || x + sw > F || y + sh > F) warnings.push(`${name} does not fit the frame at x${f.toFixed(2)} (clipped)`);
    if (!air && Math.abs(bottom - 960) > SNAP && !['ultimate', 'special', 'scharge', 'ko', 'respawn', 'intro', 'defeat'].includes(t.name)) warnings.push(`${name}: lowest pixel is ${Math.round(bottom - 960)}px from the ground line, left as drawn`);
    cells.push({ name, tag: t.name, art: scaled, x, y, f });
  }
  // clip to the logical frame, then shelf-pack (tallest first) with a 2px gap so linear filtering never bleeds a neighbour in
  for (const c of cells) {
    if (!c.art) { c.art = blank(1, 1); c.x = 0; c.y = 0; continue; }
    const x0 = Math.max(0, c.x), y0 = Math.max(0, c.y), x1 = Math.min(F, c.x + c.art.w), y1 = Math.min(F, c.y + c.art.h);
    if (x0 !== c.x || y0 !== c.y || x1 !== c.x + c.art.w || y1 !== c.y + c.art.h) { c.art = sub(c.art, { x: x0 - c.x, y: y0 - c.y, w: x1 - x0, h: y1 - y0 }); c.x = x0; c.y = y0; }
  }
  const W = num('atlas', 2048), GAP = 2;
  let px = GAP, py = GAP, rowH = 0;
  for (const c of [...cells].sort((p, q) => q.art.h - p.art.h)) {
    if (px + c.art.w + GAP > W) { px = GAP; py += rowH + GAP; rowH = 0; }
    c.ax = px; c.ay = py; px += c.art.w + GAP; rowH = Math.max(rowH, c.art.h);
  }
  const H = py + rowH + GAP;
  const atlas = blank(W, H);
  for (const c of cells) blit(atlas, c.art, c.ax, c.ay);
  mkdirSync(`${root}public/assets/sprites`, { recursive: true });
  await sharp(Buffer.from(atlas.d), { raw: { width: W, height: H, channels: 4 } }).webp({ quality: num('quality', 84), alphaQuality: 100, effort: 5 }).toFile(`${root}public/assets/sprites/${opt.id}.webp`);
  const durOverride = opt.dur ? Object.fromEntries(opt.dur.split(',').map((p) => p.split(':'))) : {};
  const frames = [], frameTags = [];
  let n = 0;
  for (const t of tags) {
    frameTags.push({ name: `${opt.id}:${t.name}`, from: n, to: n + t.n - 1, direction: 'forward' });
    for (let k = 0; k < t.n; k++, n++) {
      const c = cells[n];
      frames.push({ filename: String(n), frame: { x: c.ax, y: c.ay, w: c.art.w, h: c.art.h }, rotated: false, trimmed: true, spriteSourceSize: { x: c.x, y: c.y, w: c.art.w, h: c.art.h }, sourceSize: { w: F, h: F }, duration: Number(durOverride[t.name] ?? DEFAULT_DUR[t.name] ?? 100) });
    }
  }
  writeFileSync(`${root}public/assets/sprites/${opt.id}.json`, JSON.stringify({ frames, meta: { app: 'tran-tech-brawl/tools/art/import.mjs', version: '2', image: `${opt.id}.webp`, format: 'RGBA8888', size: { w: W, h: H }, scale: '1', frameTags } }));
  // preview: every logical frame on a grid at half size, with the ground line, so size and footing can be judged at a glance
  const P = 256, cols = 8, kp = P / F, comp = [];
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i], gx = (i % cols) * P, gy = Math.floor(i / cols) * P;
    const w = Math.max(1, Math.round(c.art.w * kp)), h = Math.max(1, Math.round(c.art.h * kp));
    comp.push({ input: await sharp(Buffer.from(c.art.d), { raw: { width: c.art.w, height: c.art.h, channels: 4 } }).resize(w, h).png().toBuffer(), left: gx + Math.min(P - w, Math.round(c.x * kp)), top: gy + Math.min(P - h, Math.round(c.y * kp)) });
    comp.push({ input: Buffer.from(`<svg width="${P}" height="${P}" xmlns="http://www.w3.org/2000/svg"><line x1="0" x2="${P}" y1="${P - 2}" y2="${P - 2}" stroke="#fff" stroke-opacity="0.25"/><text x="4" y="13" font-family="Arial" font-size="11" fill="#cbd5e1">${c.name}${c.f && Math.abs(c.f - 1) > 0.005 ? ' x' + c.f.toFixed(2) : ''}</text></svg>`), left: gx, top: gy });
  }
  await sharp({ create: { width: cols * P, height: Math.ceil(cells.length / cols) * P, channels: 3, background: { r: 58, g: 66, b: 86 } } }).composite(comp).png().toFile(`${root}docs/art/${opt.id}-preview.png`);
  console.log(`frames ${opt.id}: ${total} frames, atlas ${W}x${H}`);
  for (const w of warnings) console.warn('WARN', w);
}

/**
 * Single-pose stand-in from a design turnaround (until the hero's animation frames exist): finds the full-body figures
 * (left to right), takes the --pick'th one (default 2 = side view), optional --flip 1 so it faces right, scales it to
 * --height game px and writes a one-frame <id>.png + <id>.json tagged idle. Fighter.ts then leans/tumbles it in code.
 *   node tools/art/import.mjs pose --in art-raw/heroes/aiden/sheet_turnaround.png --id aiden --frame 160 --height 96
 */
async function runPose() {
  const F = num('frame', 160);
  const standH = num('height', 96);
  const src = await load(opt.in, opt.crop);
  removeBg(src, [255, 0, 255], num('tol', 38));
  const segs = segment(src, num('gap', 10), num('rowgap', 8)).flat();
  const tallest = Math.max(...segs.map((r) => r.h));
  const bodies = segs.filter((r) => r.h >= tallest * 0.8).sort((a, b) => a.x - b.x);
  const r = bodies[num('pick', 2) - 1];
  if (!r) throw new Error(`only ${bodies.length} full-body figures found; adjust --pick or --gap`);
  let art = sub(src, r);
  if (opt.flip === '1') {
    const f = blank(art.w, art.h);
    for (let y = 0; y < art.h; y++) for (let x = 0; x < art.w; x++)
      for (let c = 0; c < 4; c++) f.d[(y * art.w + x) * 4 + c] = art.d[(y * art.w + art.w - 1 - x) * 4 + c];
    art = f;
  }
  const s = standH / art.h;
  const scaled = await scale(art, Math.max(1, Math.round(art.w * s)), standH, true);
  if (scaled.w > F) throw new Error(`pose is ${scaled.w}px wide, wider than the ${F}px frame; lower --height`);
  const frame = blank(F, F);
  blit(frame, scaled, Math.round((F - scaled.w) / 2), F - 2 - standH);
  await savePng(frame, `${root}public/assets/sprites/${opt.id}.png`, num('colours', 256));
  writeFileSync(`${root}public/assets/sprites/${opt.id}.json`, JSON.stringify({
    frames: [{ filename: '0', frame: { x: 0, y: 0, w: F, h: F }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: F, h: F }, sourceSize: { w: F, h: F }, duration: 200 }],
    meta: { app: 'tran-tech-brawl/tools/art/import.mjs', version: '1', image: `${opt.id}.png`, format: 'RGBA8888', size: { w: F, h: F }, scale: '1', frameTags: [{ name: `${opt.id}:idle`, from: 0, to: 0, direction: 'forward' }] },
  }));
  await preview(frame, `${root}docs/art/${opt.id}-pose-preview.png`, 2);
  console.log(`pose ${opt.id}: figure ${num('pick', 2)} of ${bodies.length} (${r.w}x${r.h} source) -> ${scaled.w}x${standH} in ${F}x${F}`);
}

if (mode === 'frames') await runFrames();
else if (mode === 'pose') await runPose();
else if (mode === 'portrait') await runPortrait();
else if (mode === 'image') await runImage();
else if (mode === 'fx') await runFx();
else if (mode === 'sheet') await runSheet();
else console.log('usage: node tools/art/import.mjs portrait|sheet --in <image> --id <id> ...');
