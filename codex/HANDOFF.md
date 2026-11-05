# HANDOFF TO CODEX: all artwork for TranTech Brawl

> **UPDATE v2 (read first).** (1) Zac: hair is LIGHT BROWN, not auburn or ginger; the beard is warm copper-brown. (2) Every hero now has a personality quirk (field `bio` in `roster.mjs`) that must show in the design: re-read the whole Zac entry. (3) Roster is **11**: David (the boss) was added; his photo `codex/refs/photos/david.jpeg` is now in place and his likeness is filled in; Anne-Maree is his wife and also the boss; Bec is the accounts lady; Caleb has a wakeboard (no office chair); Chain 3D-prints; Lachlan is a digital MacGyver with an old red ute; Aiden is a programmer; Ryan is the seasoned veteran tech; Cameron and Lachlan have light brown hair. (4) Total prompts are now **1221**: re-read `codex/manifest.json` and `codex/prompts/`. (5) Design sheets may be multi-image; everything else is one image per asset. (6) **STYLE v3: the user approved the cleaner, less pixelated look of `codex/refs/style/APPROVED-style-david-sheet.webp` (David's design sheet). Match it exactly for every asset. Pixels are fine and uniform (~4x4 px on the 1024 canvas). Redo the Zac and David design sheets in this style first, then start the whole production again from scratch with this look.**

You (Codex) own **all image generation and character/game-asset creation**. Claude owns the game code, the import tools and the wiring. We work in parallel and never edit each other's folders.

> Read this file fully, then `codex/ART_BIBLE.md`, then start at "Phase 0".

## 1. The project in one paragraph
TranTech Brawl is a browser 2D platform fighter (Smash-style, co-op) starring the **real TranTech Computers staff** as heroes against parody AI-company bosses and bot armies. It must look like *our own* game: every hero has to be **instantly recognisable as the real person** (from their staff photo), in a high-quality, vibrant pixel-art arcade style. The art-direction concept is `codex/refs/style/art-direction-concept.webp` (also `concept-v1.webp`). We want it **one notch higher in quality and slightly more vibrant** than that concept: finer detail, cleaner faces, richer colour, same chunky arcade charm.

## 2. What changed from the previous round (read this)
- The old art (a single mega-sheet of poses made in one image) is **thrown away**. We do **not** make sheets with many poses in one image any more. Quality drops and characters drift.
- **Rule #1: every pose, every animation frame, every effect frame, every icon, every background layer is its own separate image** with its own prompt. 1221 prompts are pre-written for you in `codex/prompts/` (see section 5).
- **Zac is redone from scratch.** The existing `public/assets/sprites/helpdesk.*`, `public/assets/portraits/helpdesk.png` and `docs/art/*helpdesk*` are the *old* Zac: do not use them as a reference for the likeness (the old one does not look enough like Zac). Use only the photo `codex/refs/photos/zac.jpeg`.
- The roster is now **11 real heroes**, not 3 archetypes. The three concept archetypes (Helpdesk Hero / Network Ninja / Sysadmin Tank) are folded into **Zac / Chain / Aiden**. The full list, likeness notes, quirks, weapons, moves and ultimates are in `codex/roster.mjs` (human summary: `codex/ROSTER_SUMMARY.md`).

## 3. Roster (11 heroes, photos in codex/refs/photos/)
| Priority | Hero | Photo | Archetype and signature quirk |
|---|---|---|---|
| 1 | Zac | zac.jpeg | The Minimalist: slim keyboard-blade + floating white AI puck (loves minimalist AI gadgets and tools) |
| 1 | Chain | chain.jpeg | The Maker Ninja: Cat6 chain-whip with a 3D-printed head, prints kunai in mid-air (into 3D printing) |
| 1 | Aiden | aiden.jpeg | The Full-Stack Tank: code-scrolling server-rack gauntlets (a programmer) |
| 2 | David | david.jpeg | The Big Boss: owner, briefcase-shield and APPROVED stamp. photo now supplied |
| 2 | Anne-Maree | annemaree.jpeg | The Co-Boss: David's wife, also the boss; golden gavel + executive clipboard shield |
| 2 | Bec | bec.jpeg | The Accounts Ace: the accounts lady; calculator shield, receipt-tape whip, PAID stamp |
| 2 | Caleb | caleb.jpeg | The Wakeboarder: carries and rides a wakeboard, water + Wi-Fi wake |
| 2 | Cameron | cameron.jpeg | The Root User: laptop spell-book + terminal vines. **Light brown hair, not ginger** |
| 2 | Jared | jared.jpeg | The Greybeard: veteran of legacy systems, CRT staff, floppy-disk star |
| 2 | Lachlan | lachlan.jpeg | The Digital MacGyver: technical/mechanical know-how, duct-tape gadgets, older RED UTE ultimate. **Light brown hair, not ginger** |
| 2 | Ryan | ryan.jpeg | The Old Hand: experienced, well-seasoned tech; battle-worn gear, grapple hook, drill |

Likeness is the whole point. For **each** hero, the face, hair, facial hair, glasses, skin tone, build and any tattoos must clearly match the photo, in caricature form (slightly bigger head, hands and boots). Do **not** swap hair colour, glasses, beard or tattoos for "cooler" ones. The cool part is the weapons, poses and effects, not changing the person. Weapons, titles, moves and roles are creative placeholders we picked from the photos; Zac may change them later, so keep them in `roster.mjs`.

## 4. Hard technical rules (the importer depends on them)
1. **Sprites / effects / icons**: flat solid **magenta #FF00FF** background, nothing else behind the subject (no floor, shadow, glow, text, labels). The art itself must contain **no magenta/hot pink** (use violet `#9B5CFF` or orange-pink `#FF8A5C`). The only exception is the RAM Vault stage which uses green `#00FF00` as its key colour.
2. Hero/boss/minion frames are **1024x1024**, **character faces right**, **same scale in every frame of that character**, **feet on y=960**, **body centre on x=512**, 40 px free margin. If a pose needs a different scale or position, the frame is wrong.
3. **No effects in body frames** (no trails, projectiles, impacts, dust, shadows). Those are the separate `fx_*` images. Tiny stars on the KO pose are the one exception.
4. **Pixel look (changed in v3, matches the approved David sheet `refs/style/APPROVED-style-david-sheet.webp`)**: clean, polished, LESS pixelated pixel art: fine uniform pixel blocks (about 4x4 px on the 1024 canvas, a 256x256 logical grid), tidy smooth edges, soft cel shading with a teal rim light, crisp navy `#0B1026` outline, no blur, no painterly/3D look, no stray noise. The SAME pixel size in every image, so frames never mix pixel sizes. Chunky 8 px blocks (the first concept) are out.
5. **One pose per image.** No turnaround/collage except the design sheets (`sheet_turnaround`, `sheet_expressions`, `keyart_select`).
6. **No real company logos, no real people's likenesses for the parody bosses.** Only the TranTech staff are real likenesses.
7. File naming and location are fixed by `manifest.json` (`out` field), e.g. `art-raw/heroes/zac/run_3.png`. Never rename. PNG only.

If your generator cannot honour the exact size, produce the nearest size with the same aspect ratio and write the real size in `codex/STATUS.md`; Claude's importer normalises it.

## 5. The prompts: how to use them
```
node codex/build-prompts.mjs      # regenerates everything below (already run once)
codex/manifest.json               # every image: id, tier, prompt file, reference images, output path
codex/prompts/<category>/<group>/<name>.txt   # ready-to-paste full prompt for ONE image
codex/CHECKLIST.md                # tick boxes by tier and group
codex/roster.mjs  codex/world.mjs # the source data; change a character HERE and regenerate
```
Categories: `heroes` (11 x 86 images), `bosses`, `minions`, `fx` (global), `stages`, `items`, `ui`. Tiers: **0** design sheets (approve first), **1** needed to play, **2** polish, **3** extras.

### Per-image procedure (every single image)
1. Open the prompt file for the image.
2. Attach the references listed in `manifest.json` for that image: **always** the photo (heroes), the style concept, the approved `sheet_turnaround.png` of that character, and for any frame after `idle_1`, the approved `idle_1.png` as the **scale/anchor** reference. For animation frames also attach the **previous frame** of the same animation so the pose flows.
3. Generate **one** image. Check it against the QA list (section 7). Redo until it passes. Never keep a "close enough" frame: one bad frame ruins the animation.
4. Save to the `out` path. Tick it in `CHECKLIST.md`.

Consistency tips that work: generate all frames of one hero **in the same session/thread**; paste the character block first, then the pose; keep the seed/model/size settings identical; if a pose drifts (hair colour, glasses, logo side, proportions), regenerate with the sheet attached again.

## 6. Order of work (strict, with approval gates)
**Phase 0, setup (10 min).** Read `ART_BIBLE.md`. Open each photo. Run `node codex/build-prompts.mjs`. Create `codex/STATUS.md` (a table: id, status, notes). Move nothing in `src/` or `public/`.

**Phase 1, Zac, from scratch (GATE 1: Zac approves).**
1. `heroes/zac/sheet_turnaround` then `heroes/zac/sheet_expressions`. Compare side by side with `zac.jpeg`: hair shape and colour, beard shape, jaw, eyes, skin, tattoos on both forearms, polo + teal collar + logo patch. Redo until it is unmistakably Zac.
2. **Stop and show Zac the two sheets.** Do not generate frames before approval.
3. After approval: `portrait_neutral`, `icon_hud`, then all **Tier 1** frames for Zac in order (`idle_1..4, run_1..6, jump_1, fall_1, melee_1..4, special_1..3, hurt_1..2, launch_1`), then Tier 1 effects.
4. Tell Claude "Zac tier 1 ready" in `STATUS.md`. Claude imports it and wires it into the game for Zac to play. Continue with Tier 2 while that happens.

**Phase 2, Chain and Aiden (the two other concept heroes).** Same steps, one at a time (sheet, approval, tier 1).

**Phase 3, bosses, minions, stages, global fx.** `bosses/altwave`, `bosses/muskbot`, `minions/*` (sheet first, then Tier 1), `stages/serverroom` and `stages/rooftop` Tier 1 layers, `fx/global` Tier 1, `items/icons` (24), `ui/` Tier 1.

**Phase 4, the other 8 heroes**, in the order Anne-Maree, Bec, Caleb, Cameron, Jared, Lachlan, Ryan, then David. Sheet, approval, Tier 1.

**Phase 5, Tier 2 for everyone** (land, combo finisher, ultimate, respawn, KO, fx for melee/special, boss intros/defeats, stage props), then **Tier 3** (taunts, victory, auras, extra stages Prompt Factory and RAM Vault, title key art).

Ship incrementally: after each hero's Tier 1, update `STATUS.md`. Do not batch everything to the end.

## 7. QA checklist for every image (reject if any "no")
- [ ] Right size/aspect, magenta (or stated) background, flat, no text/labels/shadow.
- [ ] Faces right; feet on y=960; body centre x=512; scale matches `idle_1` (put the two side by side).
- [ ] The person is recognisable next to the photo (hair, beard, glasses, skin, tattoos).
- [ ] Outfit identical to the sheet: polo colour, collar colour, logo patch on the **left chest** (viewer's right when facing front; when facing right in side view, the patch is on the far/near side consistently, keep it as in the sheet).
- [ ] Weapon identical in shape and colour to the sheet.
- [ ] Pixel size uniform, no blur/gradient/anti-aliasing, navy outline.
- [ ] No effects baked in (except the allowed ones). No magenta in the art.
- [ ] Pose matches the prompt and animates correctly from the previous frame.

## 8. Cool-effect brief (go wild, but keep it readable)
Each hero has their own **signature look**: weapon trail shape (keycaps, RJ45 data-stream, LED shockwave, ink stamps, violet rings, Wi-Fi arcs, terminal text, CRT glow, solder sparks, drill spirals), their own **special projectile**, own **impact**, own **ultimate**, own **aura**. Effects should have a white-hot core, saturated mid-colour, darker edge, pixel-dithered fade, and an optional few flying debris pixels themed on the weapon. Effects must read at small size (the game shows fighters at about 0.7x) and must not hide the fighters. Bosses get big telegraphed effects (contract slam, prompt flood, stomp shockwave, twin laser, thrusters). The global set (hit sparks small/medium/heavy, KO blast, dust, rings, respawn pad, shield bubble, pickup glow, confetti) is shared by everybody.

## 9. Delivery contract with Claude (parallel work)
| Codex does | Claude does |
|---|---|
| All images in `art-raw/**` (nothing else) | `tools/art/*` importers + validator, `src/**`, `public/assets/**`, tests |
| `codex/STATUS.md` progress and questions | Reads `STATUS.md`, imports ready groups, wires heroes/fx/stages |
| Fix/re-do images flagged in `codex/REVIEW.md` | Writes `codex/REVIEW.md` with per-image rejections (size, scale drift, magenta bleed, off-model) |
| Keeps `roster.mjs` / `world.mjs` in sync if a move/weapon changes | Adds the 11 heroes, moves, ultimates, effects playback and menus in the game |

Folder layout you create:
```
art-raw/heroes/<id>/<name>.png         e.g. art-raw/heroes/zac/run_3.png, fx_melee_trail_2.png, portrait_neutral.png
art-raw/bosses/<id>/...   art-raw/minions/<id>/...   art-raw/fx/<name>_<n>.png
art-raw/stages/<id>/bg_far.png ...     art-raw/items/<name>.png     art-raw/ui/<name>.png
```
Claude's validator (`node tools/art/check-raw.mjs`) lists missing/invalid files against `manifest.json`; run it yourself before telling Claude a group is ready.

## 10. Do not
- Do not make multi-pose sheets (except the design sheets). Do not make 2x2 grids to "save time".
- Do not change a hero's looks, outfit colours, weapon or logo side between frames.
- Do not invent extra characters or rename files. Do not touch `src/`, `public/` or `tools/`.
- Do not use real brand logos or a real person's likeness for the parody bosses.
- Do not skip the approval gates (design sheet -> Zac approves -> frames).

## 11. Questions to put to Zac in `STATUS.md` (Claude will relay)
1. Are the titles/weapons/moves for each person OK (they were picked from the photos)? Anyone to change? 2. Pronouns/roles: do any of the staff have a real TranTech role we should theme instead? 3. OK to have 10 heroes at launch? 4. Any hero to add or drop?
