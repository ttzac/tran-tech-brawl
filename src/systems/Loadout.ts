import { DEFAULT_LOADOUT, SLOTS, itemsFor, sanitizeLoadout, type Loadout } from '../data/items';

// Per-hero loadouts, saved in the browser. Key per hero id, so each fighter keeps their own gear.
const KEY = 'ttb.loadouts.v1';
const PRESET_KEY = 'ttb.presets.v1';
export const PRESET_COUNT = 3;

function readJson(key: string): Record<string, unknown> {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

function writeJson(key: string, v: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    // storage blocked: just won't persist
  }
}

export function getLoadout(heroId: string): Loadout {
  return sanitizeLoadout(readJson(KEY)[heroId]);
}

export function setLoadout(heroId: string, l: Loadout): void {
  const all = readJson(KEY);
  all[heroId] = sanitizeLoadout(l);
  writeJson(KEY, all);
}

export function resetLoadout(heroId: string): Loadout {
  setLoadout(heroId, { ...DEFAULT_LOADOUT });
  return { ...DEFAULT_LOADOUT };
}

/** Clears saved gear for the given hero ids (presets are kept). */
export function resetAllLoadouts(heroIds: string[]): void {
  const all = readJson(KEY);
  for (const id of heroIds) all[id] = { ...DEFAULT_LOADOUT };
  writeJson(KEY, all);
}

// ---- presets (3 per hero) ----
export function getPresets(heroId: string): (Loadout | null)[] {
  const raw = readJson(PRESET_KEY)[heroId];
  const arr: unknown[] = Array.isArray(raw) ? raw : [];
  return Array.from({ length: PRESET_COUNT }, (_, i) => (arr[i] && typeof arr[i] === 'object' ? sanitizeLoadout(arr[i]) : null));
}

export function savePreset(heroId: string, slot: number, l: Loadout): void {
  if (slot < 0 || slot >= PRESET_COUNT) return;
  const all = readJson(PRESET_KEY);
  const arr = getPresets(heroId);
  arr[slot] = sanitizeLoadout(l);
  all[heroId] = arr;
  writeJson(PRESET_KEY, all);
}

// ---- AI allies ----
/** Random gear: one pick per slot. Epics are rarer so random allies stay beatable. */
export function randomLoadout(rng: () => number = Math.random): Loadout {
  const out: Loadout = { ...DEFAULT_LOADOUT };
  for (const s of SLOTS) {
    const pool = itemsFor(s).filter((i) => i.rarity !== 'epic' || rng() < 0.3);
    out[s] = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))].id;
  }
  return out;
}

// Themed allied builds: varied but only commons/rares, at most one strong offensive piece each.
const ALLY_SETS: Loadout[] = [
  { weapon: 'cable', item: 'headset', powerup: 'overclock' }, // Network admin: reach + spam specials
  { weapon: 'screwdriver', item: 'coffee', powerup: 'defrag' }, // Field tech: very fast jabs
  { weapon: 'mallet', item: 'boots', powerup: 'ups' }, // Facilities: sturdy launcher
  { weapon: 'keyboard', item: 'duck', powerup: 'phish' }, // Dev: big specials
  { weapon: 'solder', item: 'lanyard', powerup: 'surge' }, // Hardware bench
  { weapon: 'server', item: 'toolbelt', powerup: 'none' }, // Datacentre hauler
  { weapon: 'default', item: 'energy', powerup: 'turbo' }, // Helpdesk rush
];

/** Deterministic per (hero, index): the same ally slot always gets the same themed build. */
export function allyLoadout(heroId: string, index: number): Loadout {
  let h = 0;
  for (let i = 0; i < heroId.length; i++) h = (h * 31 + heroId.charCodeAt(i)) >>> 0;
  const n = ALLY_SETS.length;
  const i = (((h + Math.floor(index)) % n) + n) % n;
  return sanitizeLoadout(ALLY_SETS[i]);
}
