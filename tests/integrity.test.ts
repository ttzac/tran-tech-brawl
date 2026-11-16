import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ART, ART_STATES, FX, ITEM_ICONS, PORTRAITS, PORTRAIT_MOODS, STAGE_IMAGES, UI_IMAGES, textureKey } from '../src/data/art';
import { heroes } from '../src/data/heroes';
import { bosses } from '../src/data/bosses';
import { stages } from '../src/data/stages';
import { DEFAULT_LOADOUT, findItem, SLOTS } from '../src/data/items';
import type { FighterDef, MoveDef } from '../src/data/types';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const asset = (...p: string[]) => resolve(root, 'public', 'assets', ...p);

function pngSize(file: string): { w: number; h: number } {
  const b = readFileSync(file);
  expect(b.subarray(1, 4).toString('ascii'), `${file} is a PNG`).toBe('PNG');
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

describe('sprite sheets (ART)', () => {
  for (const id of Object.keys(ART)) {
    describe(id, () => {
      const sheet = asset('sprites', `${id}.webp`);
      const jsonPath = asset('sprites', `${id}.json`);
      it('files exist', () => {
        expect(existsSync(sheet), sheet).toBe(true);
        expect(existsSync(jsonPath), jsonPath).toBe(true);
      });
      it('json, tags and sizes are consistent', () => {
        const j = JSON.parse(readFileSync(jsonPath, 'utf8'));
        const frame = ART[id].frame;
        const frames: any[] = Array.isArray(j.frames) ? j.frames : Object.values(j.frames);
        expect(frames.length).toBeGreaterThan(0);
        expect(j.meta.image).toBe(`${id}.webp`);
        const sz = j.meta.size;
        for (const f of frames) {
          // trimmed atlas: every frame is a logical `frame` square, only the drawn part is stored
          expect(f.sourceSize.w, 'logical frame w').toBe(frame);
          expect(f.sourceSize.h, 'logical frame h').toBe(frame);
          expect(f.frame.w).toBe(f.spriteSourceSize.w);
          expect(f.frame.h).toBe(f.spriteSourceSize.h);
          expect(f.spriteSourceSize.x >= 0 && f.spriteSourceSize.y >= 0 && f.spriteSourceSize.x + f.frame.w <= frame && f.spriteSourceSize.y + f.frame.h <= frame, `frame ${f.filename} inside its logical frame`).toBe(true);
          expect(f.frame.x >= 0 && f.frame.y >= 0 && f.frame.x + f.frame.w <= sz.w && f.frame.y + f.frame.h <= sz.h, `frame ${f.filename} inside the sheet`).toBe(true);
        }
        expect(sz.w <= 4096 && sz.h <= 4096, 'sheet fits a 4096 texture').toBe(true);
        const tags: { name: string; from: number; to: number }[] = j.meta.frameTags;
        expect(Array.isArray(tags) && tags.length > 0).toBe(true);
        for (const t of tags) {
          const [prefix, state] = t.name.split(':');
          expect(prefix, `tag ${t.name}`).toBe(id);
          expect(ART_STATES as readonly string[], `tag ${t.name}`).toContain(state);
          expect(t.from).toBeGreaterThanOrEqual(0);
          expect(t.to).toBeLessThan(frames.length);
          expect(t.from).toBeLessThanOrEqual(t.to);
        }
        expect(tags.map((t) => t.name)).toContain(`${id}:idle`);
      });
    });
  }
});

describe('portraits, fx, stage images', () => {
  for (const id of PORTRAITS) {
    it(`portrait ${id} is square (96, 192 or 384)`, () => {
      const f = asset('portraits', `${id}.png`);
      expect(existsSync(f), f).toBe(true);
      const p = pngSize(f);
      expect(p.w).toBe(p.h);
      expect([96, 192, 384]).toContain(p.w);
    });
  }
  for (const [k, d] of Object.entries(FX)) {
    it(`fx ${k}`, () => {
      const f = asset('fx', `${k}.png`);
      expect(existsSync(f), f).toBe(true);
      const { w, h } = pngSize(f);
      expect(h).toBe(d.h);
      expect(w % d.w).toBe(0);
    });
  }
  for (const k of ITEM_ICONS) it(`item icon ${k}`, () => expect(existsSync(asset('items', `${k}.png`))).toBe(true));
  for (const k of UI_IMAGES) it(`ui image ${k}`, () => expect(existsSync(asset('ui', `${k}.png`))).toBe(true));
  for (const id of PORTRAITS) {
    it(`${id}: mood portraits and key art exist`, () => {
      for (const m of PORTRAIT_MOODS) expect(existsSync(asset('portraits', `${id}_${m}.png`)), m).toBe(true);
      expect(existsSync(asset('keyart', `${id}.png`))).toBe(true);
    });
  }
  for (const k of STAGE_IMAGES) {
    it(`stage image ${k} exists`, () => {
      expect(existsSync(asset('stages', `${k}.png`))).toBe(true);
    });
  }
});

const positive = (m: MoveDef) => {
  expect(m.damage).toBeGreaterThan(0);
  expect(m.knockback).toBeGreaterThan(0);
  expect(m.scaling).toBeGreaterThanOrEqual(0);
  expect(m.cooldown).toBeGreaterThan(0);
};
function checkFighter(f: FighterDef) {
  for (const k of ['scale', 'speed', 'jumpVelocity', 'jumps', 'weight', 'stocks'] as const) {
    expect(f[k], `${f.id}.${k}`).toBeGreaterThan(0);
  }
  expect(f.melee.range).toBeGreaterThan(0);
  positive(f.melee);
  positive(f.special);
  expect(f.special.speed).toBeGreaterThan(0);
  expect(f.special.life).toBeGreaterThan(0);
  // art entry or generated placeholder (BootScene makes fighter_<id>)
  expect(textureKey(f.id)).toBeTruthy();
}

describe('fighter definitions', () => {
  const all: FighterDef[] = [...heroes, ...bosses.flatMap((b) => [b.fighter, b.minion])];
  it('ids unique', () => {
    const ids = all.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  for (const f of all) it(`${f.id} stats valid`, () => checkFighter(f));
  it('every ART entry belongs to a known fighter', () => {
    const ids = new Set(all.map((f) => f.id));
    for (const id of Object.keys(ART)) expect(ids.has(id), id).toBe(true);
  });
  it('every portrait belongs to a hero', () => {
    for (const id of PORTRAITS) expect(heroes.some((h) => h.id === id), id).toBe(true);
  });
  it('bosses', () => {
    for (const b of bosses) {
      expect(stages[b.stageId], `${b.id} stage ${b.stageId}`).toBeDefined();
      expect(b.waves.count).toBeGreaterThan(0);
      expect(b.waves.max).toBeGreaterThanOrEqual(b.waves.count);
      expect(b.waves.interval).toBeGreaterThan(0);
      expect(b.pattern.duration).toBeLessThan(b.pattern.every);
    }
  });
});

describe('stages', () => {
  for (const [key, s] of Object.entries(stages)) {
    describe(key, () => {
      it('id matches key', () => expect(s.id).toBe(key));
      it('platforms inside world', () => {
        for (const p of s.platforms) {
          expect(p.x - p.w / 2, JSON.stringify(p)).toBeGreaterThanOrEqual(0);
          expect(p.x + p.w / 2, JSON.stringify(p)).toBeLessThanOrEqual(s.width);
          expect(p.y - p.h / 2, JSON.stringify(p)).toBeGreaterThanOrEqual(0);
          expect(p.y + p.h / 2, JSON.stringify(p)).toBeLessThanOrEqual(s.height);
        }
      });
      it('ground matches the solid platform', () => {
        const solids = s.platforms.filter((p) => p.solid);
        expect(solids.length).toBeGreaterThanOrEqual(1);
        const g = s.platforms[0]; // the ground slab is always listed first (procedural maps may add floating solid islands after it)
        expect(g.solid).toBe(true);
        expect(s.ground.top, 'ground.top == platform top').toBe(g.y - g.h / 2);
        expect(s.ground.left).toBeLessThan(s.ground.right);
        // ground.left/right are the walkable extent: must lie within the platform
        expect(s.ground.left).toBeGreaterThanOrEqual(g.x - g.w / 2);
        expect(s.ground.right).toBeLessThanOrEqual(g.x + g.w / 2);
      });
      it('spawns inside world and above ground', () => {
        expect(s.spawns.length).toBeGreaterThan(0);
        for (const p of s.spawns) {
          expect(p.x).toBeGreaterThan(0);
          expect(p.x).toBeLessThan(s.width);
          expect(p.y).toBeGreaterThan(0);
          expect(p.y).toBeLessThan(s.ground.top);
        }
      });
      it('blast zones surround the world', () => {
        expect(s.blast.left).toBeLessThan(0);
        expect(s.blast.top).toBeLessThan(0);
        expect(s.blast.right).toBeGreaterThan(s.width);
        expect(s.blast.bottom).toBeGreaterThan(s.height);
      });
      it('art textures are known', () => {
        if (!s.art) return;
        for (const t of [s.art.solid, s.art.soft, ...s.art.backdrop]) expect(STAGE_IMAGES).toContain(t);
      });
    });
  }
});

describe('loadout defaults', () => {
  it('DEFAULT_LOADOUT ids exist', () => {
    for (const slot of SLOTS) expect(findItem(slot, DEFAULT_LOADOUT[slot]), slot).toBeDefined();
  });
});
