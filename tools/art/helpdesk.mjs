// Generates the Helpdesk Hero sprite sheet (64x64 frames, feet on the bottom edge, facing right).
//   node tools/art/helpdesk.mjs
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import { Canvas, hex, writeAsepriteSheet, pngBuffer } from './pixel.mjs';

const F = 64;
const G = 62; // boot soles (outline lands on row 63)
const HIP = 47;

const P = {
  navy: hex(0x14142b),
  skin: hex(0xf3b78e), skinS: hex(0xc98760), blush: hex(0xe58f78),
  hair: hex(0x7b4524), hairL: hex(0xa6683a),
  polo: hex(0x2b2b45), poloL: hex(0x41415f), poloS: hex(0x1d1d33),
  pants: hex(0x3d3550), pantsS: hex(0x2c263c),
  boot: hex(0xe8921f), bootL: hex(0xffb445), bootS: hex(0xa85a10),
  gold: hex(0xf5c132), goldS: hex(0xb98a1c),
  belt: hex(0x5a3d1f),
  kb: hex(0x2c2c3b), kbL: hex(0x4a4a5e),
  white: hex(0xffffff), mouth: hex(0x7a2f2f),
};

const base = {
  dx: 0, dy: 0, lean: 0, headDy: 0,
  fF: [5, 0], fB: [-5, 0],
  hF: [10, -9], hB: [-7, -3],
  kb: -70, face: 'happy',
};

function draw(pose) {
  const p = { ...base, ...pose };
  const c = new Canvas(F, F);
  const cx = 29 + p.dx;
  const hipY = HIP + p.dy;
  const shoulderY = hipY - 12;

  const leg = (f, shade) => {
    const ax = cx + f[0];
    const ay = G - 4 - f[1];
    c.line(cx + (shade ? -2 : 2), hipY, ax, ay, 6, shade ? P.pantsS : P.pants);
    c.rect(ax - 3, ay, 9, 5, shade ? P.bootS : P.boot);
    c.rect(ax - 3, ay, 9, 1, shade ? P.boot : P.bootL);
    c.rect(ax - 3, ay + 4, 9, 1, P.bootS);
  };

  const arm = (sx, h, shade) => {
    const hx = cx + h[0];
    const hy = hipY + h[1];
    const mx = sx + (hx - sx) * 0.42;
    const my = shoulderY + (hy - shoulderY) * 0.42;
    c.line(sx, shoulderY, mx, my, 5, shade ? P.poloS : P.polo);
    c.line(mx, my, hx, hy, 4, shade ? P.skinS : P.skin);
    c.rect(hx - 2, hy - 2, 4, 4, shade ? P.skinS : P.skin);
    return [hx, hy];
  };

  // back arm and back leg
  arm(cx - 4, p.hB, true);
  leg(p.fB, true);

  // torso
  c.rect(cx - 7, hipY - 15, 14, 16, P.polo);
  c.rect(cx - 7, hipY - 15, 2, 16, P.poloL);
  c.rect(cx + 5, hipY - 15, 2, 16, P.poloS);
  c.set(cx - 7, hipY - 15, [0, 0, 0, 0]);
  c.set(cx + 6, hipY - 15, [0, 0, 0, 0]);
  c.rect(cx - 7, hipY - 1, 14, 2, P.belt);
  c.rect(cx + 1, hipY - 1, 3, 2, P.gold);
  // wrench logo
  for (const [lx, ly] of [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]]) c.set(cx + 1 + lx, hipY - 10 + ly, P.gold);
  // utility pouch
  c.rect(cx + 3, hipY, 5, 6, P.boot);
  c.rect(cx + 3, hipY, 5, 1, P.bootL);
  c.rect(cx + 3, hipY + 5, 5, 1, P.bootS);

  // front leg
  leg(p.fF, false);

  // head
  const hx = cx + 1 + p.lean;
  const top = hipY - 27 + p.headDy;
  c.rect(hx - 8, top, 16, 14, P.skin);
  c.rect(hx - 8, top + 13, 16, 1, P.skinS);
  c.set(hx - 8, top, [0, 0, 0, 0]); c.set(hx + 7, top, [0, 0, 0, 0]);
  c.set(hx - 8, top + 13, [0, 0, 0, 0]); c.set(hx + 7, top + 13, [0, 0, 0, 0]);
  // hair: cap, back, spikes, fringe
  c.rect(hx - 8, top - 1, 16, 6, P.hair);
  c.rect(hx - 8, top + 4, 4, 5, P.hair);
  for (const [sx, sh] of [[-7, 4], [-2, 5], [3, 4]]) c.rect(hx + sx, top - 1 - sh, 4, sh, P.hair);
  c.rect(hx - 6, top - 5, 2, 2, P.hairL);
  c.rect(hx - 1, top - 6, 2, 2, P.hairL);
  c.rect(hx + 4, top + 4, 3, 1, P.hair); // fringe
  c.rect(hx + 5, top + 5, 2, 1, P.hair);
  // face
  c.rect(hx + 5, top + 9, 2, 1, P.blush);
  if (p.face === 'hurt') {
    c.rect(hx + 2, top + 6, 4, 1, P.navy); // closed eye
    c.rect(hx + 3, top + 10, 3, 3, P.mouth);
  } else {
    c.rect(hx + 2, top + 6, 3, 3, P.white);
    c.rect(hx + 4, top + 6, 2, 3, P.navy);
    c.rect(hx + 2, top + 4, 4, 1, P.hairL); // brow
    if (p.face === 'shout') c.rect(hx + 2, top + 10, 4, 3, P.mouth);
    else {
      c.rect(hx + 3, top + 11, 3, 1, P.mouth);
      c.set(hx + 2, top + 10, P.mouth);
      c.set(hx + 6, top + 10, P.mouth);
    }
  }
  // headset: ear cup, band, mic boom
  c.rect(hx - 5, top + 5, 4, 5, P.gold);
  c.rect(hx - 5, top + 9, 4, 1, P.goldS);
  c.rect(hx - 4, top - 1, 9, 1, P.gold);
  c.rect(hx - 4, top, 1, 5, P.gold);
  c.line(hx - 3, top + 9, hx + 1, top + 12, 1, P.gold);
  c.rect(hx + 1, top + 12, 2, 2, P.goldS);

  // front arm + keyboard
  const [fx, fy] = arm(cx + 5, p.hF, false);
  if (p.kb !== null && p.kb !== undefined) {
    const a = (p.kb * Math.PI) / 180;
    const tx = fx + Math.cos(a) * 15;
    const ty = fy + Math.sin(a) * 15;
    c.line(fx, fy, tx, ty, 6, P.kb);
    c.line(fx + Math.cos(a) * 3, fy + Math.sin(a) * 3, fx + Math.cos(a) * 13, fy + Math.sin(a) * 13, 2, P.gold);
    c.line(fx, fy - 2, tx, ty - 2, 1, P.kbL);
    c.rect(fx - 2, fy - 2, 4, 4, P.skin); // fingers over the handle
  }

  c.outline(P.navy);
  return c;
}

const run = (n, f) => Array.from({ length: n }, (_, k) => f(k, n));

const anims = [
  { tag: 'idle', frames: [[0, 0], [0, 0], [0, 1], [0, 1]].map(([_, b]) => ({ canvas: draw({ dy: b, headDy: b ? 0 : 0, hF: [10, -9 + (b ? 1 : 0)] }), duration: 220 })) },
  {
    tag: 'run',
    frames: run(6, (k, n) => {
      const ph = (k / n) * Math.PI * 2;
      const lift = (s) => Math.max(0, Math.round(6 * Math.sin(s)));
      return {
        canvas: draw({
          dx: 2, lean: 2, dy: -Math.round(Math.abs(Math.sin(ph)) * 2),
          fF: [Math.round(8 * Math.cos(ph)), lift(ph)], fB: [Math.round(8 * Math.cos(ph + Math.PI)), lift(ph + Math.PI)],
          hF: [9, -10], hB: [Math.round(-6 + 5 * Math.cos(ph)), -4], kb: -45,
        }),
        duration: 80,
      };
    }),
  },
  { tag: 'jump', frames: [{ canvas: draw({ dy: -1, fF: [4, 9], fB: [-3, 6], hF: [9, -17], hB: [-9, -13], kb: -85 }), duration: 100 }] },
  { tag: 'fall', frames: [{ canvas: draw({ fF: [7, 5], fB: [-7, 3], hF: [10, -19], hB: [-10, -15], kb: -105, lean: 1 }), duration: 100 }] },
  {
    tag: 'melee',
    frames: [
      { canvas: draw({ dx: -2, lean: -2, hF: [-2, -21], kb: -155, fF: [7, 0], fB: [-7, 0] }), duration: 100 },
      { canvas: draw({ dx: 1, lean: 1, hF: [8, -18], kb: -60, fF: [8, 0], fB: [-7, 0] }), duration: 60 },
      { canvas: draw({ dx: 4, lean: 3, hF: [15, -8], kb: 8, fF: [11, 0], fB: [-8, 0], face: 'shout' }), duration: 100 },
      { canvas: draw({ dx: 2, lean: 2, hF: [12, -4], kb: 50, fF: [8, 0], fB: [-6, 0] }), duration: 140 },
    ],
  },
  {
    tag: 'special',
    frames: [
      { canvas: draw({ dx: -1, hF: [5, -10], hB: [2, -9], kb: null }), duration: 110 },
      { canvas: draw({ dx: 3, lean: 2, hF: [17, -12], hB: [-4, -8], kb: null, fF: [9, 0], fB: [-7, 0], face: 'shout' }), duration: 110 },
      { canvas: draw({ dx: 1, hF: [11, -8], hB: [-5, -4], kb: null }), duration: 120 },
    ],
  },
  {
    tag: 'hurt',
    frames: [
      { canvas: draw({ dx: -2, lean: -3, headDy: 1, hF: [-6, -12], hB: [-11, -6], kb: null, face: 'hurt', fF: [2, 0], fB: [-8, 0] }), duration: 90 },
      { canvas: draw({ dx: -3, lean: -3, headDy: 1, hF: [-7, -10], hB: [-12, -5], kb: null, face: 'hurt', fF: [1, 0], fB: [-9, 0] }), duration: 120 },
    ],
  },
  { tag: 'launch', frames: [{ canvas: draw({ dx: -1, dy: -2, lean: -4, hF: [-9, -17], hB: [-13, -10], kb: null, face: 'hurt', fF: [6, 7], fB: [-3, 10] }), duration: 100 }] },
];

const root = fileURLToPath(new URL('../../', import.meta.url));
mkdirSync(`${root}public/assets/sprites`, { recursive: true });
mkdirSync(`${root}docs/art`, { recursive: true });
const { total, sheet } = writeAsepriteSheet(`${root}public/assets/sprites/helpdesk`, 'helpdesk', F, anims);

// contact sheet preview (6x, dark background) so the art can be reviewed without the game
const frames = anims.flatMap((a) => a.frames.map((f) => f.canvas));
const cols = 8;
const rows = Math.ceil(frames.length / cols);
const prev = new Canvas(cols * F, rows * F);
frames.forEach((fr, i) => prev.blit(fr, (i % cols) * F, Math.floor(i / cols) * F));
writeFileSync(`${root}docs/art/helpdesk-preview.png`, pngBuffer(prev.scaled(5, [58, 66, 86, 255])));
console.log(`helpdesk: ${total} frames, sheet ${sheet.w}x${sheet.h}`);
