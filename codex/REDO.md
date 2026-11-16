# REDO: frames that are wrong and need regenerating (written by Claude, 2026-11-13)

Found while importing the 2026-11-13 batch. File counts say 86/86 for every hero, but these files are not usable.
The game currently leaves the "wrong art" frames out (`SKIP` in `tools/art/import-all.mjs`) and resizes the "wrong size"
frames on import (`RESCALE` in the same file). When a frame here is regenerated, tell Claude so the entry can be removed.

Rules that were broken, for every redo: same character scale as that hero's `idle_1` (same head size), soles on y=960,
hips on x=512, 40px clear margin, flat #FF00FF background with no pink inside the art.

## 1. Wrong art (left out of the game)
| File | Problem |
|---|---|
| `heroes/david/ultimate_6.png` | It is **Aiden** (glasses, goatee, server gauntlets), not David. Still wrong after the 2026-11-13 13:08 rewrite. The identity audit in STATUS.md missed it |
| `heroes/jared/victory_2.png` | A "19 99" scoreboard graphic with no character in it |
| `heroes/cameron/special_4.png`, `special_5.png`, `melee2_2.png`, `ultimate_4.png`, `respawn_2.png` | All five are the same standing-with-laptop image (identical 638x332 subject). Each needs its own pose from its prompt |
| `heroes/cameron/ultimate_2.png` | Nearly empty: the subject is about 124x102 px |
| `stages/serverroom/bg_near.png`, `stages/rooftop/bg_near.png` | The artwork itself is tinted magenta/purple (key colour bled into the whole layer), so it cannot be keyed. Not imported |

## 2. Wrong size (the importer resizes these for now; a redraw at the right size would be sharper)
- **Jared, Lachlan, Ryan: every Tier 1 frame** (`idle_*`, `run_*`, `jump_1`, `fall_1`, `melee_*`, `special_1..3`, `hurt_*`, `launch_1`) is about a third bigger than all their later frames and than the other heroes (idle about 930-960 px tall instead of about 700), with the feet on y=980-992 instead of 960. Their Tier 2/3 frames are the correct size.
- **Bec:** `run_1..6`, `fall_1`, `launch_1`, `melee_2`, `melee_3`, `special_1..3`, `hurt_1` are 20-55% bigger than her `idle_1`.
- **Caleb:** `idle_3`, `idle_4` are about 22% bigger than `idle_1`/`idle_2` (the idle loop pulses); `run_*`, `jump_1`, `fall_1`, `melee_*`, `hurt_*`, `launch_1` are 12-28% too big.
- **Cameron:** `idle_2..4` are 11-22% bigger than `idle_1`; `run_*`, `jump_1`, `fall_1`, `melee_1..3`, `special_2`, `hurt_*`, `launch_1` are 12-27% too big; `ultimate_6`, `respawn_3`, `victory_3` are about 25% too small.
- **Anne-Maree:** `run_2`, `run_5` are about 20% smaller than the rest of her run cycle.
- **Aiden:** `land_1`, `land_2` are 25-40% too big.
- Smaller drift, not corrected: `melee2_1` / `melee2_4` for Bec, Caleb, Cameron (65-71% of idle height), David `respawn_1..3` and `jump_2`, Lachlan `run_3`.

## 3. Still open from `codex/REVIEW.md`
Run `node tools/art/check-raw.mjs` for the current list (about 140 files, mostly effects touching the canvas edge and
key-colour bleed). Effects that touch the edge still import fine; body frames that are clipped do not.

## 4. Found in the 2026-11-16 audit (Claude)
Wrong character in the file (left out of the game):
| File | Problem |
|---|---|
| `bosses/altwave/launch_1.png` | It is **Musk-Bot**, not Altwave |
| `bosses/muskbot/hurt_1.png` | It is a small **Chatbot**, not Musk-Bot |
| `minions/chatbot/idle_2.png` | It is **Musk-Bot**, not the Chatbot |
| `heroes/lachlan/idle_4.png` | Lachlan without his goggles (also `melee_3`): the idle loop flickered |

Sizes: section 2 is now handled per frame by `tools/art/rescale.json` (every frame of every character measured; see `docs/art/measure/`).
Still worth a redraw because they are drawn very small and get enlarged: Bec `ultimate_2`, `ko_1`; Chatbot `attack_2` (about 45% size);
Cameron `jump_2`; most Tier 2/3 frames of Jared, Lachlan, Ryan, Bec (drawn about 70% of their idle).
Clipped by the canvas edge: Lachlan `run_3`, `jump_1`, `fall_1`; Caleb `fall_1`, `ultimate_3`; Jared `fall_1`; Zac `melee_3`.
Outfit drift: Bec `run_1` has no scarf and different boots.
