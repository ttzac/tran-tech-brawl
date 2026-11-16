import type { BossDef, BossPattern, FighterDef, StageDef } from '../data/types';
import { bosses } from '../data/bosses';
import { heroes } from '../data/heroes';
import { applyLoadout, applyMods, type Loadout, type Mods } from '../data/items';
import { LAYOUTS, THEMES, generateStage } from '../data/procgen';
import {
  FLOORS,
  LAYERS,
  MAX_RUN_STOCKS,
  RARITY_WEIGHT,
  RELICS,
  ROOM_KINDS,
  ROOM_MODS,
  SOLO_ENEMY_DAMAGE,
  SOLO_LAYERS,
  SOLO_START_STOCKS,
  START_STOCKS,
  modById,
  relicById,
  type FloorMap,
  type MapNode,
  type Relic,
  type RoomKind,
  type RoomMod,
  type RunState,
} from '../data/dungeon';
import { allyLoadout } from '../systems/Loadout';
import { Rng } from './rng';
import type { MatchConfig } from './World';

/** Dungeon crawl rules: everything about a run that is not one fight. Pure functions over plain data, seeded RNG only
 *  (same seed = same maps, rooms, enemies and relic offers), no Phaser. The fights themselves are Worlds built by roomConfig(). */

/** Mix a few numbers into one 32-bit seed (so every map / room / offer gets its own stream from the run seed). */
export function mix(...parts: number[]): number {
  let h = 0x811c9dc5;
  for (const p of parts) {
    h = Math.imul(h ^ (p >>> 0), 0x01000193);
    h ^= h >>> 15;
    h = Math.imul(h, 0x2c1b3c6d);
    h ^= h >>> 12;
  }
  return h >>> 0;
}

export function newRun(heroId: string, seed: number, loadout: Loadout, solo = false): RunState {
  const r: RunState = { seed: seed >>> 0, heroId, loadout, floor: 0, at: -1, path: [], cleared: 0, stocks: solo ? SOLO_START_STOCKS : START_STOCKS, relics: [], score: 0, kos: 0, bestCombo: 0, timeMs: 0 };
  if (solo) r.solo = true;
  return r;
}

// ---- the map ------------------------------------------------------------------------------------------

function weighted<T>(rng: Rng, items: readonly T[], weight: (t: T) => number): T {
  let total = 0;
  for (const it of items) total += weight(it);
  let x = rng.next() * total;
  for (const it of items) {
    x -= weight(it);
    if (x < 0) return it;
  }
  return items[items.length - 1];
}

/** One floor: LAYERS columns of 2-3 rooms and a boss. Every room links to 1-2 rooms in the next column and every room
 *  can be reached. Later floors and later columns roll more modifiers; there is always a Break Room in the back half. */
export function generateFloor(seed: number, floor: number): FloorMap {
  const rng = new Rng(mix(seed, floor, 0xf100));
  const art = THEMES.filter((t) => t.art);
  const theme = (floor < art.length ? art[(floor + rng.int(0, art.length - 1)) % art.length] : THEMES[rng.int(0, THEMES.length - 1)]).id;
  const nodes: MapNode[] = [];
  const cols: MapNode[][] = [];
  const rollable = (Object.keys(ROOM_KINDS) as RoomKind[]).filter((k) => ROOM_KINDS[k].weight > 0);
  for (let layer = 0; layer < LAYERS; layer++) {
    const lanes = rng.int(2, 3);
    const col: MapNode[] = [];
    for (let lane = 0; lane < lanes; lane++) {
      const kind = weighted(rng, rollable.filter((k) => ROOM_KINDS[k].minLayer <= layer), (k) => ROOM_KINDS[k].weight);
      const node: MapNode = { id: nodes.length, layer, lane, lanes, kind, next: [] };
      const depth = floor * (LAYERS + 1) + layer;
      const mods = ROOM_MODS.filter((m) => m.minDepth <= depth);
      if (depth > 0 && mods.length && rng.next() < Math.min(0.8, 0.2 + depth * 0.06)) node.mod = mods[rng.int(0, mods.length - 1)].id;
      nodes.push(node);
      col.push(node);
    }
    cols.push(col);
  }
  // a breather somewhere in the back half, and never two elites side by side in one column
  const restCol = cols[rng.int(Math.max(1, LAYERS - 2), LAYERS - 1)];
  const rest = restCol[rng.int(0, restCol.length - 1)];
  rest.kind = 'rest';
  delete rest.mod;
  for (const col of cols) {
    const elites = col.filter((n) => n.kind === 'elite');
    for (const n of elites.slice(1)) n.kind = 'skirmish';
  }
  const boss: MapNode = { id: nodes.length, layer: LAYERS, lane: 0, lanes: 1, kind: 'boss', next: [] };
  nodes.push(boss);
  cols.push([boss]);

  linkColumns(rng, cols);
  return { floor, theme, nodes };
}

/** Join each column to the next: every room links to 1-2 rooms ahead, and nobody is left unreachable. */
function linkColumns(rng: Rng, cols: MapNode[][], sideChance = 0.45): void {
  for (let layer = 0; layer < cols.length - 1; layer++) {
    const a = cols[layer];
    const b = cols[layer + 1];
    for (const n of a) {
      const j = b.length === 1 ? 0 : Math.round((n.lane * (b.length - 1)) / Math.max(1, a.length - 1));
      n.next.push(b[j].id);
      const side = j + (rng.next() < 0.5 ? -1 : 1);
      if (b[side] && rng.next() < sideChance) n.next.push(b[side].id);
    }
    // no orphans: a room nobody links to is joined to the nearest room in the column before it
    for (const m of b) {
      if (a.some((n) => n.next.includes(m.id))) continue;
      const j = Math.round((m.lane * (a.length - 1)) / Math.max(1, b.length - 1));
      a[j].next.push(m.id);
    }
    for (const n of a) n.next.sort((x, y) => x - y);
  }
}

/** Solo Crawl's map, "the Gauntlet": SOLO_LAYERS columns, mostly a single road with the occasional two-way fork. Column 3 is
 *  always a fork between a Break Room and an Elite Pack (heal up, or gamble for a better relic). Floors also rotate through
 *  every art theme in a fixed order so a solo run sees a different place each floor. */
export function generateSoloFloor(seed: number, floor: number): FloorMap {
  const rng = new Rng(mix(seed, floor, 0x5010));
  const art = THEMES.filter((t) => t.art);
  const theme = art[(floor + rng.int(0, art.length - 1)) % art.length].id;
  const nodes: MapNode[] = [];
  const cols: MapNode[][] = [];
  const rollable = (Object.keys(ROOM_KINDS) as RoomKind[]).filter((k) => ROOM_KINDS[k].weight > 0);
  const FORK = 3;
  for (let layer = 0; layer < SOLO_LAYERS; layer++) {
    const lanes = layer === FORK ? 2 : layer === 0 || layer === SOLO_LAYERS - 1 ? 1 : rng.next() < 0.4 ? 2 : 1;
    const col: MapNode[] = [];
    for (let lane = 0; lane < lanes; lane++) {
      const kind: RoomKind = layer === FORK ? (lane === 0 ? 'rest' : 'elite') : weighted(rng, rollable.filter((k) => ROOM_KINDS[k].minLayer <= Math.floor(layer / 1.5)), (k) => ROOM_KINDS[k].weight);
      const node: MapNode = { id: nodes.length, layer, lane, lanes, kind, next: [] };
      const depth = floor * (SOLO_LAYERS + 1) + layer;
      const mods = ROOM_MODS.filter((m) => m.minDepth <= depth * 0.7);
      if (kind !== 'rest' && depth > 0 && mods.length && rng.next() < Math.min(0.7, 0.15 + depth * 0.04)) node.mod = mods[rng.int(0, mods.length - 1)].id;
      nodes.push(node);
      col.push(node);
    }
    cols.push(col);
  }
  const boss: MapNode = { id: nodes.length, layer: SOLO_LAYERS, lane: 0, lanes: 1, kind: 'boss', next: [] };
  nodes.push(boss);
  cols.push([boss]);
  linkColumns(rng, cols, 0.25);
  return { floor, theme, nodes, layers: SOLO_LAYERS, solo: true };
}

export const floorMap = (r: RunState): FloorMap => (r.solo ? generateSoloFloor(r.seed, r.floor) : generateFloor(r.seed, r.floor));

/** Columns of rooms before the boss on this run's maps. */
export const layersOf = (r: Pick<RunState, 'solo'>): number => (r.solo ? SOLO_LAYERS : LAYERS);

/** The rooms the player may walk into next. */
export function choices(r: RunState, map = floorMap(r)): MapNode[] {
  if (r.done || r.dead) return [];
  if (r.at < 0) return map.nodes.filter((n) => n.layer === 0);
  return map.nodes[r.at].next.map((id) => map.nodes[id]);
}

/** Walk into a room. Throws if it is not one of the choices (a bad save / a bug, never a player action). */
export function enterNode(r: RunState, id: number): RunState {
  if (!choices(r).some((n) => n.id === id)) throw new Error(`room ${id} is not reachable`);
  return { ...r, relics: [...r.relics], at: id, path: [...r.path, id] };
}

export const currentNode = (r: RunState): MapNode | null => (r.at < 0 ? null : floorMap(r).nodes[r.at] ?? null);

export function roomTitle(r: RunState, node = currentNode(r)): string {
  if (!node) return `FLOOR ${r.floor + 1}`;
  const kind = ROOM_KINDS[node.kind];
  return `FLOOR ${r.floor + 1} · ${node.kind === 'boss' ? 'BOSS' : `ROOM ${node.layer + 1}/${layersOf(r)}`} · ${kind.name.toUpperCase()}`;
}

// ---- the hero and the party -------------------------------------------------------------------------

/** The player's hero for this room: starting gear + every relic picked so far, with the run's stock count. */
export function runHero(r: RunState): FighterDef {
  const base = heroes.find((h) => h.id === r.heroId) ?? heroes[0];
  const mods = r.relics.map((id) => relicById(id)?.mods).filter((m): m is Mods => !!m);
  const def = applyMods(applyLoadout(base, r.loadout), mods);
  def.stocks = r.stocks;
  return def;
}

export function startUlt(r: RunState): number {
  let u = 0;
  for (const id of r.relics) u += relicById(id)?.startUlt ?? 0;
  return Math.min(100, u);
}

/** Two AI party members, different every room, with themed gear. */
export function runAllies(r: RunState): FighterDef[] {
  if (r.solo) return []; // Solo Crawl: you against the room
  const rng = new Rng(mix(r.seed, r.floor, r.at, 0xa11));
  const pool = heroes.filter((h) => h.id !== r.heroId);
  const out: FighterDef[] = [];
  while (out.length < 2 && pool.length) {
    const h = pool.splice(rng.int(0, pool.length - 1), 1)[0];
    out.push(applyLoadout(h, allyLoadout(h.id, out.length)));
  }
  return out;
}

// ---- rooms ----------------------------------------------------------------------------------------------

const clone = (d: FighterDef): FighterDef => ({ ...d, melee: { ...d.melee }, special: { ...d.special } });

/** Enemy stats for this depth and room modifier. */
function tune(d: FighterDef, dmg: number, mod?: RoomMod): FighterDef {
  const o = clone(d);
  const e = mod?.enemy;
  const k = dmg * (e?.damage ?? 1);
  o.melee.damage *= k;
  o.special.damage *= k;
  o.speed *= e?.speed ?? 1;
  o.weight *= e?.weight ?? 1;
  o.melee.cooldown *= e?.cooldown ?? 1;
  o.special.cooldown *= e?.cooldown ?? 1;
  return o;
}

/** A minion promoted to room guardian / lieutenant: bigger, heavier, slower, longer reach. */
function elite(minion: FighterDef, name: string, stocks: number, big: number): FighterDef {
  const o = clone(minion);
  o.name = name;
  o.role = 'Elite';
  o.scale = minion.scale * big;
  o.stocks = stocks;
  o.weight = minion.weight * (1.2 + big);
  o.speed = minion.speed * 0.9;
  o.melee.range *= 1.3;
  return o;
}

export interface RoomSpec {
  kind: RoomKind;
  mod?: RoomMod;
  /** e.g. "FLOOR 2 · ROOM 3/4 · HORDE" */
  title: string;
  /** the guardian / boss name, for the banner */
  name: string;
  stage: StageDef;
  /** guardian (or the floor boss) with its wave rules */
  boss: BossDef;
  /** elite rooms: extra guardians that start beside the captain */
  lieutenants: FighterDef[];
  /** the bot types its waves are drawn from */
  minions: FighterDef[];
  /** horde rooms: enemy KOs needed before the pack leader drops in (0 = it is there from the start) */
  reserve: number;
  crateEvery?: number;
  seed: number;
}

/** Build the room the player is standing in: map, guardian, enemy mix and wave rules, all scaled by how deep the run is. */
export function buildRoom(r: RunState): RoomSpec {
  const map = floorMap(r);
  const node = map.nodes[r.at];
  if (!node || !ROOM_KINDS[node.kind].fight) throw new Error('no fight in this room');
  const depth = r.cleared;
  const seed = mix(r.seed, r.floor, node.id, 0x7001);
  const rng = new Rng(seed);
  const mod = modById(node.mod);
  const solo = !!r.solo;
  const dmg = (1 + depth * 0.06) * (solo ? SOLO_ENEMY_DAMAGE : 1);
  const title = roomTitle(r, node);
  const wv = mod?.waves;
  const stageSeed = rng.int(1, 1e9);

  if (node.kind === 'boss') {
    const base = bosses[(r.floor + mix(r.seed, 0xb055)) % bosses.length];
    const theme = THEMES.some((t) => t.id === base.stageId) ? base.stageId : map.theme;
    const fighter = tune(base.fighter, 1 + depth * 0.04);
    fighter.stocks = Math.min(base.fighter.stocks, 2 + r.floor);
    const boss: BossDef = { ...base, fighter, minion: tune(base.minion, dmg), waves: { ...base.waves, max: base.waves.max + r.floor } };
    return { kind: 'boss', title, name: base.name, stage: generateStage(stageSeed, { theme }), boss, lieutenants: [], minions: [boss.minion], reserve: 0, seed };
  }

  // enemy types: the guardian's own bots, plus other factions deeper in (hordes are always mixed)
  const order = bosses.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [order[i], order[j]] = [order[j], order[i]];
  }
  const parent = bosses[order[0]];
  const kinds = node.kind === 'horde' ? Math.min(order.length, 2 + (r.floor > 0 ? 1 : 0)) : 1 + (depth >= 3 ? 1 : 0);
  const minions = order.slice(0, kinds).map((i) => tune(bosses[i].minion, dmg, mod));

  const big = node.kind === 'horde' ? 1.3 : 1.5;
  const captain = tune(elite(parent.minion, `${node.kind === 'horde' ? 'Pack Leader' : 'Elite'} ${parent.minion.name}`, node.kind === 'horde' ? 1 : 1 + r.floor, big), dmg * 1.3, mod);
  const lieutenants: FighterDef[] = [];
  if (node.kind === 'elite') {
    for (let k = 0; k < 1 + Math.min(1, r.floor); k++) {
      const src = bosses[order[(k + 1) % order.length]].minion;
      lieutenants.push(tune(elite(src, `${src.name} Lieutenant`, 1, 1.25), dmg * 1.15, mod));
    }
  }
  const patterns: BossPattern['kind'][] = r.floor === 0 ? ['barrage', 'charge'] : ['barrage', 'charge', 'quake', 'summon'];
  const horde = node.kind === 'horde';
  const boss: BossDef = {
    ...parent,
    name: captain.name,
    title: 'Room guardian',
    fighter: captain,
    skill: { reactionMs: Math.max(150, 240 - depth * 8), specialChance: 0.3, dodgeChance: 0.2 },
    pattern: { kind: patterns[rng.int(0, patterns.length - 1)], every: 5500, duration: 1400 },
    minion: minions[0],
    waves: {
      firstDelay: horde ? 800 : 2000,
      interval: (horde ? 4500 : node.kind === 'elite' ? 9000 : 7000) * (wv?.interval ?? 1),
      count: Math.max(1, (horde ? 3 : 2) + Math.min(2, r.floor) + (wv?.count ?? 0) - (solo ? 1 : 0)),
      max: Math.max(2, (horde ? 5 : node.kind === 'elite' ? 2 : 3) + r.floor + (wv?.max ?? 0) - (solo ? 1 : 0)),
    },
  };
  return {
    kind: node.kind,
    mod,
    title,
    name: captain.name,
    stage: generateStage(stageSeed, { theme: map.theme, layout: LAYOUTS[rng.int(0, LAYOUTS.length - 1)] }),
    boss,
    lieutenants,
    minions,
    reserve: horde ? Math.max(4, 6 + r.floor * 2 + Math.min(4, depth) - (solo ? 2 : 0)) : 0,
    crateEvery: mod?.crateEvery,
    seed,
  };
}

/** The World config for the current room. */
export function roomConfig(r: RunState, spec = buildRoom(r)): MatchConfig {
  return {
    stage: spec.stage,
    boss: spec.boss,
    humans: [runHero(r)],
    allies: runAllies(r),
    seed: spec.seed,
    mode: 'dungeon',
    lieutenants: spec.lieutenants,
    minions: spec.minions,
    reserve: spec.reserve,
    crateEvery: spec.crateEvery,
    startUlt: startUlt(r),
  };
}

// ---- after a room -------------------------------------------------------------------------------------

export interface RoomOutcome {
  won: boolean;
  /** the hero's stocks at the end of the fight */
  stocks: number;
  score: number;
  kos: number;
  bestCombo: number;
  timeMs: number;
}

/** Fold a finished fight into the run. A loss ends it; a win counts the room (the map position moves on in leaveRoom,
 *  after the reward is picked). */
export function finishRoom(r: RunState, o: RoomOutcome): RunState {
  const node = currentNode(r);
  const next: RunState = { ...r, relics: [...r.relics], path: [...r.path], score: r.score + o.score, kos: r.kos + o.kos, bestCombo: Math.max(r.bestCombo, o.bestCombo), timeMs: r.timeMs + o.timeMs };
  if (!o.won) {
    next.stocks = 0;
    next.dead = true;
    return next;
  }
  next.stocks = Math.max(1, Math.min(MAX_RUN_STOCKS, o.stocks));
  next.cleared = r.cleared + 1;
  if (node) next.score += Math.round(ROOM_KINDS[node.kind].score * (modById(node.mod)?.scoreMul ?? 1) * (1 + r.floor * 0.5));
  return next;
}

/** Leave the current room after its reward. Beating a boss goes down a floor and heals a stock; the last boss ends the run. */
export function leaveRoom(r: RunState): RunState {
  const node = currentNode(r);
  if (!node || node.kind !== 'boss') return r;
  const next: RunState = { ...r, relics: [...r.relics], floor: r.floor + 1, at: -1, path: [], stocks: Math.min(MAX_RUN_STOCKS, r.stocks + 1) };
  if (next.floor >= FLOORS) next.done = true;
  return next;
}

/** A reward card: a relic, or the Break Room's patch-up. */
export interface Offer {
  relic?: Relic;
  /** stocks restored */
  heal?: number;
}

/** What the reward screen offers for the room the player is in. Seeded, so reloading shows the same cards.
 *  Harder rooms push rare / epic relics; relics that only add stocks are not offered at full stocks. */
export function rollOffers(r: RunState, n = 3): Offer[] {
  const node = currentNode(r);
  const rng = new Rng(mix(r.seed, r.floor, r.at, r.cleared, 0x100f));
  const boost = node ? ROOM_KINDS[node.kind].relicBoost : 1;
  const pool = RELICS.filter((x) => !(x.stocks && !x.mods && r.stocks >= MAX_RUN_STOCKS) && !(x.startUlt === 100 && r.relics.includes(x.id)));
  const out: Offer[] = [];
  if (node?.kind === 'rest' && r.stocks < MAX_RUN_STOCKS) out.push({ heal: 1 });
  while (out.length < n && pool.length) {
    const pick = weighted(rng, pool, (p) => RARITY_WEIGHT[p.rarity] * (p.rarity === 'common' ? 1 : boost));
    pool.splice(pool.indexOf(pick), 1);
    out.push({ relic: pick });
  }
  return out;
}

export function takeOffer(r: RunState, o: Offer): RunState {
  const next: RunState = { ...r, relics: [...r.relics] };
  if (o.relic) next.relics.push(o.relic.id);
  next.stocks = Math.min(MAX_RUN_STOCKS, r.stocks + (o.heal ?? 0) + (o.relic?.stocks ?? 0));
  return next;
}

/** Rooms on the whole route (for "room 7 of 15"). */
export const ROOMS_PER_RUN = FLOORS * (LAYERS + 1);
export const roomsPerRun = (r: Pick<RunState, 'solo'>): number => FLOORS * (layersOf(r) + 1);
