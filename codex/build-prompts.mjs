// node codex/build-prompts.mjs
// Generates one ready-to-paste prompt file per image (codex/prompts/**), codex/manifest.json and codex/CHECKLIST.md.
// Never edit generated files by hand: edit roster.mjs / world.mjs / this file and re-run.
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROSTER, FRAMES, PORTRAITS, CHAR_FX } from './roster.mjs';
import { BOSSES, MINIONS, GLOBAL_FX, STAGES, ITEMS, UI } from './world.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const PROMPTS = join(here, 'prompts');
rmSync(PROMPTS, { recursive: true, force: true });

// ---------------------------------------------------------------- shared text blocks
const STYLE = `ART STYLE (the attached APPROVED-style-david-sheet.webp is the final look: match its cleanliness, pixel size, shading and outline EXACTLY; the other style image is only an early concept for mood):
- CLEAN, HIGH-QUALITY 2D pixel art for an arcade brawler, matching the APPROVED STYLE reference (codex/refs/style/APPROVED-style-david-sheet.webp) EXACTLY: a clean, polished, less-pixelated look with fine pixel blocks, smooth tidy edges, soft readable cel shading, crisp outlines. NOT chunky or blocky, NOT noisy, NO blur, NO painterly smoothing, NO 3D render look, NO gradients (use clean 3-4 tone cel shading and a bright rim light).
- Pixel size: fine and uniform, each visible pixel block about 4x4 px on the 1024x1024 canvas (a 256x256 logical grid). Keep the SAME pixel size in every image of every character so frames never mix pixel sizes. Clean lines, no stray single-pixel noise, no dithering clutter on faces.
- Detail level of the approved reference: clean expressive faces (eyes, brows, glasses glints, beard texture), readable fabric folds and seams, gold/teal trim lines, metallic highlights on gear. Same arcade proportions: slightly enlarged head, hands and boots.
- Dark navy outline #0B1026 (never pure black) around every shape, 1 pixel block thick, slightly thicker on the outer silhouette.
- Shading: 3 tones + 1 highlight per material, cel style. Key light warm from the top-left (#FFC857), cool TEAL rim light from the back-right (#2EE6D6).
- Vibrant but controlled palette (about 32 colours per character): TranTech navy #14213D / near-black polo #121B33, teal #19D3C5 and #2EE6D6, amber #FFA31A, warm gold #FFC857, electric blue #3EA6FF, LED green #4DFF88, cream #F6EAD2, skin tones with warm rosy mid-tones. Saturation about 15% higher than the concept image, never neon-garish.
- Brand: the uniform is a dark navy-black polo/top with the TranTech logo patch on the left chest: a small wide RECTANGLE with a teal outline and a tiny white word-mark (do not try to write legible text, a few pixels suggesting letters is right).`;

const SPRITE_RULES = (stand) => `SPRITE OUTPUT RULES (the image is imported by a script, so these are not optional):
1. Canvas exactly 1024x1024, background ONE flat solid MAGENTA #FF00FF. Nothing else in the background: no floor, no cast shadow, no glow, no gradient, no border, no text, no labels, no pose number, no watermark. The character must contain NO magenta, hot pink or purple-pink pixels (the keying colour).
2. ONE pose only. One character only. No turnaround, no collage, no second figure.
3. The character FACES RIGHT (towards the right edge of the canvas).
4. Scale: the standing/idle height is ${stand} (see per-character note) on this 1024 canvas: use the SAME scale in every frame of this character, never zoom per pose. Feet (soles) rest on the horizontal line y=960 whenever the pose is grounded; the body centre (the hips) sits on the vertical line x=512. In air poses keep the same centre and scale.
5. Keep the whole figure and all weapons/hair fully inside the canvas with at least 40 px free on every side.
6. Do not draw attack effects, trails, projectiles, impact bursts, motion lines, dust or shadows in the character image: those are separate images (fx_*). The only exceptions are the tiny sparkles/stars that the pose text explicitly asks for.
7. Likeness, outfit, proportions, colours, tattoos, glasses, hair and logo patch must be IDENTICAL to the approved design sheet and to the previous frames. If a frame disagrees with the sheet, the frame is wrong: regenerate it.`;

const FX_RULES = `EFFECT OUTPUT RULES:
1. Canvas exactly 1024x1024 (or the size stated), background ONE flat solid MAGENTA #FF00FF, nothing else in the background. The effect must contain NO magenta/hot pink pixels (use violet #9B5CFF or pink-orange #FF8A5C if you need pinks).
2. ONE frame of the animation per image, centred on the canvas; the effect's origin point (where the swing/impact/projectile is anchored) is at the exact centre x=512, y=512 so the frames line up when stacked.
3. The effect faces / travels to the RIGHT where it has direction.
4. Same pixel-art style as the character sprites (fine uniform 4x4 px pixel blocks, clean smooth shapes, navy outline where a shape needs it, bright white-hot cores, no blur). No characters in effect images.
5. Frames of one effect must keep the same scale, palette and origin, only the animation changes.`;

const BG_RULES = `ENVIRONMENT OUTPUT RULES:
1. Same clean fine-pixel style as the approved reference: tidy hard pixels, no blur, no 3D look, dark navy outline on foreground objects, muted lower-contrast colours for the far layers so fighters stay readable, rich saturated accents only in props.
2. No characters, no text, no logos of real companies.
3. Where "on magenta" is stated: flat solid MAGENTA #FF00FF behind the object, with no magenta in the art itself. Where it says nothing about magenta, fill the whole canvas.
4. Keep the CENTRE band (the middle 40% of the width, lower 60% of the height) quiet and low-contrast: fighters play there.
5. Use the exact pixel size stated; if your generator cannot make that size, generate the nearest 16:9 / wide size and tell Zac what size you produced.`;

const ICON_RULES = `ICON OUTPUT RULES: 512x512, ONE object centred, flat solid MAGENTA #FF00FF background (no magenta in the object), pixel art in the same style (clean, fine 3x3 px blocks, no blur), navy outline, bold readable silhouette that still reads at 48x48, a small amber/teal highlight accent, rarity glow only if the name says "epic" (violet #9B5CFF glow).`;

// ---------------------------------------------------------------- helpers
const manifest = [];
const files = new Map();
const pad = (n) => String(n).padStart(2, '0');
function add(cat, group, name, tier, prompt, refs, out, extra = {}) {
  const rel = `prompts/${cat}/${group}/${name}.txt`;
  files.set(rel, prompt);
  manifest.push({ id: `${group}/${name}`, category: cat, group, name, tier, prompt: rel, refs, out, ...extra });
}
const sub = (t, c) => t
  .replace(/\{w\}/g, c.weapon).replace(/\{m\}/g, c.meleeName ?? '').replace(/\{m2\}/g, c.melee2Name ?? '')
  .replace(/\{s\}/g, c.specialName ?? '').replace(/\{u\}/g, c.ultName ?? '').replace(/\{i\}/g, c.idle ?? '')
  .replace(/\{t\}/g, c.taunt ?? '').replace(/\{v\}/g, c.victory ?? '').replace(/\{fx\}/g, c.fx ?? '');
const nameOf = (s) => (s.match(/"([^"]+)"/) ?? [])[1] ?? s.split(':')[0];

// ---------------------------------------------------------------- heroes
for (const c of ROSTER) {
  const standNote = c.id === 'aiden' ? '640 px x 1.15 = about 735 px tall (the biggest hero)' : c.id === 'lachlan' ? 'about 690 px tall (very tall)' : c.id === 'jared' ? 'about 660 px tall' : 'about 640 px tall';
  const cc = { ...c, meleeName: nameOf(c.melee), melee2Name: nameOf(c.melee2), specialName: nameOf(c.special), ultName: nameOf(c.ultimate) };
  const bible = `CHARACTER: ${c.name.toUpperCase()}, "${c.title}" (${c.role}). A stylised arcade-hero caricature of a REAL TranTech staff member, so the face and body must be recognisably THEM, flattering and fun.
REFERENCE PHOTO: attached as codex/refs/photos/${c.photo}. Study it for face shape, hair, facial hair, glasses, skin tone, build and expression. Do not copy the photo's background or clothes literally; convert into the game style.
BUILD: ${c.build}.
LIKENESS (must be recognisable): ${c.likeness}
OUTFIT: ${c.outfit}
SIGNATURE WEAPON: ${c.weapon}.
FX COLOURS: ${c.fx}.
PERSONALITY / SIGNATURE QUIRK (this is what makes them unique, show it in the design and every pose): ${c.bio}
EXTRA DETAIL: ${c.quirk}${c.needsPhoto ? `\n\n*** BLOCKED: there is no photo of this person yet. Do not generate until codex/refs/photos/${c.photo} exists and the LIKENESS line has been filled in from it. ***` : ''}`;
  const refsBase = [`codex/refs/photos/${c.photo}`, 'codex/refs/style/APPROVED-style-david-sheet.webp', 'codex/refs/style/concept-v1.webp'];
  const sheetRef = `art-raw/heroes/${c.id}/sheet_turnaround.png (APPROVED version)`;
  const anchor = `art-raw/heroes/${c.id}/idle_1.png (APPROVED version, once it exists)`;
  const refsFor = (n) => (n === 'sheet_turnaround' ? refsBase : n === 'idle_1' ? [...refsBase, sheetRef] : [...refsBase, sheetRef, anchor]);

  // Design sheets / portraits
  for (const [name, tier, text] of PORTRAITS) {
    const size = name === 'sheet_turnaround' ? '2048x1024 (wide: 3 full-body views + 2 close-ups)' : name === 'sheet_expressions' ? '1536x1024' : name === 'keyart_select' ? '1024x1536 (portrait)' : name.startsWith('portrait') || name === 'icon_hud' ? '1024x1024' : '1024x1024';
    const body = `${STYLE}\n\n${bible}\n\nTASK: ${sub(text, cc)}\n\nOUTPUT: ${size}. ${name === 'keyart_select' ? 'Background: a simple dark teal-navy vignette with energy streaks.' : 'Background ONE flat solid MAGENTA #FF00FF, no shadows, no text, no labels, no magenta in the character.'} ${name.startsWith('sheet') ? '' : 'Face and costume MUST match the approved design sheet.'}`;
    add('heroes', c.id, name, tier, body, name === 'sheet_turnaround' ? refsBase : [...refsBase, sheetRef], `art-raw/heroes/${c.id}/${name}.png`);
  }
  // Animation frames: one image per frame
  for (const [name, tier, text] of FRAMES) {
    const body = `${STYLE}\n\n${bible}\n\n${SPRITE_RULES(standNote)}\n\nPOSE TO DRAW (this single image only): ${sub(text, cc)}\n\nMove names for context: melee "${cc.meleeName}", combo finisher "${cc.melee2Name}", special "${cc.specialName}", ultimate "${cc.ultName}". Melee = ${c.melee} Special = ${c.special} Ultimate = ${c.ultimate}`;
    add('heroes', c.id, name, tier, body, refsFor(name), `art-raw/heroes/${c.id}/${name}.png`, { anim: name.replace(/_\d+$/, '').replace(/2$/, '2'), frame: Number(name.split('_').pop()) });
  }
  // Effects: one image per frame
  for (const [name, tier, n, text] of CHAR_FX) {
    for (let k = 1; k <= n; k++) {
      const body = `${STYLE}\n\nHERO CONTEXT: ${c.name} "${c.title}". Weapon: ${c.weapon}. FX colours: ${c.fx}. Melee: ${c.melee} Special: ${c.special} Ultimate: ${c.ultimate}\n\n${FX_RULES}\n\nTHIS IMAGE: frame ${k} of ${n}. ${sub(text, cc)}`;
      add('heroes', c.id, `${name}_${k}`, tier, body, [...refsBase.slice(1), sheetRef], `art-raw/heroes/${c.id}/${name}_${k}.png`, { kind: 'fx' });
    }
  }
}

// ---------------------------------------------------------------- bosses
for (const b of BOSSES) {
  const bible = `BOSS: ${b.name.toUpperCase()}. A parody supervillain for a TranTech game (a cartoon, never a likeness of a real person; no real company logos).
LOOK: ${b.look}
SIZE: ${b.stand}.
MOVES: ${b.melee} ${b.special}`;
  const stand = b.stand;
  const refs = ['codex/refs/style/APPROVED-style-david-sheet.webp', 'codex/refs/style/concept-v1.webp', 'docs/art/sheet-v2.webp (old version of this boss, for orientation only; redesign it better)'];
  add('bosses', b.id, 'sheet_turnaround', 0, `${STYLE}\n\n${bible}\n\nTASK: CHARACTER DESIGN SHEET (approval step, generate FIRST): front, side (facing right) and back full-body views plus a face close-up, on magenta, no text. 2048x1024.`, refs, `art-raw/bosses/${b.id}/sheet_turnaround.png`);
  add('bosses', b.id, 'portrait_boss', 1, `${STYLE}\n\n${bible}\n\nTASK: boss intro portrait / HUD bust, menacing expression, magenta background, 1024x1024, no text.`, [...refs, `art-raw/bosses/${b.id}/sheet_turnaround.png`], `art-raw/bosses/${b.id}/portrait_boss.png`);
  for (const [name, tier, text] of b.frames) {
    add('bosses', b.id, name, tier, `${STYLE}\n\n${bible}\n\n${SPRITE_RULES(`${stand} (at idle) on this 1024 canvas; this boss is LARGER than a hero so scale the figure to roughly 820 px tall at idle for Altwave's chair-height or 900 px tall for Musk-Bot, still fully inside the canvas`)}\n\nPOSE TO DRAW (this single image only): ${text}`, [...refs, `art-raw/bosses/${b.id}/sheet_turnaround.png`, `art-raw/bosses/${b.id}/idle_1.png`], `art-raw/bosses/${b.id}/${name}.png`);
  }
  for (const [name, tier, n, text] of b.fx) for (let k = 1; k <= n; k++)
    add('bosses', b.id, `${name}_${k}`, tier, `${STYLE}\n\nBOSS CONTEXT: ${b.name}. ${b.melee} ${b.special}\n\n${FX_RULES}\n\nTHIS IMAGE: frame ${k} of ${n}. ${text}`, [...refs.slice(0, 2), `art-raw/bosses/${b.id}/sheet_turnaround.png`], `art-raw/bosses/${b.id}/${name}_${k}.png`, { kind: 'fx' });
}

// ---------------------------------------------------------------- minions
for (const m of MINIONS) {
  const bible = `MINION: ${m.name.toUpperCase()}, colour ${m.tint}. ${m.look} Cute-but-menacing arcade enemy, readable at 64px.`;
  const refs = ['codex/refs/style/APPROVED-style-david-sheet.webp', 'codex/refs/style/concept-v1.webp'];
  add('minions', m.id, 'sheet_turnaround', 0, `${STYLE}\n\n${bible}\n\nTASK: design sheet (front, side facing right, 3/4, plus 4 face expressions) on magenta, 2048x1024, no text.`, refs, `art-raw/minions/${m.id}/sheet_turnaround.png`);
  for (const [name, tier, text] of m.frames)
    add('minions', m.id, name, tier, `${STYLE}\n\n${bible}\n\n${SPRITE_RULES('about 330 px tall (minions are small: about half the size of a hero)')}\n\nPOSE TO DRAW (this single image only): ${text}`, [...refs, `art-raw/minions/${m.id}/sheet_turnaround.png`], `art-raw/minions/${m.id}/${name}.png`);
}

// ---------------------------------------------------------------- global fx
for (const [name, tier, n, text] of GLOBAL_FX) for (let k = 1; k <= n; k++)
  add('fx', 'global', `${name}_${k}`, tier, `${STYLE}\n\n${FX_RULES}\n\nTHIS IMAGE: frame ${k} of ${n}. ${text} Use white-hot/yellow neutral colours so the game can tint it (except where the text names colours).`, ['codex/refs/style/APPROVED-style-david-sheet.webp'], `art-raw/fx/${name}_${k}.png`, { kind: 'fx' });

// ---------------------------------------------------------------- stages
for (const s of STAGES) {
  const refs = ['codex/refs/style/APPROVED-style-david-sheet.webp', 'codex/refs/style/concept-v1.webp'];
  for (const [name, tier, text] of s.layers)
    add('stages', s.id, name, tier, `${STYLE}\n\n${BG_RULES}\n\nSTAGE: ${s.name}. MOOD: ${s.mood}\n\nTHIS IMAGE: ${text}`, name === 'bg_far' ? refs : [...refs, `art-raw/stages/${s.id}/bg_far.png`], `art-raw/stages/${s.id}/${name}.png`);
  add('stages', s.id, 'preview', 2, `${STYLE}\n\n${BG_RULES}\n\nSTAGE: ${s.name}. MOOD: ${s.mood}\n\nTHIS IMAGE: a 1920x1080 STAGE PREVIEW / loading-screen illustration, wide dramatic composition of the stage (no characters), used on the stage-select screen.`, refs, `art-raw/stages/${s.id}/preview.png`);
}

// ---------------------------------------------------------------- items and ui
for (const [id, desc] of ITEMS)
  add('items', 'icons', id, 1, `${STYLE}\n\n${ICON_RULES}\n\nTHIS ICON: ${desc}.`, ['codex/refs/style/APPROVED-style-david-sheet.webp'], `art-raw/items/${id}.png`);
for (const [name, tier, text] of UI)
  add('ui', 'ui', name, tier, `${STYLE}\n\nUI ASSET RULES: flat solid MAGENTA #FF00FF background where the asset is not full-screen, hard pixels, no blur, no real brand logos, exact pixel size as stated (or the nearest size your generator supports, and tell Zac which).\n\nTHIS IMAGE: ${text}`, ['codex/refs/style/APPROVED-style-david-sheet.webp'], `art-raw/ui/${name}.png`);

// ---------------------------------------------------------------- write
for (const [rel, text] of files) {
  const f = join(here, rel);
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, text + '\n');
}
writeFileSync(join(here, 'manifest.json'), JSON.stringify(manifest, null, 1));

const byTier = (t) => manifest.filter((m) => m.tier === t);
let md = `# Codex checklist (generated by build-prompts.mjs; tick as you go)\n\nTotal images: ${manifest.length}. Tier 0 = design sheets (approve first), 1 = needed for the game to play, 2 = polish, 3 = extras.\n\n`;
for (const t of [0, 1, 2, 3]) {
  md += `## Tier ${t} (${byTier(t).length} images)\n`;
  const groups = {};
  for (const m of byTier(t)) (groups[`${m.category}/${m.group}`] ??= []).push(m);
  for (const [g, list] of Object.entries(groups)) md += `- [ ] **${g}** (${list.length}): ${list.map((m) => m.name).join(', ')}\n`;
  md += '\n';
}
writeFileSync(join(here, 'CHECKLIST.md'), md);

// character summary
let ch = `# Roster summary (generated)\n\n| Hero | Title | Role | Weapon | Melee | Special | Ultimate |\n|---|---|---|---|---|---|---|\n`;
for (const c of ROSTER) ch += `| ${c.name} | ${c.title} | ${c.role} | ${c.weapon.split('(')[0].trim()} | ${nameOf(c.melee)} | ${nameOf(c.special)} | ${nameOf(c.ultimate)} |\n`;
writeFileSync(join(here, 'ROSTER_SUMMARY.md'), ch);

console.log(`wrote ${manifest.length} prompts. Tier counts:`, [0, 1, 2, 3].map((t) => `T${t}=${byTier(t).length}`).join(' '));
