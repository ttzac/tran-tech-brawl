import Phaser from 'phaser';
import type { Crate } from '../sim/World';
import { POWERS } from '../data/powerups';

const FONT = 'Consolas, "Courier New", monospace';
const MAX_POPUPS = 28;
const MAX_RINGS = 10;
const CRATE_LIFE = 20000;

interface Popup {
  t: Phaser.GameObjects.Text;
  age: number;
  life: number;
  vy: number;
  pop: number; // initial scale boost, eases to 1
  active: boolean;
}
interface Ring {
  e: Phaser.GameObjects.Ellipse;
  age: number;
  life: number;
  r0: number;
  r1: number;
  active: boolean;
}

/** World-space floating text (damage numbers, pickup names, announcer lines) and expanding rings (shockwaves, reboot pulses).
 *  Pooled, capped, driven from update(): no tweens or timers, so a scene restart cannot leave anything behind. */
export class Popups {
  private pool: Popup[] = [];
  private rings: Ring[] = [];
  private steal = 0;

  constructor(private scene: Phaser.Scene) {}

  /** Floating text that pops in, drifts up and fades. `size` is the font size in world px. */
  text(x: number, y: number, str: string, color: string, size = 22, life = 800, vy = -60, pop = 0.6): void {
    let p = this.pool.find((q) => !q.active);
    if (!p) {
      if (this.pool.length < MAX_POPUPS) {
        const t = this.scene.add.text(0, 0, '', { fontFamily: FONT, fontSize: '24px', fontStyle: 'bold', color: '#fff' }).setOrigin(0.5).setDepth(20).setResolution(2);
        p = { t, age: 0, life: 0, vy: 0, pop: 0, active: false };
        this.pool.push(p);
      } else p = this.pool[this.steal++ % this.pool.length];
    }
    p.active = true;
    p.age = 0;
    p.life = life;
    p.vy = vy;
    p.pop = pop;
    p.t.setText(str).setColor(color).setFontSize(size).setStroke('#0b1026', Math.max(3, size / 5)).setPosition(x, y).setAlpha(1).setVisible(true);
  }

  /** Expanding ring (stroke only) from radius r0 to r1. */
  ring(x: number, y: number, r0: number, r1: number, color: number, life = 450, squash = 0.3): void {
    let g = this.rings.find((q) => !q.active);
    if (!g) {
      if (this.rings.length < MAX_RINGS) {
        const e = this.scene.add.ellipse(0, 0, 10, 10).setDepth(9);
        g = { e, age: 0, life: 0, r0: 0, r1: 0, active: false };
        this.rings.push(g);
      } else g = this.rings[0];
    }
    g.active = true;
    g.age = 0;
    g.life = life;
    g.r0 = r0;
    g.r1 = r1;
    g.e.setPosition(x, y).setStrokeStyle(5, color, 1).setFillStyle(color, 0.12).setScale(1, squash).setVisible(true);
  }

  update(dt: number): void {
    for (const p of this.pool) {
      if (!p.active) continue;
      p.age += dt;
      const k = p.age / p.life;
      if (k >= 1) {
        p.active = false;
        p.t.setVisible(false);
        continue;
      }
      p.t.y += (p.vy * dt) / 1000;
      p.t.setScale(1 + p.pop * Math.pow(1 - Math.min(1, p.age / 140), 2)).setAlpha(k < 0.65 ? 1 : 1 - (k - 0.65) / 0.35);
    }
    for (const g of this.rings) {
      if (!g.active) continue;
      g.age += dt;
      const k = g.age / g.life;
      if (k >= 1) {
        g.active = false;
        g.e.setVisible(false);
        continue;
      }
      const r = g.r0 + (g.r1 - g.r0) * (1 - Math.pow(1 - k, 3));
      g.e.setSize(r * 2, r * 2).setAlpha(1 - k);
    }
  }

  destroy(): void {
    this.pool.length = 0;
    this.rings.length = 0;
  }
}

interface CrateSprite {
  box: Phaser.GameObjects.Rectangle;
  glow: Phaser.GameObjects.Ellipse;
  icon: Phaser.GameObjects.Text | Phaser.GameObjects.Image;
}

/** Draws the falling power-up crates. Uses Codex's `pickup_<id>` art when it has been imported, else a glowing crate with the emoji stand-in. */
export class CrateView {
  private sprites = new Map<Crate, CrateSprite>();

  constructor(private scene: Phaser.Scene) {}

  update(crates: readonly Crate[], time: number): void {
    const seen = new Set<Crate>();
    for (const c of crates) {
      seen.add(c);
      const def = POWERS[c.power];
      let s = this.sprites.get(c);
      if (!s) {
        const glow = this.scene.add.ellipse(0, 0, 70, 70, def.color, 0.28).setDepth(4);
        const box = this.scene.add.rectangle(0, 0, 34, 34, 0x0b1026).setStrokeStyle(3, def.color).setDepth(5);
        const key = `pickup_${def.id}`;
        const icon = this.scene.textures.exists(key)
          ? this.scene.add.image(0, 0, key).setDisplaySize(40, 40).setDepth(6)
          : this.scene.add.text(0, 0, def.icon, { fontSize: '22px' }).setOrigin(0.5).setDepth(6).setResolution(2);
        s = { box, glow, icon };
        this.sprites.set(c, s);
      }
      const b = c.body;
      const bob = b.grounded ? Math.sin(time / 260 + c.id) * 4 - 6 : 0;
      const x = b.centerX;
      const y = b.centerY + bob;
      const blink = c.age > CRATE_LIFE - 4000 && Math.floor(c.age / 150) % 2 === 0;
      const a = blink ? 0.35 : 1;
      s.box.setPosition(x, y).setAlpha(a).setAngle(b.grounded ? 0 : (c.age / 4) % 360);
      s.glow.setPosition(x, y).setAlpha(a * (0.22 + 0.1 * Math.sin(time / 180))).setScale(1 + 0.12 * Math.sin(time / 200));
      s.icon.setPosition(x, y).setAlpha(a);
    }
    for (const [c, s] of this.sprites) {
      if (seen.has(c)) continue;
      s.box.destroy();
      s.glow.destroy();
      s.icon.destroy();
      this.sprites.delete(c);
    }
  }

  destroy(): void {
    this.sprites.clear();
  }
}
