import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { launch } from '../src/systems/Knockback';
import { applyLoadout, findItem, itemsFor, ITEMS, DEFAULT_LOADOUT, SLOTS } from '../src/data/items';
import { getLoadout, setLoadout, resetLoadout } from '../src/systems/Loadout';
import { Spawner } from '../src/systems/Spawner';
import { Rng } from '../src/sim/rng';
import { heroes } from '../src/data/heroes';
import type { MoveDef } from '../src/data/types';

const move: MoveDef = { name: 't', damage: 5, knockback: 200, scaling: 6, cooldown: 100 };

describe('launch', () => {
  it('power grows with damage', () => {
    let prev = -1;
    for (const d of [0, 20, 60, 120, 200]) {
      const p = launch(d, move, 1, 1).power;
      expect(p).toBeGreaterThanOrEqual(prev);
      prev = p;
    }
    expect(launch(100, move, 1, 1).power).toBeGreaterThan(launch(0, move, 1, 1).power);
  });
  it('heavier launches less', () => {
    expect(launch(50, move, 2, 1).power).toBeLessThan(launch(50, move, 1, 1).power);
    expect(launch(50, move, 1, 1).power).toBeLessThan(launch(50, move, 0.8, 1).power);
  });
  it('direction sign, upward vy', () => {
    const r = launch(50, move, 1, 1);
    const l = launch(50, move, 1, -1);
    expect(r.vx).toBeGreaterThan(0);
    expect(l.vx).toBeLessThan(0);
    expect(r.vx).toBeCloseTo(-l.vx);
    expect(r.vy).toBeLessThan(0);
  });
  it('caps power and stun', () => {
    const r = launch(1e6, move, 0.1, 1);
    expect(r.power).toBe(1600);
    expect(r.stun).toBeLessThanOrEqual(800); // cap raised 650 -> 800 in the balance pass
  });
});

describe('items', () => {
  const hero = heroes[0];
  it('findItem / itemsFor', () => {
    expect(findItem('weapon', 'cable')?.id).toBe('cable');
    expect(findItem('item', 'cable')).toBeUndefined();
    expect(findItem('weapon', 'nope')).toBeUndefined();
    for (const s of SLOTS) expect(itemsFor(s).every((i) => i.slot === s)).toBe(true);
  });
  it('ids unique within slot', () => {
    for (const s of SLOTS) {
      const ids = itemsFor(s).map((i) => i.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
    expect(ITEMS.length).toBeGreaterThan(0);
  });
  it('weapon overrides melee but keeps windup', () => {
    const out = applyLoadout(hero, { ...DEFAULT_LOADOUT, weapon: 'server' });
    expect(out.melee.damage).toBe(14);
    expect(out.melee.range).toBe(44);
    expect(out.melee.windup).toBe(hero.melee.windup);
  });
  it('mods multiply, jumps add', () => {
    const out = applyLoadout(hero, { weapon: 'default', item: 'coffee', powerup: 'turbo' });
    expect(out.speed).toBeCloseTo(hero.speed * 1.15 * 1.1);
    expect(out.weight).toBeCloseTo(hero.weight * 0.92);
    expect(out.melee.damage).toBeCloseTo(hero.melee.damage * 1.25);
    const j = applyLoadout(hero, { ...DEFAULT_LOADOUT, item: 'toolbelt' });
    expect(j.jumps).toBe(hero.jumps + 1);
  });
  it('unknown ids ignored', () => {
    const out = applyLoadout(hero, { weapon: 'x', item: 'y', powerup: 'z' });
    expect(out).toEqual(hero);
  });
  it('does not mutate input', () => {
    const snap = JSON.parse(JSON.stringify(hero));
    applyLoadout(hero, { weapon: 'server', item: 'toolbelt', powerup: 'zeroday' });
    expect(JSON.parse(JSON.stringify(hero))).toEqual(snap);
  });
});

describe('Loadout storage', () => {
  let store: Record<string, string>;
  beforeEach(() => {
    store = {};
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => void (store[k] = v),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('defaults, round-trip, per-hero', () => {
    expect(getLoadout('a')).toEqual(DEFAULT_LOADOUT);
    setLoadout('a', { weapon: 'cable', item: 'coffee', powerup: 'surge' });
    expect(getLoadout('a').weapon).toBe('cable');
    expect(getLoadout('b')).toEqual(DEFAULT_LOADOUT);
  });
  it('partial stored data merges with defaults', () => {
    store['ttb.loadouts.v1'] = JSON.stringify({ a: { weapon: 'cable' } });
    expect(getLoadout('a')).toEqual({ ...DEFAULT_LOADOUT, weapon: 'cable' });
  });
  it('corrupt JSON falls back', () => {
    store['ttb.loadouts.v1'] = '{nope';
    expect(getLoadout('a')).toEqual(DEFAULT_LOADOUT);
  });
  it('reset', () => {
    setLoadout('a', { weapon: 'cable', item: 'coffee', powerup: 'surge' });
    expect(resetLoadout('a')).toEqual(DEFAULT_LOADOUT);
    expect(getLoadout('a')).toEqual(DEFAULT_LOADOUT);
  });
  it('throwing localStorage does not throw', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(() => setLoadout('a', DEFAULT_LOADOUT)).not.toThrow();
    expect(getLoadout('a')).toEqual(DEFAULT_LOADOUT);
    expect(() => resetLoadout('a')).not.toThrow();
  });
});

describe('Spawner', () => {
  const cfg = { firstDelay: 1000, interval: 5000, count: 2, max: 3 };
  it('waits firstDelay, then spawns count', () => {
    const spawned: number[] = [];
    const s = new Spawner(cfg, (x) => spawned.push(x), () => spawned.length, [100, 200], new Rng(1));
    s.update(900);
    expect(spawned.length).toBe(0);
    s.update(100);
    expect(spawned.length).toBe(2);
    expect(s.wave).toBe(1);
  });
  it('respects interval and max alive', () => {
    const spawned: number[] = [];
    const s = new Spawner(cfg, (x) => spawned.push(x), () => spawned.length, [100, 200], new Rng(1));
    s.update(1000);
    s.update(4999);
    expect(spawned.length).toBe(2);
    s.update(1); // second wave limited to 1 (max 3)
    expect(spawned.length).toBe(3);
    s.update(5000); // full: nothing spawns, wave not counted
    expect(spawned.length).toBe(3);
    expect(s.wave).toBe(2);
  });
});
