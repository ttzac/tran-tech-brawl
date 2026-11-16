import { describe, it, expect } from 'vitest';
import { Body, GRAVITY, MAX_VY, TICK_MS, stepBody, type Platform } from '../src/sim/kinematics';
import { Rng } from '../src/sim/rng';
import { World, type MatchConfig } from '../src/sim/World';
import { heroes } from '../src/data/heroes';
import { bosses } from '../src/data/bosses';
import { stages } from '../src/data/stages';

const ground: Platform = { left: 0, right: 1000, top: 500, bottom: 540, solid: true };
const soft: Platform = { left: 400, right: 600, top: 300, bottom: 312, solid: false };

/** Body standing with its feet at `bottom`. */
function bodyAt(x: number, bottom: number): Body {
  const b = new Body(20, 40);
  b.x = b.prevX = x;
  b.y = b.prevY = bottom - 40;
  return b;
}

const steps = (b: Body, n: number, plats: Platform[]) => {
  for (let i = 0; i < n; i++) stepBody(b, TICK_MS, plats);
};

describe('kinematics', () => {
  it('falls with gravity, capped at max fall speed', () => {
    const b = bodyAt(100, 0);
    stepBody(b, TICK_MS, []);
    expect(b.vy).toBeCloseTo(GRAVITY / 60, 3);
    steps(b, 200, []);
    expect(b.vy).toBe(MAX_VY);
  });

  it('lands on solid ground and stays grounded', () => {
    const b = bodyAt(100, 400);
    steps(b, 120, [ground]);
    expect(b.bottom).toBe(500);
    expect(b.vy).toBe(0);
    expect(b.grounded).toBe(true);
    steps(b, 10, [ground]);
    expect(b.grounded).toBe(true); // standing re-lands every step
  });

  it('lands on a soft platform from above', () => {
    const b = bodyAt(480, 250);
    steps(b, 60, [soft, ground]);
    expect(b.bottom).toBe(300);
    expect(b.grounded).toBe(true);
  });

  it('jumps up through a soft platform', () => {
    const b = bodyAt(480, 360);
    b.vy = -700;
    let passed = false;
    for (let i = 0; i < 40; i++) {
      stepBody(b, TICK_MS, [soft]);
      if (b.bottom < 300) passed = true;
    }
    expect(passed).toBe(true);
  });

  it('drops through a soft platform when asked', () => {
    const b = bodyAt(480, 300);
    stepBody(b, TICK_MS, [soft, ground]);
    expect(b.grounded).toBe(true);
    b.dropThrough = true;
    steps(b, 60, [soft, ground]);
    expect(b.bottom).toBe(500);
  });

  it('is pushed out of the side of solid ground and bonks its head underneath', () => {
    const side = bodyAt(-30, 530); // beside the slab, overlapping its height
    side.vx = 600;
    side.gravity = false;
    steps(side, 10, [ground]);
    expect(side.right).toBe(0);
    expect(side.vx).toBe(0);

    const under = bodyAt(100, 600);
    under.vy = -900;
    steps(under, 10, [ground]);
    expect(under.top).toBeGreaterThanOrEqual(540);
  });
});

describe('Rng', () => {
  it('same seed gives the same sequence; ranges hold', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 100; i++) {
      const x = a.next();
      expect(x).toBe(b.next());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      const n = a.int(3, 5);
      b.int(3, 5);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(5);
    }
    expect(new Rng(1).next()).not.toBe(new Rng(2).next());
  });
});

describe('World', () => {
  const boss = bosses[0];
  const cfg = (seed: number): MatchConfig => ({
    stage: stages[boss.stageId],
    boss,
    humans: [heroes[0]],
    allies: heroes.slice(1, 5),
    seed,
  });

  /** Scripted human input so the run exercises movement, jumps and attacks too. */
  const run = (seed: number, ticks: number) => {
    const w = new World(cfg(seed));
    for (let t = 0; t < ticks; t++) {
      const i = w.humans[0].intent;
      i.dir = t % 240 < 120 ? 1 : -1;
      i.jump = t % 90 === 0;
      i.attack = t % 20 === 0;
      i.special = t % 150 === 0;
      i.drop = false;
      w.step();
      w.events.length = 0;
    }
    return w;
  };

  const fingerprint = (w: World) =>
    w.fighters.map((f) => [f.def.id, f.x.toFixed(4), f.y.toFixed(4), f.damage, f.stocks, f.alive].join(':')).join('|') + `#${w.rng.state}#${w.spawner.wave}`;

  it('builds 5 heroes + boss, everyone lands on the stage', () => {
    const w = new World(cfg(7));
    expect(w.fighters.filter((f) => f.team === 'hero').length).toBe(5);
    expect(w.boss.alive).toBe(true);
    for (let t = 0; t < 120; t++) w.step();
    for (const f of w.fighters) expect(f.alive).toBe(true);
    expect(w.fighters.some((f) => f.grounded)).toBe(true);
  });

  it('ultimate: needs a full meter, makes the hero untouchable, then blasts nearby foes', () => {
    const w = new World(cfg(11));
    for (let t = 0; t < 120; t++) w.step();
    const hero = w.humans[0];
    const foe = w.boss;
    foe.setPosition(hero.x + 80, hero.y);
    hero.intent.ultimate = true;
    w.step();
    expect(hero.ultMs, 'no meter, no ultimate').toBe(0);
    hero.ult = 100;
    hero.intent.ultimate = true;
    w.step();
    hero.intent.ultimate = false;
    expect(hero.ultMs).toBeGreaterThan(0);
    expect(hero.ult).toBe(0);
    expect(hero.action).toBe('ultimate');
    const before = foe.damage;
    let burst = false;
    for (let t = 0; t < 60; t++) {
      w.step();
      if (w.events.some((e) => e.k === 'ultimate' && e.phase === 'burst')) burst = true;
      w.events.length = 0;
    }
    expect(burst).toBe(true);
    expect(foe.damage).toBeGreaterThan(before);
    expect(hero.ult, 'dealing damage refills the meter a little').toBeGreaterThan(0);
  });

  it('is deterministic: same seed + same inputs = same state', () => {
    const a = run(1234, 60 * 40);
    const b = run(1234, 60 * 40);
    expect(fingerprint(a)).toBe(fingerprint(b));
    expect(fingerprint(run(999, 60 * 40))).not.toBe(fingerprint(a));
  });

  it('a full AI match plays out: damage dealt, waves spawn, eventually ends', () => {
    const w = run(5, 60 * 60 * 4);
    const dealt = w.fighters.reduce((n, f) => n + f.damage, 0) + (w.boss.def.stocks - w.boss.stocks);
    expect(dealt).toBeGreaterThan(0);
    expect(w.spawner.wave).toBeGreaterThan(0);
    expect(w.result).not.toBeNull();
  });
});
