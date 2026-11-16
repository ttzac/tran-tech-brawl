import { describe, it, expect } from 'vitest';
import { World, type MatchConfig } from '../src/sim/World';
import { Fighter } from '../src/entities/Fighter';
import { TICK_MS } from '../src/sim/kinematics';
import { heroes } from '../src/data/heroes';
import { bosses } from '../src/data/bosses';
import { stages } from '../src/data/stages';
import { LAYOUTS, THEMES, checkStage, generateStage } from '../src/data/procgen';
import { PACKET, POWERS, POWER_IDS } from '../src/data/powerups';
import { captureSnapshot, decodeSnapshot, encodeSnapshot } from '../src/net/protocol';

const mk = (over: Partial<MatchConfig> = {}): World =>
  new World({ stage: stages.serverroom, boss: bosses[0], humans: [heroes[0]], allies: [], seed: 7, ...over });
const run = (w: World, n: number): void => {
  for (let i = 0; i < n; i++) {
    w.step(TICK_MS);
    w.events.length = 0;
  }
};
/** the left ledge of the main slab on the Server Room */
const leftLedge = (w: World) => w.ledges.find((l) => l.side === -1 && l.x === 260)!;

/** Put a fighter in the air next to a ledge, hands level with it, falling slowly, facing the stage. */
function nearLedge(f: Fighter, side: -1 | 1, x: number, y: number): void {
  const b = f.body;
  b.x = b.prevX = side < 0 ? x - 6 - b.width : x + 6;
  b.y = b.prevY = y + 10;
  b.vx = 0;
  b.vy = 100;
  b.gravity = true;
  f.facing = (-side) as 1 | -1;
  f.intent.dir = 0;
  f.intent.jump = f.intent.drop = f.intent.attack = f.intent.special = false;
}

/** Stand a fighter on the main slab (top y = 840) and let them settle. */
function stand(w: World, f: Fighter, x = 960): void {
  f.setPosition(x, 840 - f.foot - 1);
  run(w, 3);
}

describe('ducking', () => {
  it('holding down on solid ground crouches: smaller box, no walking, feet stay put', () => {
    const w = mk();
    const f = w.humans[0];
    stand(w, f);
    const h = f.body.height;
    const bottom = f.body.bottom;
    f.intent.drop = true;
    f.intent.dir = 1;
    run(w, 20);
    expect(f.ducking).toBe(true);
    expect(f.body.height).toBeCloseTo(h * 0.55, 3);
    expect(f.body.bottom).toBeCloseTo(bottom, 3);
    expect(Math.abs(f.body.vx)).toBeLessThan(1); // can't walk while ducking
    expect(f.grounded).toBe(true);
    f.intent.drop = false;
    run(w, 3);
    expect(f.ducking).toBe(false);
    expect(f.body.height).toBeCloseTo(h, 3);
  });

  it('a ducked hurtbox sits below a normal chest-high shot', () => {
    const w = mk();
    const f = w.humans[0];
    stand(w, f);
    const shotY = f.y - f.body.height * 0.1; // where Combat.fire puts a shot
    const standTop = f.body.top;
    f.intent.drop = true;
    run(w, 5);
    expect(standTop).toBeLessThan(shotY + 8); // standing: the shot hits
    expect(f.body.top).toBeGreaterThan(shotY + 8); // ducked: it flies over
  });

  it('on a drop-through platform, down drops instead of ducking', () => {
    const w = mk();
    const f = w.humans[0];
    f.setPosition(960, 694 - f.foot - 1); // soft platform at y=700
    run(w, 3);
    expect(f.grounded).toBe(true);
    f.intent.drop = true;
    run(w, 8);
    expect(f.ducking).toBe(false);
    expect(f.body.bottom).toBeGreaterThan(698); // started falling through the platform
  });

  it('getting hit un-ducks', () => {
    const w = mk();
    const f = w.humans[0];
    stand(w, f);
    f.intent.drop = true;
    run(w, 5);
    expect(f.ducking).toBe(true);
    f.invuln = 0;
    f.takeHit(w.boss.def.melee, w.boss.x);
    expect(f.ducking).toBe(false);
  });
});

describe('ledge grab (Smash rules)', () => {
  it('grabs a ledge when falling toward it, hangs with gravity off and ledge intangibility', () => {
    const w = mk();
    const f = w.humans[0];
    const L = leftLedge(w);
    nearLedge(f, -1, L.x, L.y);
    run(w, 1);
    expect(f.hanging).toBe(true);
    expect(L.holder).toBe(f.id);
    expect(f.ledgeGrabs).toBe(1);
    expect(f.invuln).toBeGreaterThan(1000);
    const y = f.body.y;
    run(w, 30);
    expect(f.body.y).toBe(y); // held in place
    expect(f.hanging).toBe(true);
  });

  it('does not grab when facing away, or while rising fast', () => {
    const w = mk();
    const f = w.humans[0];
    const L = leftLedge(w);
    nearLedge(f, -1, L.x, L.y);
    f.facing = -1; // back to the stage
    run(w, 1);
    expect(f.hanging).toBe(false);
    nearLedge(f, -1, L.x, L.y);
    f.body.vy = -400;
    run(w, 1);
    expect(f.hanging).toBe(false);
  });

  it('only twice per airtime: a third grab is refused until you touch down', () => {
    const w = mk();
    const f = w.humans[0];
    const L = leftLedge(w);
    for (let n = 1; n <= 2; n++) {
      nearLedge(f, -1, L.x, L.y);
      run(w, 1);
      expect(f.hanging, `grab ${n}`).toBe(true);
      run(w, 10);
      f.intent.drop = true; // let go
      run(w, 2);
      f.intent.drop = false;
      expect(f.hanging).toBe(false);
      run(w, 40); // fall away and let the re-grab cooldown pass
    }
    expect(f.ledgeGrabs).toBe(2);
    nearLedge(f, -1, L.x, L.y);
    run(w, 3);
    expect(f.hanging, 'third grab refused').toBe(false);
    stand(w, f);
    expect(f.ledgeGrabs).toBe(0); // landing refills them
    nearLedge(f, -1, L.x, L.y);
    run(w, 1);
    expect(f.hanging).toBe(true);
  });

  it('the second grab gives shorter intangibility', () => {
    const w = mk();
    const f = w.humans[0];
    const L = leftLedge(w);
    nearLedge(f, -1, L.x, L.y);
    run(w, 1);
    const first = f.invuln;
    run(w, 10);
    f.intent.drop = true;
    run(w, 2);
    f.intent.drop = false;
    run(w, 40);
    f.invuln = 0;
    nearLedge(f, -1, L.x, L.y);
    run(w, 1);
    expect(f.ledgeGrabs).toBe(2);
    expect(f.invuln).toBeLessThan(first);
  });

  it('toward the stage climbs up onto the platform', () => {
    const w = mk();
    const f = w.humans[0];
    const L = leftLedge(w);
    nearLedge(f, -1, L.x, L.y);
    run(w, 12);
    f.intent.dir = 1;
    run(w, 3);
    expect(f.hanging).toBe(false);
    expect(L.holder).toBe(0);
    expect(f.x).toBeGreaterThan(L.x);
    expect(f.grounded).toBe(true);
    expect(f.body.bottom).toBeCloseTo(L.y, 0);
  });

  it('jump pops up and over, and costs a jump', () => {
    const w = mk();
    const f = w.humans[0];
    const L = leftLedge(w);
    nearLedge(f, -1, L.x, L.y);
    run(w, 12);
    const jumps = f.jumpsLeft;
    f.intent.jump = true;
    run(w, 1);
    f.intent.jump = false;
    expect(f.hanging).toBe(false);
    expect(f.body.vy).toBeLessThan(0);
    expect(f.jumpsLeft).toBe(jumps - 1);
  });

  it('only one fighter per ledge', () => {
    const w = mk({ humans: [heroes[0], heroes[1]] });
    const [a, b] = w.humans;
    const L = leftLedge(w);
    nearLedge(a, -1, L.x, L.y);
    nearLedge(b, -1, L.x, L.y);
    run(w, 1);
    expect([a.hanging, b.hanging].filter(Boolean).length).toBe(1);
  });

  it('a hit (after the intangibility) knocks you off and frees the ledge', () => {
    const w = mk();
    const f = w.humans[0];
    const L = leftLedge(w);
    nearLedge(f, -1, L.x, L.y);
    run(w, 5);
    f.invuln = 0;
    expect(f.takeHit(w.boss.def.melee, 0)).toBe(true);
    expect(f.hanging).toBe(false);
    expect(L.holder).toBe(0);
    expect(f.body.gravity).toBe(true);
  });

  it('hanging too long drops you', () => {
    const w = mk();
    const f = w.humans[0];
    const L = leftLedge(w);
    nearLedge(f, -1, L.x, L.y);
    run(w, 250); // > 3.6 s
    expect(f.hanging).toBe(false);
  });

  it('AI fighters climb off ledges by themselves', () => {
    const w = mk({ allies: [heroes[1]] });
    const bot = w.fighters.find((f) => f !== w.humans[0] && f.team === 'hero')!;
    const L = leftLedge(w);
    nearLedge(bot, -1, L.x, L.y);
    run(w, 1);
    expect(bot.hanging).toBe(true);
    run(w, 90);
    expect(L.holder).not.toBe(bot.id);
  });
});

describe('power-ups', () => {
  it('every power has a definition and sane numbers', () => {
    for (const id of POWER_IDS) {
      const p = POWERS[id];
      expect(p.id).toBe(id);
      expect(p.weight).toBeGreaterThan(0);
      expect(p.ms).toBeGreaterThanOrEqual(0);
      expect(p.name.length).toBeGreaterThan(3);
    }
  });

  it('timed stat powers change the numbers and wear off', () => {
    const w = mk();
    const f = w.humans[0];
    const base = { speed: f.speedNow, weight: f.weightNow };
    f.givePower('espresso');
    expect(f.speedNow).toBeCloseTo(base.speed * 1.45, 3);
    f.givePower('ups');
    expect(f.weightNow).toBeCloseTo(base.weight * 5, 3);
    f.givePower('cat6');
    expect(f.meleeRangeMul).toBe(2);
    expect(f.meleeDamageMul).toBeCloseTo(1.4, 3);
    run(w, Math.ceil(POWERS.cat6.ms / TICK_MS) + 5);
    expect(f.power).toBeNull();
    expect(f.meleeRangeMul).toBe(1);
    expect(f.speedNow).toBe(base.speed);
  });

  it('rubber duck gives two extra jumps immediately and then removes them', () => {
    const w = mk();
    const f = w.humans[0];
    stand(w, f);
    const j = f.jumpsLeft;
    f.givePower('duck');
    expect(f.jumpsLeft).toBe(j + 2);
    f.clearPower();
    expect(f.jumpsLeft).toBeLessThanOrEqual(f.def.jumps);
  });

  it('the UniFi AP minigun turns one special into a stream of packets', () => {
    const w = mk();
    const f = w.humans[0];
    stand(w, f, 700);
    f.givePower('ap');
    f.facing = 1;
    f.intent.special = true;
    let packets = 0;
    let peak = 0;
    for (let i = 0; i < 90; i++) {
      w.step(TICK_MS);
      w.events.length = 0;
      f.intent.special = false;
      packets = Math.max(packets, w.combat.shots.filter((s) => s.move === PACKET).length);
      peak = Math.max(peak, w.combat.shots.length);
    }
    expect(packets).toBeGreaterThanOrEqual(8);
    expect(peak).toBeGreaterThanOrEqual(8);
  });

  it('DDoS cannon fires five parallel lanes', () => {
    const w = mk();
    const f = w.humans[0];
    stand(w, f, 700);
    f.givePower('ddos');
    f.intent.special = true;
    let most = 0;
    for (let i = 0; i < 40; i++) {
      w.step(TICK_MS);
      w.events.length = 0;
      f.intent.special = false;
      most = Math.max(most, new Set(w.combat.shots.map((s) => Math.round(s.y))).size);
    }
    expect(most).toBe(5);
  });

  it('crates fall, land, and are collected by touching them', () => {
    const w = mk({ items: true });
    const f = w.humans[0];
    stand(w, f);
    f.damage = 80;
    const c = w.dropCrate(f.x, 'patch');
    expect(w.crates.includes(c)).toBe(true);
    c.body.x = f.body.x; // (a soft platform above would catch a real drop; put it on them)
    c.body.y = f.body.y;
    run(w, 2);
    expect(w.crates.includes(c)).toBe(false); // taken
    expect(f.damage).toBe(30); // Patch Tuesday: -50%
  });

  it('Turn It Off And On freezes nearby foes', () => {
    const w = mk({ items: true });
    const f = w.humans[0];
    stand(w, f);
    w.boss.setPosition(f.x + 200, 840 - w.boss.foot - 1);
    const c = w.dropCrate(f.x, 'reboot');
    c.body.x = f.body.x;
    c.body.y = f.body.y;
    w.step(TICK_MS);
    expect(w.boss.hitstun).toBeGreaterThan(400);
  });

  it('P1 Ticket gives +1 stock, but never past max+1', () => {
    const w = mk({ items: true });
    const f = w.humans[0];
    stand(w, f);
    for (let n = 0; n < 4; n++) {
      const c = w.dropCrate(f.x, 'ticket');
      c.body.x = f.body.x;
      c.body.y = f.body.y;
      w.step(TICK_MS);
    }
    expect(f.stocks).toBe(f.def.stocks + 1);
  });

  it('boss mode has no crates unless asked (online matches stay identical on every screen)', () => {
    const w = mk();
    run(w, 60 * 40);
    expect(w.crates.length).toBe(0);
  });

  it('losing a stock drops your power-up', () => {
    const w = mk();
    const f = w.humans[0];
    f.givePower('ap');
    f.ko();
    expect(f.power).toBeNull();
  });
});

describe('combos, crits and kill streaks', () => {
  it('chained hits build a combo that drops after a pause', () => {
    const w = mk();
    const h = w.humans[0];
    const v = w.boss;
    const evs: number[] = [];
    for (let i = 0; i < 4; i++) {
      v.invuln = 0;
      v.takeHit(h.def.melee, h.x, h);
    }
    expect(h.combo).toBe(4);
    expect(h.bestCombo).toBe(4);
    for (const e of w.events) if (e.k === 'combo') evs.push(e.n);
    expect(evs).toEqual([2, 3, 4]);
    run(w, 100); // 1.7 s
    expect(h.combo).toBe(0);
    expect(h.bestCombo).toBe(4);
    expect(h.score).toBeGreaterThan(0);
  });

  it('a KO is credited to the last attacker, and streaks announce themselves', () => {
    const w = mk();
    const h = w.humans[0];
    const v = w.boss;
    const streaks: number[] = [];
    for (let n = 1; n <= 3; n++) {
      v.invuln = 0;
      v.takeHit(h.def.melee, h.x, h);
      v.setPosition(-1000, 400); // out of the blast zone
      w.step(TICK_MS);
      for (const e of w.events) if (e.k === 'streak') streaks.push(e.n);
      w.events.length = 0;
      v.setPosition(1200, 400);
    }
    expect(h.kos).toBe(3);
    expect(h.streak).toBe(3);
    expect(streaks).toEqual([2, 3]);
    h.ko();
    expect(h.streak).toBe(0);
  });

  it('crits happen sometimes but not always (seeded, so reproducible)', () => {
    const w = mk();
    const h = w.humans[0];
    let crits = 0;
    for (let i = 0; i < 400; i++) {
      w.boss.invuln = 0;
      w.boss.damage = 0;
      w.boss.takeHit({ ...h.def.melee, damage: 10 }, h.x, h);
      for (const e of w.events) if (e.k === 'hit' && e.crit) crits++;
      w.events.length = 0;
    }
    expect(crits).toBeGreaterThan(5);
    expect(crits).toBeLessThan(80);
  });
});

describe('boss moves', () => {
  it('the ground-pound launches grounded foes but a jump clears it', () => {
    const w = mk({ humans: [heroes[0], heroes[1]] });
    const [a, b] = w.humans;
    const boss = w.boss;
    boss.setPosition(960, 840 - boss.foot - 1);
    stand(w, a, 1000);
    stand(w, b, 1000);
    b.body.y -= 60; // airborne
    b.body.vy = 0;
    b.body.grounded = false;
    a.invuln = b.invuln = 0;
    w.shockwave(boss);
    expect(a.damage).toBeGreaterThan(0);
    expect(b.damage).toBe(0);
    expect(w.events.some((e) => e.k === 'shock')).toBe(true);
  });

  it('summon adds minions, capped', () => {
    const w = mk();
    const before = w.count('enemy', true);
    w.summon(w.boss, 2);
    expect(w.count('enemy', true)).toBe(before + 2);
    for (let i = 0; i < 6; i++) w.summon(w.boss, 2);
    expect(w.count('enemy', true)).toBeLessThanOrEqual(bosses[0].waves.max + 2);
  });

  it('new bosses are fully specified and use the new moves', () => {
    const p = bosses.find((b) => b.id === 'printer')!;
    const c = bosses.find((b) => b.id === 'cloud')!;
    expect(p.pattern.kind).toBe('summon');
    expect(c.pattern.kind).toBe('quake');
    for (const b of [p, c]) {
      expect(stages[b.stageId]).toBeDefined();
      expect(checkStage(stages[b.stageId])).toEqual([]);
    }
  });

  it('every boss can be fought for 30 s without errors', () => {
    for (const b of bosses) {
      const w = new World({ stage: stages[b.stageId], boss: b, humans: [heroes[0]], allies: [heroes[1], heroes[2]], seed: 11 });
      run(w, 60 * 30);
      expect(w.tick).toBe(60 * 30);
    }
  });
});

describe('procedural maps', () => {
  it('every seed x theme x layout produces a valid, reachable, playable map', () => {
    for (let seed = 1; seed <= 60; seed++)
      for (const theme of THEMES)
        for (const layout of LAYOUTS) {
          const s = generateStage(seed * 7919, { theme: theme.id, layout });
          expect(checkStage(s), `${theme.id}/${layout}/${seed}`).toEqual([]);
        }
  });

  it('is deterministic: same seed, same map; different seeds differ', () => {
    expect(generateStage(123)).toEqual(generateStage(123));
    const seen = new Set<string>();
    for (let i = 1; i <= 50; i++) seen.add(JSON.stringify(generateStage(i).platforms));
    expect(seen.size).toBeGreaterThan(40);
  });

  it('random theme and layout cover everything over many seeds', () => {
    const themes = new Set<string>();
    const names = new Set<string>();
    for (let i = 1; i <= 300; i++) {
      const s = generateStage(i);
      themes.add(s.theme!);
      names.add(s.name.split('(')[1]);
    }
    expect(themes.size).toBe(THEMES.length);
    expect(names.size).toBe(LAYOUTS.length);
  });

  it('a match plays out on a generated map', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const w = new World({ stage: generateStage(seed), boss: bosses[seed % bosses.length], humans: [heroes[0]], allies: [heroes[1], heroes[2]], seed });
      run(w, 60 * 20);
      expect(w.tick).toBe(60 * 20);
    }
  });
});

describe('modes', () => {
  const rivals = [heroes[3], heroes[4], heroes[5]];

  it('brawl: rival team, no minion waves, crates, win by clearing the rivals', () => {
    const w = new World({ stage: generateStage(5), boss: bosses[0], humans: [heroes[0]], allies: [heroes[1], heroes[2]], rivals, seed: 5, mode: 'brawl' });
    expect(w.count('enemy')).toBe(3);
    expect(w.boss.isBoss).toBe(false); // plain fighters, no boss brain
    run(w, 60 * 40);
    expect(w.count('enemy', true)).toBeLessThanOrEqual(2); // never any minions
    expect(w.crates.length + w.events.length).toBeGreaterThanOrEqual(0);
    for (const f of w.fighters) if (f.team === 'enemy') {
      f.stocks = 1;
      f.ko();
    }
    w.step(TICK_MS);
    expect(w.result).toBe('won');
  });

  it('brawl: lose when your whole team is out', () => {
    const w = new World({ stage: generateStage(5), boss: bosses[0], humans: [heroes[0]], allies: [heroes[1]], rivals, seed: 5, mode: 'brawl' });
    for (const f of w.fighters) if (f.team === 'hero') {
      f.stocks = 1;
      f.ko();
    }
    w.step(TICK_MS);
    expect(w.result).toBe('lost');
  });

  it('brawl: crates keep falling during the match', () => {
    const w = new World({ stage: generateStage(9), boss: bosses[0], humans: [heroes[0]], allies: [], rivals: [heroes[3]], seed: 9, mode: 'brawl' });
    let dropped = 0;
    for (let i = 0; i < 60 * 40; i++) {
      w.step(TICK_MS);
      for (const e of w.events) if (e.k === 'crate') dropped++;
      w.events.length = 0;
    }
    expect(dropped).toBeGreaterThanOrEqual(2);
  });

  it('dungeon room: beating the captain clears the room', () => {
    const w = new World({ stage: generateStage(3), boss: bosses[0], humans: [heroes[0]], allies: [heroes[1]], seed: 3, mode: 'dungeon' });
    w.boss.stocks = 1;
    w.boss.ko();
    w.step(TICK_MS);
    expect(w.result).toBe('won');
  });
});

describe('network', () => {
  it('ducking, ledge hanging and held power-ups survive the snapshot codec', () => {
    const w = mk();
    const f = w.humans[0];
    f.givePower('cat6');
    stand(w, f);
    f.intent.drop = true;
    run(w, 4);
    const snap = decodeSnapshot(encodeSnapshot(captureSnapshot(w)))!;
    const s = snap.fighters.find((x) => x.id === f.id)!;
    expect(s.ext & 1).toBe(1);
    expect((s.ext >> 2) & 31).toBe(POWER_IDS.indexOf('cat6') + 1);
    const w2 = mk();
    const f2 = w2.humans[0];
    // apply (client side)
    return import('../src/net/protocol').then(({ applyFighterSnap }) => {
      applyFighterSnap(f2, s);
      expect(f2.ducking).toBe(true);
      expect(f2.power).toBe('cat6');
      expect(f2.y).toBeCloseTo(f.y, 1);
      expect(f2.body.height).toBeCloseTo(f.body.height, 3);
    });
  });
});
