import { describe, it, expect } from 'vitest';
import { NetHost } from '../src/net/NetHost';
import { NetClient } from '../src/net/NetClient';
import { linkPair, type ClientSession, type HostSession, type Link } from '../src/net/link';
import { fromNetMatch, type NetMatchConfig } from '../src/net/protocol';
import { World } from '../src/sim/World';
import { TICK_MS } from '../src/sim/kinematics';
import { Bot } from '../src/entities/Bot';
import { DEFAULT_LOADOUT } from '../src/data/items';
import { emptyIntent, type Intent } from '../src/entities/Fighter';

/** A host session over in-memory links. `delay` = ticks each packet on the state channel takes (0 = instant);
 *  call pump() once per tick to deliver what is due. connect() plays a guest joining. */
function fakeNet(delay = 0) {
  const links = new Map<string, Link>();
  const queue: { at: number; run: () => void }[] = [];
  let tick = 0;
  let n = 0;
  /** make whatever handler the link's owner installs on `onState` receive packets `delay` ticks late */
  const slow = (l: Link): void => {
    if (delay <= 0) return;
    let real: Link['onState'] = null;
    Object.defineProperty(l, 'onState', {
      get: () => (buf: Uint8Array) => void queue.push({ at: tick + delay, run: () => real?.(buf) }),
      set: (fn: Link['onState']) => void (real = fn),
    });
  };
  const session: HostSession & { connect(): ClientSession; pump(): void } = {
    code: 'TEST',
    links,
    onJoin: null,
    onLeave: null,
    close() {
      for (const l of [...links.values()]) l.close();
    },
    connect() {
      const id = `p${++n}`;
      const [h, c] = linkPair(undefined, undefined, [id, 'host']);
      slow(h);
      slow(c);
      links.set(id, h);
      h.onClose = () => {
        links.delete(id);
        session.onLeave?.(h);
      };
      session.onJoin?.(h);
      return { code: 'TEST', link: c, close: () => c.close() };
    },
    pump() {
      tick++;
      for (let i = 0; i < queue.length; ) {
        if (queue[i].at <= tick) queue.splice(i, 1)[0].run();
        else i++;
      }
    },
  };
  return session;
}

/** Host + one guest, lobby done, match started, Worlds built. step(intent) = one tick for both sides. */
function startMatch(delay = 0, setup?: (host: NetHost) => void) {
  const session = fakeNet(delay);
  const host = new NetHost(session, 'zac', DEFAULT_LOADOUT);
  let client = new NetClient(session.connect(), 'Bob');
  client.pick('chain', DEFAULT_LOADOUT);
  client.ready(true);
  setup?.(host);
  let started: { m: NetMatchConfig; i: number } | null = null;
  client.onStart = (m, i) => (started = { m, i });
  const { config } = host.start(4242);
  const hw = new World(config);
  let cw = new World(fromNetMatch(started!.m));
  host.beginMatch(hw);
  client.beginMatch(cw, started!.i);
  let t = 0;
  const clock = (): number => t * TICK_MS;
  client.clock = clock;
  const game = {
    session,
    host,
    hw,
    get client() {
      return client;
    },
    get cw() {
      return cw;
    },
    get tick() {
      return t;
    },
    /** the guest comes back on a new connection (optionally with their seat token) */
    reconnect(token: string) {
      started = null;
      client = new NetClient(session.connect(), 'Bob', token);
      client.clock = clock;
      client.onStart = (m, i) => (started = { m, i });
      return client;
    },
    /** after reconnect(): the host told the client to (re)start the match */
    resume(): boolean {
      if (!started) return false;
      cw = new World(fromNetMatch(started.m));
      client.beginMatch(cw, started.i);
      return true;
    },
    step(mine: Intent | null) {
      t++;
      if (mine) client.sendInput(mine);
      session.pump();
      host.beforeTick();
      hw.step();
      host.afterTick();
      hw.events.length = 0;
      client.sync();
      cw.events.length = 0;
    },
  };
  return game;
}

describe('client prediction', () => {
  it('your own fighter moves on the tick you press, without waiting for the host', () => {
    const g = startMatch(6); // 6 ticks each way = 200 ms round trip
    const i = emptyIntent();
    for (let k = 0; k < 20; k++) g.step(i);
    const me = g.cw.humans[1];
    const x0 = me.x;
    i.dir = 1;
    g.step(i);
    expect(me.body.vx).toBeGreaterThan(0); // moving at once on the client...
    g.step(i);
    expect(me.x).toBeGreaterThan(x0 + 0.5);
    expect(g.hw.humans[1].x).toBeCloseTo(x0, 0); // ...while the host has not even seen the input yet
    i.jump = true;
    g.step(i);
    i.jump = false;
    expect(me.body.vy).toBeLessThan(0); // the jump too
  });

  it('prediction matches the host: walking, jumping, dropping and attacking need no corrections', () => {
    for (const delay of [0, 3, 8]) {
      const g = startMatch(delay);
      const i = emptyIntent();
      for (let t = 1; t <= 150; t++) {
        i.dir = t < 50 ? 1 : t < 80 ? -1 : t < 110 ? 1 : 0;
        i.jump = t === 20 || t === 34 || t === 90;
        i.attack = t === 60 || t === 100;
        i.special = t === 70;
        i.drop = t > 120 && t < 130;
        g.step(i);
      }
      i.dir = 0;
      i.jump = i.attack = i.special = i.drop = false;
      for (let t = 0; t < 40; t++) g.step(i);
      const mine = g.cw.humans[1];
      const real = g.hw.humans[1];
      expect(g.client.stats.corrections).toBe(0);
      expect(Math.abs(mine.x - real.x)).toBeLessThan(1);
      expect(Math.abs(mine.y - real.y)).toBeLessThan(1);
      expect(mine.offX).toBe(0);
      expect(g.client.acked).toBeGreaterThanOrEqual(190 - delay * 2 - 2); // only the inputs still in flight are unacknowledged
    }
  });

  it('a hit the client could not predict is corrected and then smoothed, not snapped', () => {
    const g = startMatch(4);
    const i = emptyIntent();
    for (let k = 0; k < 30; k++) g.step(i);
    const real = g.hw.humans[1];
    real.takeHit({ name: 'test', damage: 10, knockback: 300, scaling: 5, cooldown: 0 }, real.x + 50); // launched on the host only
    const mine = g.cw.humans[1];
    let sawOffset = false;
    for (let k = 0; k < 90; k++) {
      g.step(i);
      if (mine.offX !== 0 || mine.offY !== 0) sawOffset = true;
    }
    expect(g.client.stats.corrections).toBeGreaterThan(0);
    expect(sawOffset).toBe(true);
    expect(mine.damage).toBeCloseTo(real.damage, 0);
    expect(Math.abs(mine.x - real.x)).toBeLessThan(1.5);
    expect(Math.abs(mine.offX)).toBeLessThan(0.5); // the glide has finished
  });

  it('the predicted swing is played once: the host copy of the event is dropped', () => {
    const g = startMatch(3);
    const i = emptyIntent();
    for (let k = 0; k < 10; k++) g.step(i);
    let swings = 0;
    const me = g.cw.humans[1];
    for (let k = 0; k < 60; k++) {
      i.attack = k === 5;
      g.client.sendInput(i);
      g.session.pump();
      g.host.beforeTick();
      g.hw.step();
      g.host.afterTick();
      g.hw.events.length = 0;
      swings += g.cw.events.filter((e) => e.k === 'swing' && e.f === me).length; // straight from the prediction
      g.cw.events.length = 0;
      g.client.sync();
      swings += g.cw.events.filter((e) => e.k === 'swing' && e.f === me).length; // from the host
      g.cw.events.length = 0;
    }
    expect(swings).toBe(1);
  });
});

describe('interpolation of other fighters', () => {
  it('others are drawn between two snapshots, a little in the past, and move every frame', () => {
    const g = startMatch(2);
    const i = emptyIntent();
    const hostX: number[][] = [];
    let moved = 0;
    let frames = 0;
    let lastX = NaN;
    for (let t = 1; t <= 300; t++) {
      g.step(i);
      hostX[g.hw.tick] = g.hw.fighters.map((f) => f.x);
      if (t < 60) continue;
      // an AI ally (index 2 = first ally) on the client sits between where the host had it at the two snapshots around cw.tick
      const ally = g.cw.fighters[2];
      const b = g.cw.tick;
      const lo = Math.min(hostX[b - 2][2], hostX[b][2]) - 0.6;
      const hi = Math.max(hostX[b - 2][2], hostX[b][2]) + 0.6;
      expect(ally.x).toBeGreaterThanOrEqual(lo);
      expect(ally.x).toBeLessThanOrEqual(hi);
      expect(g.hw.tick - b).toBeGreaterThanOrEqual(2); // in the past...
      expect(g.hw.tick - b).toBeLessThanOrEqual(10); // ...but not far
      if (Math.abs(g.hw.fighters[2].body.vx) > 60) {
        frames++;
        if (ally.x !== lastX) moved++;
      }
      lastX = ally.x;
    }
    expect(frames).toBeGreaterThan(30);
    expect(moved / frames).toBeGreaterThan(0.9); // smooth: not stuck on a position for a whole snapshot interval
  });

  it('minions the host spawns and removes appear and disappear on the client', () => {
    const g = startMatch(1);
    const i = emptyIntent();
    let saw = false;
    for (let t = 1; t <= 60 * 12; t++) {
      g.step(i);
      if (g.cw.fighters.length > 6) saw = true;
    }
    expect(saw).toBe(true);
    for (let t = 0; t < 20; t++) g.step(i);
    const ids = new Set(g.hw.fighters.map((f) => f.id));
    expect(g.cw.fighters.filter((f) => !ids.has(f.id)).length).toBeLessThanOrEqual(1); // at most one still on its way out
  });
});

describe('robustness', () => {
  it('a player who goes quiet is played by the AI, and gets control back when inputs return', () => {
    const g = startMatch(0);
    const i = emptyIntent();
    const f = g.hw.humans[1] as Bot;
    for (let t = 0; t < 30; t++) g.step(i);
    expect(f.manual).toBe(true);
    for (let t = 0; t < 200; t++) g.step(null); // hidden tab: no inputs at all
    expect(f.manual).toBe(false);
    expect((g.hw.humans[0] as Bot).manual).toBe(true); // the host's own fighter is never taken over
    for (let t = 0; t < 5; t++) g.step(i);
    expect(f.manual).toBe(true);
  });

  it('held direction is released when inputs stop (no running off the stage)', () => {
    const g = startMatch(0);
    const i = emptyIntent();
    i.dir = 1;
    for (let t = 0; t < 30; t++) g.step(i);
    for (let t = 0; t < 60; t++) g.step(null);
    expect(g.hw.humans[1].intent.dir).toBe(0);
  });

  it('a dropped player becomes AI, keeps their seat, and rejoins the same fighter with their token', () => {
    const g = startMatch(0);
    const i = emptyIntent();
    for (let t = 0; t < 30; t++) g.step(i);
    const token = g.client.token;
    expect(token.length).toBeGreaterThan(8);
    const notices: string[] = [];
    g.host.onNotice = (s) => notices.push(s);
    let lost: boolean | null = null;
    g.client.onClosed = (_r, l) => (lost = l);
    g.client.session.link.close(); // the connection dies (no goodbye)
    expect(lost).toBe(true);
    for (let t = 0; t < 10; t++) g.step(null);
    const f = g.hw.humans[1] as Bot;
    expect(f.manual).toBe(false);
    expect(notices[0]).toMatch(/Bob dropped out/);
    expect(g.host.inMatch).toBe(true);

    // a stranger still can't get in mid-match
    let refused = '';
    const stranger = new NetClient(g.session.connect(), 'Eve');
    stranger.onClosed = (r) => (refused = r);

    const back = g.reconnect(token);
    expect(back.slot).toBe(1);
    expect(g.resume()).toBe(true);
    expect(notices[notices.length - 1]).toMatch(/Bob is back/);
    i.dir = -1;
    const x0 = f.x;
    for (let t = 0; t < 40; t++) g.step(i);
    expect(f.manual).toBe(true);
    expect(f.x).toBeLessThan(x0 - 20); // their inputs drive the same fighter again
    expect(Math.abs(g.cw.humans[1].x - f.x)).toBeLessThan(2);
    expect(g.cw.fighters.map((x) => x.id).sort()).toEqual(g.hw.fighters.map((x) => x.id).sort());
    return new Promise<void>((done) => setTimeout(done, 300)).then(() => expect(refused).toMatch(/in progress/));
  });

  it('a wrong token is not a way in, and a seat is gone once the match is over', () => {
    const g = startMatch(0);
    const token = g.client.token;
    g.client.session.link.close();
    g.host.backToLobby();
    expect(g.host.players.length).toBe(1);
    const again = g.reconnect(token);
    expect(g.resume()).toBe(false); // no match to resume: they join the lobby as a new player
    expect(again.slot).toBe(1);
    expect(g.host.players.length).toBe(2);
    expect(g.host.players[1].ready).toBe(false);
  });

  it('leaving in the lobby still frees the seat at once', () => {
    const session = fakeNet();
    const host = new NetHost(session, 'zac', DEFAULT_LOADOUT);
    const c = new NetClient(session.connect(), 'Bob');
    expect(host.players.length).toBe(2);
    c.close();
    expect(host.players.length).toBe(1);
  });
});

describe('online modes', () => {
  it('brawl: same teams and map on both sides, crates travel in snapshots, last team standing ends it', () => {
    const g = startMatch(0, (h) => h.setMode('brawl'));
    expect(g.client.mode).toBe('brawl');
    expect(g.hw.mode).toBe('brawl');
    expect(g.cw.mode).toBe('brawl');
    expect(g.cw.stage).toEqual(g.hw.stage);
    expect(g.hw.count('hero')).toBe(4);
    expect(g.hw.count('enemy')).toBe(4);
    expect(new Set(g.hw.fighters.map((f) => f.def.id)).size).toBe(8); // nobody is on both teams
    expect(g.cw.fighters.map((f) => [f.id, f.def.id, f.team])).toEqual(g.hw.fighters.map((f) => [f.id, f.def.id, f.team]));
    const i = emptyIntent();
    let sawCrate = false;
    for (let t = 0; t < 60 * 240 && !g.cw.result; t++) {
      g.step(t < 600 ? i : null); // then go quiet: the AI finishes the brawl for us
      if (g.hw.crates.length && g.cw.crates.length === g.hw.crates.length && g.cw.crates[0].power === g.hw.crates[0].power) sawCrate = true;
    }
    expect(sawCrate).toBe(true);
    expect(g.hw.result).not.toBeNull();
    expect(g.cw.result).toBe(g.hw.result);
  }, 60000);

  it('the lobby tells guests which mode is picked', () => {
    const session = fakeNet();
    const host = new NetHost(session, 'zac', DEFAULT_LOADOUT);
    const c = new NetClient(session.connect(), 'Bob');
    expect(c.mode).toBe('boss');
    host.setMode('brawl');
    expect(c.mode).toBe('brawl');
  });
});
