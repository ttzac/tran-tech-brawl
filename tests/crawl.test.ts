import { describe, it, expect } from 'vitest';
import { FLOORS, LAYERS, MAX_RUN_STOCKS, ROOM_KINDS, SOLO_LAYERS, SOLO_START_STOCKS, START_STOCKS, type RunState } from '../src/data/dungeon';
import { DEFAULT_LOADOUT } from '../src/data/items';
import { checkStage } from '../src/data/procgen';
import { buildRoom, choices, enterNode, finishRoom, generateFloor, generateSoloFloor, leaveRoom, newRun, runAllies, rollOffers, roomConfig, runHero, startUlt, takeOffer } from '../src/sim/crawl';
import { World } from '../src/sim/World';

const run0 = (seed = 1234): RunState => newRun('zac', seed, DEFAULT_LOADOUT);

describe('dungeon map', () => {
  it('same seed = same floor; different seeds and floors differ', () => {
    expect(generateFloor(42, 0)).toEqual(generateFloor(42, 0));
    const shapes = new Set<string>();
    for (let s = 1; s <= 40; s++) shapes.add(JSON.stringify(generateFloor(s, 0).nodes.map((n) => [n.kind, n.mod, n.next])));
    expect(shapes.size).toBeGreaterThan(30);
    expect(generateFloor(42, 1)).not.toEqual(generateFloor(42, 0));
  });

  it('every room is reachable, every path ends at the boss, and each floor has a break room', () => {
    for (let seed = 1; seed <= 200; seed++) {
      for (let floor = 0; floor < FLOORS; floor++) {
        const map = generateFloor(seed, floor);
        const boss = map.nodes[map.nodes.length - 1];
        expect(boss.kind).toBe('boss');
        expect(map.nodes.filter((n) => n.kind === 'boss').length).toBe(1);
        expect(map.nodes.some((n) => n.kind === 'rest')).toBe(true);
        const reached = new Set(map.nodes.filter((n) => n.layer === 0).map((n) => n.id));
        for (const n of map.nodes) {
          if (n !== boss) expect(n.next.length).toBeGreaterThan(0);
          for (const id of n.next) {
            expect(map.nodes[id].layer).toBe(n.layer + 1); // links only go one column forward
            if (reached.has(n.id)) reached.add(id);
          }
          expect(ROOM_KINDS[n.kind].minLayer <= n.layer || n.kind === 'boss').toBe(true);
        }
        expect(reached.size).toBe(map.nodes.length);
        expect(map.nodes.filter((n) => n.layer === 0).every((n) => !n.mod || floor > 0)).toBe(true); // the very first rooms are plain
      }
    }
  });
});

describe('dungeon run', () => {
  it('walking the map: only offered rooms can be entered', () => {
    const r = run0();
    const first = choices(r);
    expect(first.length).toBeGreaterThanOrEqual(2);
    expect(first.every((n) => n.layer === 0)).toBe(true);
    const r1 = enterNode(r, first[0].id);
    expect(r1.at).toBe(first[0].id);
    expect(r.at).toBe(-1); // the old state is untouched
    expect(() => enterNode(r1, first[0].id)).toThrow();
    expect(choices(r1).every((n) => n.layer === 1)).toBe(true);
  });

  it('rooms are generated from the seed, valid, and get harder with depth', () => {
    for (let seed = 1; seed <= 25; seed++) {
      let r = run0(seed);
      const dmg: number[] = [];
      while (!r.done) {
        const opts = choices(r);
        const pick = opts[seed % opts.length];
        r = enterNode(r, pick.id);
        if (ROOM_KINDS[pick.kind].fight) {
          const room = buildRoom(r);
          expect(buildRoom(r)).toEqual(room);
          expect(checkStage(room.stage)).toEqual([]);
          expect(room.minions.length).toBeGreaterThan(0);
          if (room.kind === 'horde') expect(room.reserve).toBeGreaterThan(0);
          if (room.kind === 'elite') expect(room.lieutenants.length).toBeGreaterThan(0);
          if (room.kind !== 'boss' && !room.mod) dmg.push(room.minions[0].melee.damage / 5);
          const cfg = roomConfig(r, room);
          expect(cfg.humans[0].stocks).toBe(r.stocks);
          r = finishRoom(r, { won: true, stocks: r.stocks, score: 10, kos: 1, bestCombo: 2, timeMs: 1000 });
        }
        r = leaveRoom(takeOffer(r, rollOffers(r)[0]));
      }
      expect(r.floor).toBe(FLOORS);
      expect(r.cleared).toBeGreaterThanOrEqual(FLOORS * LAYERS); // at most one break room per floor on a path
      expect(dmg[dmg.length - 1]).toBeGreaterThan(dmg[0]);
    }
  });

  it('rewards: seeded, distinct, carried through the run', () => {
    let r = enterNode(run0(7), choices(run0(7))[0].id);
    r = finishRoom(r, { won: true, stocks: 2, score: 100, kos: 3, bestCombo: 4, timeMs: 5000 });
    expect(r.stocks).toBe(2);
    expect(r.cleared).toBe(1);
    expect(r.score).toBeGreaterThan(100); // fight score + the room bonus
    const offers = rollOffers(r);
    expect(offers).toEqual(rollOffers(r));
    expect(new Set(offers.map((o) => o.relic?.id)).size).toBe(3);
    const base = runHero(r);
    const r2 = takeOffer(r, { relic: { id: 'coffee', name: '', icon: '', desc: '', rarity: 'common', mods: { speed: 1.12 } } });
    expect(runHero(r2).speed).toBeCloseTo(base.speed * 1.12);
    expect(takeOffer(r, { heal: 1 }).stocks).toBe(3);
    expect(takeOffer({ ...r, stocks: MAX_RUN_STOCKS }, { heal: 1 }).stocks).toBe(MAX_RUN_STOCKS);
    expect(startUlt({ ...r, relics: ['runbook'] })).toBe(50);
    expect(roomConfig({ ...r, relics: ['runbook'] }).startUlt).toBe(50);
  });

  it('a loss ends the run; the last boss wins it', () => {
    const r = enterNode(run0(3), choices(run0(3))[0].id);
    const dead = finishRoom(r, { won: false, stocks: 0, score: 5, kos: 0, bestCombo: 0, timeMs: 100 });
    expect(dead.dead).toBe(true);
    expect(choices(dead)).toEqual([]);
    expect(START_STOCKS).toBeLessThanOrEqual(MAX_RUN_STOCKS);
    // jump to the last boss
    let last: RunState = { ...run0(3), floor: FLOORS - 1 };
    while (choices(last).length) last = enterNode(last, choices(last)[0].id);
    last = leaveRoom(finishRoom(last, { won: true, stocks: 1, score: 0, kos: 0, bestCombo: 0, timeMs: 0 }));
    expect(last.done).toBe(true);
    expect(last.stocks).toBe(2); // boss floors give a stock back
  });
});

describe('dungeon rooms in the sim', () => {
  /** Play the current room with the AI driving the hero. */
  function play(r: RunState, maxTicks = 60 * 240): World {
    const w = new World(roomConfig(r));
    w.setAutopilot(0, true);
    for (let t = 0; t < maxTicks && !w.result; t++) {
      w.step();
      w.events.length = 0;
    }
    return w;
  }

  /** First run state (over a few seeds) standing in a room of this kind. */
  function roomOf(kind: string): RunState {
    for (let seed = 1; seed < 200; seed++) {
      let r = run0(seed);
      for (let step = 0; step < LAYERS; step++) {
        const opts = choices(r);
        const hit = opts.find((n) => n.kind === kind);
        r = enterNode(r, (hit ?? opts[0]).id);
        if (hit) return r;
      }
    }
    throw new Error(`no ${kind} room found`);
  }

  it('horde: the pack leader stays away until enough bots are down, then the room can be won', () => {
    const r = roomOf('horde');
    const room = buildRoom(r);
    const w = new World(roomConfig(r, room));
    w.setAutopilot(0, true);
    expect(w.fighters.includes(w.boss)).toBe(false);
    expect(w.reserveLeft).toBe(room.reserve);
    let arrived = false;
    for (let t = 0; t < 60 * 240 && !w.result; t++) {
      w.step();
      if (w.events.some((e) => e.k === 'arrive')) {
        arrived = true;
        expect(w.enemyKos).toBeGreaterThanOrEqual(room.reserve);
        expect(w.fighters.includes(w.boss)).toBe(true);
      }
      if (!arrived) expect(w.result).not.toBe('won'); // can't be won before the leader shows
      w.events.length = 0;
    }
    expect(w.result).not.toBeNull();
    if (w.result === 'won') expect(arrived).toBe(true);
  });

  it('elite: lieutenants start in the room', () => {
    const r = roomOf('elite');
    const room = buildRoom(r);
    const w = new World(roomConfig(r, room));
    expect(w.count('enemy')).toBe(1 + room.lieutenants.length);
  });

  it('same room, same seed = same fight', () => {
    const r = roomOf('skirmish');
    const a = play(r, 60 * 30);
    const b = play(r, 60 * 30);
    expect(a.fighters.map((f) => [f.id, Math.round(f.x), f.damage])).toEqual(b.fighters.map((f) => [f.id, Math.round(f.x), f.damage]));
  });

  it('an AI-driven party gets through a whole first floor often enough (rooms are beatable and end)', () => {
    let wins = 0;
    let rooms = 0;
    for (let seed = 1; seed <= 4; seed++) {
      let r = run0(seed * 101);
      while (!r.dead && r.floor === 0) {
        const opts = choices(r);
        const pick = opts[0];
        r = enterNode(r, pick.id);
        if (ROOM_KINDS[pick.kind].fight) {
          const w = play(r);
          expect(w.result).not.toBeNull(); // every room finishes within 4 minutes of game time
          rooms++;
          if (w.result === 'won') wins++;
          r = finishRoom(r, { won: w.result === 'won', stocks: w.humans[0].stocks, score: w.humans[0].score, kos: w.humans[0].kos, bestCombo: 0, timeMs: 0 });
          if (r.dead) break;
        }
        r = leaveRoom(takeOffer(r, rollOffers(r)[0]));
      }
    }
    expect(rooms).toBeGreaterThanOrEqual(8);
    expect(wins / rooms).toBeGreaterThan(0.6);
  }, 120000);
});

describe('solo crawl', () => {
  const solo0 = (seed = 1234): RunState => newRun('zac', seed, DEFAULT_LOADOUT, true);

  it('a solo run has no allies, an extra stock and its own longer map', () => {
    const r = solo0();
    expect(r.solo).toBe(true);
    expect(r.stocks).toBe(SOLO_START_STOCKS);
    expect(r.stocks).toBeGreaterThan(START_STOCKS);
    expect(runAllies(r)).toEqual([]);
    expect(runAllies(run0()).length).toBe(2);
    expect(generateSoloFloor(5, 0).layers).toBe(SOLO_LAYERS);
    expect(SOLO_LAYERS).toBeGreaterThan(LAYERS);
  });

  it('solo maps are seeded, fully connected, end at one boss and always offer the rest / elite fork', () => {
    expect(generateSoloFloor(42, 0)).toEqual(generateSoloFloor(42, 0));
    for (let seed = 1; seed <= 200; seed++) {
      for (let floor = 0; floor < FLOORS; floor++) {
        const map = generateSoloFloor(seed, floor);
        const boss = map.nodes[map.nodes.length - 1];
        expect(boss.kind).toBe('boss');
        expect(boss.layer).toBe(SOLO_LAYERS);
        const fork = map.nodes.filter((n) => n.layer === 3);
        expect(fork.map((n) => n.kind).sort()).toEqual(['elite', 'rest']);
        const reached = new Set(map.nodes.filter((n) => n.layer === 0).map((n) => n.id));
        for (const n of map.nodes) {
          if (n !== boss) expect(n.next.length).toBeGreaterThan(0);
          for (const id of n.next) {
            expect(map.nodes[id].layer).toBe(n.layer + 1);
            if (reached.has(n.id)) reached.add(id);
          }
        }
        expect(reached.size).toBe(map.nodes.length);
      }
    }
  });

  it('a solo room is a World with the hero alone on the player side', () => {
    let r = solo0(77);
    r = enterNode(r, (choices(r).find((n) => ROOM_KINDS[n.kind].fight) ?? choices(r)[0]).id);
    const cfg = roomConfig(r, buildRoom(r));
    expect(cfg.allies).toEqual([]);
    expect(() => new World(cfg)).not.toThrow();
  });
});
