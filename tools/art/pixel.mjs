// Tiny pixel-art toolkit: draw primitives, auto-outline, write Aseprite-format sheets.
import { deflateSync, crc32 } from 'node:zlib';
import { writeFileSync } from 'node:fs';

export const hex = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255, 255];

export class Canvas {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.d = new Uint8Array(w * h * 4);
  }
  set(x, y, c) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const o = (y * this.w + x) * 4;
    this.d[o] = c[0]; this.d[o + 1] = c[1]; this.d[o + 2] = c[2]; this.d[o + 3] = c[3];
  }
  alpha(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.d[(y * this.w + x) * 4 + 3];
  }
  rect(x, y, w, h, c) {
    x = Math.round(x); y = Math.round(y);
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.set(xx, yy, c);
  }
  ellipse(cx, cy, rx, ry, c) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++)
        if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) this.set(x, y, c);
  }
  /** Thick line made of w×w squares. */
  line(x0, y0, x1, y1, w, c) {
    const n = Math.max(1, Math.round(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n;
      const y = y0 + ((y1 - y0) * i) / n;
      this.rect(Math.round(x - w / 2 + 0.5), Math.round(y - w / 2 + 0.5), w, w, c);
    }
  }
  /** 1px outline around everything currently drawn (4-neighbour). */
  outline(c) {
    const add = [];
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (this.alpha(x, y)) continue;
        if (this.alpha(x - 1, y) || this.alpha(x + 1, y) || this.alpha(x, y - 1) || this.alpha(x, y + 1)) add.push([x, y]);
      }
    for (const [x, y] of add) this.set(x, y, c);
  }
  blit(src, ox, oy) {
    for (let y = 0; y < src.h; y++)
      for (let x = 0; x < src.w; x++) {
        const o = (y * src.w + x) * 4;
        if (src.d[o + 3]) this.set(ox + x, oy + y, [src.d[o], src.d[o + 1], src.d[o + 2], src.d[o + 3]]);
      }
  }
  /** Nearest-neighbour upscale over a solid background (for preview images). */
  scaled(n, bg) {
    const out = new Canvas(this.w * n, this.h * n);
    for (let y = 0; y < out.h; y++)
      for (let x = 0; x < out.w; x++) {
        const o = (Math.floor(y / n) * this.w + Math.floor(x / n)) * 4;
        const a = this.d[o + 3] ? [this.d[o], this.d[o + 1], this.d[o + 2], 255] : bg;
        out.set(x, y, a);
      }
    return out;
  }
}

export function pngBuffer(cv) {
  const stride = cv.w * 4 + 1;
  const raw = Buffer.alloc(stride * cv.h);
  for (let y = 0; y < cv.h; y++) Buffer.from(cv.d.buffer, y * cv.w * 4, cv.w * 4).copy(raw, y * stride + 1);
  const chunk = (t, d) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(d.length);
    const td = Buffer.concat([Buffer.from(t), d]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(cv.w, 0); ihdr.writeUInt32BE(cv.h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/**
 * anims: [{ tag: 'idle', frames: [{ canvas, duration }] }]
 * Writes <outBase>.png + <outBase>.json in Aseprite "Array" format with frameTags.
 */
export function writeAsepriteSheet(outBase, id, frameSize, anims) {
  const total = anims.reduce((n, a) => n + a.frames.length, 0);
  const sheet = new Canvas(total * frameSize, frameSize);
  const frames = [];
  const frameTags = [];
  let n = 0;
  for (const a of anims) {
    frameTags.push({ name: `${id}:${a.tag}`, from: n, to: n + a.frames.length - 1, direction: 'forward' });
    for (const f of a.frames) {
      sheet.blit(f.canvas, n * frameSize, 0);
      frames.push({
        filename: String(n),
        frame: { x: n * frameSize, y: 0, w: frameSize, h: frameSize },
        rotated: false, trimmed: false,
        spriteSourceSize: { x: 0, y: 0, w: frameSize, h: frameSize },
        sourceSize: { w: frameSize, h: frameSize },
        duration: f.duration,
      });
      n++;
    }
  }
  writeFileSync(`${outBase}.png`, pngBuffer(sheet));
  writeFileSync(
    `${outBase}.json`,
    JSON.stringify({ frames, meta: { app: 'tran-tech-brawl/tools/art', version: '1', image: `${id}.png`, format: 'RGBA8888', size: { w: sheet.w, h: sheet.h }, scale: '1', frameTags } }),
  );
  return { total, sheet };
}
