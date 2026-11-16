// Re-runs every Codex art import with the settings the game expects, so a new batch of raw art is one command.
//   node tools/art/import-all.mjs                 everything
//   node tools/art/import-all.mjs heroes          one group: heroes | herofx | portraits | globalfx | enemies | ui
//   node tools/art/import-all.mjs heroes zac bec  one group, only these ids
// Missing raw frames are skipped with a SKIP line (never faked). Update the lists here when Codex adds or fixes art.
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const tool = (name) => `${root}tools/art/${name}`;
const [group, ...only] = process.argv.slice(2);
const want = (g) => !group || group === g;
const pick = (ids) => (only.length ? ids.filter((id) => only.includes(id)) : ids);
const has = (rel) => existsSync(root + rel);

const HEROES = ['zac', 'chain', 'aiden', 'david', 'annemaree', 'bec', 'caleb', 'cameron', 'jared', 'lachlan', 'ryan'];
// jump_2 is the APEX pose (own tag, shown near the top of a jump). special_4 / special_5 are NOT part of the special: Codex drew them as
// alternates (4 = charged, both hands overhead; 5 = air version), so they get their own tags `scharge` and `aspecial`.
// There is no crouch art: `duck` reuses land_1 (the landing crouch), which replaces the old squashed-idle stand-in.
const HERO_TAGS = 'idle:4,run:6,jump:1,apex=jump@2:1,fall:1,melee:4,special:3,scharge=special@4:1,aspecial=special@5:1,hurt:2,launch:1,land:2,duck=land@1:1,melee2:4,ultimate:6,respawn:3,ko:1,taunt:2,victory:3';
// Raw frames that are wrong art and must not be imported (see codex/REDO.md). Remove an entry once Codex has redrawn the frame.
const SKIP = {
  david: 'ultimate_6', // Aiden's art saved into David's folder
  jared: 'victory_2', // a "1999" scoreboard graphic, no character
  cameron: 'special_4,special_5,melee2_2,ultimate_2,ultimate_4,respawn_2', // five copies of one standing pose, and a near-empty image
  caleb: 'jump_2,land_2', // both show him riding the wakeboard on water: wrong for the top of a jump and for standing up after a landing (apex falls back to jump_1)
  lachlan: 'idle_4', // drawn without his goggles: the idle loop flickered
  altwave: 'launch_1', // Musk-Bot's art saved into Altwave's folder
  muskbot: 'hurt_1', // a Chatbot, not Musk-Bot
  chatbot: 'idle_2', // Musk-Bot's art saved into the Chatbot's folder
};
// Sizes: Codex draws frames at different sizes (some heroes' whole first batch a third too big, single frames 20-50% off).
// tools/art/rescale.json holds one factor per frame, fitted so the head is the same size in every pose (see measure.mjs / heads.mjs).
const FIX = 'tools/art/rescale.json';
// Sheets are stored at half the raw size (512px logical frames, trimmed and packed): twice the old resolution.
const FRAME = 512, SCALE = 0.5;
const HERO_DUR ='idle:180,run:70,melee:80,special:100,hurt:110,melee2:80,ultimate:110';

/** Per-hero effect strips: [game suffix, raw prefix, frames, cell px]. */
const HERO_FX = [
  ['trail', 'fx_melee_trail_', 3, 160], ['hit', 'fx_melee_hit_', 4, 96], ['proj', 'fx_special_proj_', 4, 96], ['shit', 'fx_special_hit_', 4, 128],
  ['ulta', 'fx_ultimate_a_', 4, 192], ['ultb', 'fx_ultimate_b_', 6, 256], ['aura', 'fx_aura_', 4, 192], ['charge', 'fx_special_charge_', 3, 128],
];
/** Global effects: [id, frames, cell px]. */
const GLOBAL_FX = [
  ['hit_small', 4, 96], ['hit_medium', 5, 96], ['hit_heavy', 6, 128], ['ko_blast', 8, 192], ['dust_land', 5, 96], ['dust_run', 4, 64], ['jump_ring', 4, 96],
  ['confetti', 5, 192], ['pickup_glow', 6, 128], ['ko_star', 6, 128], ['respawn_pad', 6, 160], ['smoke_puff', 4, 96],
];
/** Boss and minion sheets and their effects. Bosses have no jump art: their intro_1 (dropping in from above) doubles as the air pose.
 *  `intro` plays when the fight starts, `defeat` (minions: death) when they go down. `res` in src/data/art.ts keeps their world size. */
const BOSS_TAGS = 'idle:4,run=walk:4,melee:4,special:4,hurt:2,launch:1,jump=intro:1,intro:3,defeat:3';
// Minions have no jump art: a mid-stride walk frame (legs off the ground) is their air pose instead of standing idle in mid-air.
const MINION_TAGS = 'idle:2,run=walk:4,jump=walk@2:1,melee=attack:3,hurt:1,launch:1,defeat=death:3';
const ENEMY_DUR = 'idle:180,run:90,melee:100,special:110,hurt:110,intro:240,defeat:200';
const ENEMIES = [
  { id: 'altwave', dir: 'bosses/altwave', tags: BOSS_TAGS, fx: [['proj', 'fx_prompt_proj_', 4, 96], ['shit', 'fx_prompt_hit_', 4, 128], ['thrust', 'fx_chair_glow_', 4, 192]] },
  { id: 'muskbot', dir: 'bosses/muskbot', tags: BOSS_TAGS, fx: [['shit', 'fx_laser_hit_', 4, 128], ['shock', 'fx_stomp_shock_', 4, 256], ['thrust', 'fx_thruster_', 4, 192]] },
  { id: 'chatbot', dir: 'minions/chatbot', tags: MINION_TAGS, dur: 'idle:220,run:90,melee:100,hurt:110,defeat:110', fx: [] },
  { id: 'neurobot', dir: 'minions/neurobot', tags: MINION_TAGS, dur: 'idle:220,run:90,melee:100,hurt:110,defeat:110', fx: [] },
];

const jobs = [];
const node = (label, script, args) => jobs.push({ label, script, args });
const flags = (o) => Object.entries(o).flatMap(([k, v]) => [`--${k}`, String(v)]);
const fxJob = (label, prefix, n, id, cell) => {
  const missing = Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`).filter((b) => !has(`${b}.png`) && !has(`${b}_contained.png`));
  if (missing.length) return console.log(`SKIP ${label}: missing ${missing.map((m) => m.split('/').pop()).join(', ')}`);
  node(label, 'fxframes.mjs', flags({ prefix, n, id, cell }));
};

if (want('heroes')) for (const id of pick(HEROES)) {
  node(`sheet ${id}`, 'import.mjs', ['frames', ...flags({ dir: `art-raw/heroes/${id}`, id, frame: FRAME, scale: SCALE, fix: FIX, tags: HERO_TAGS, dur: HERO_DUR, ...(SKIP[id] ? { skip: SKIP[id] } : {}) })]);
}
if (want('herofx')) for (const id of pick(HEROES)) for (const [suffix, raw, n, cell] of HERO_FX) fxJob(`fx ${id}_${suffix}`, `art-raw/heroes/${id}/${raw}`, n, `${id}_${suffix}`, cell);
if (want('portraits')) for (const id of pick(HEROES)) {
  for (const mood of ['neutral', 'angry', 'hurt', 'win']) {
    const src = `art-raw/heroes/${id}/portrait_${mood}.png`;
    if (!has(src)) { console.log(`SKIP portrait ${id} ${mood}`); continue; }
    node(`portrait ${id} ${mood}`, 'import.mjs', ['portrait', ...flags({ in: root + src, id: mood === 'neutral' ? id : `${id}_${mood}`, size: 384, colours: 256, soft: 1 })]);
  }
  if (has(`art-raw/heroes/${id}/keyart_select.png`)) node(`keyart ${id}`, 'keyfit.mjs', flags({ in: `art-raw/heroes/${id}/keyart_select.png`, out: `keyart/${id}`, key: 0, width: 512 }));
}
if (want('globalfx')) for (const [id, n, cell] of GLOBAL_FX) if (!only.length || only.includes(id)) fxJob(`fx ${id}`, `art-raw/fx/fx_${id}_`, n, id, cell);
if (want('enemies')) for (const e of ENEMIES.filter((x) => !only.length || only.includes(x.id))) {
  node(`sheet ${e.id}`, 'import.mjs', ['frames', ...flags({ dir: `art-raw/${e.dir}`, id: e.id, frame: FRAME, scale: SCALE, fix: FIX, tags: e.tags, dur: e.dur ?? ENEMY_DUR, ...(SKIP[e.id] ? { skip: SKIP[e.id] } : {}) })]);
  for (const [suffix, raw, n, cell] of e.fx) fxJob(`fx ${e.id}_${suffix}`, `art-raw/${e.dir}/${raw}`, n, `${e.id}_${suffix}`, cell);
}
// Stages: far / mid / main / soft were imported 2026-11-12 and have not changed. bg_near (both stages) is NOT imported:
// the art itself is tinted with the magenta key colour, so it cannot be keyed cleanly (see codex/REDO.md).
if (want('ui')) for (const [name, o] of [['hud_victory_banner', { width: 700 }], ['hud_defeat_banner', { width: 700 }], ['hud_ko_banner', { width: 450 }]]) {
  if (has(`art-raw/ui/${name}.png`)) node(`ui ${name}`, 'keyfit.mjs', flags({ in: `art-raw/ui/${name}.png`, out: `ui/${name}`, key: 1, ...o }));
}

// run a few at a time; print each tool's output with its label so warnings stay attached to the asset
let failed = 0, next = 0;
const run = (j) => new Promise((done) => execFile(process.execPath, [tool(j.script), ...j.args], { cwd: root, maxBuffer: 1 << 24 }, (err, out, errOut) => {
  const lines = `${out}${errOut}`.trim().split('\n').filter(Boolean);
  if (err) { failed++; console.log(`FAIL ${j.label}: ${lines.slice(-3).join(' | ')}`); }
  else for (const l of lines) console.log(/^WARN/.test(l) ? `  ${j.label}: ${l}` : l);
  done();
}));
const worker = async () => { while (next < jobs.length) await run(jobs[next++]); };
await Promise.all(Array.from({ length: 4 }, worker));
console.log(`\n${jobs.length - failed}/${jobs.length} imports ok${failed ? `, ${failed} FAILED` : ''}`);
process.exit(failed ? 1 : 0);
