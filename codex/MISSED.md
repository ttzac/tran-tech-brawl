# MISSED: read this first (written by Claude, 2026-11-06)

Your last run stopped with **298 images still available** in the queue (`codex/PROGRESS.md` said "Queue left: 298"). AUTOPILOT.md says to keep going until `node codex/next.mjs` prints **QUEUE EMPTY**, so this is work you missed, not work waiting on anyone. Nothing you made failed validation (`node tools/art/check-raw.mjs`: 0 bad), so there is nothing to redo, only images to make.

## 1. Missed: unlocked Tier 1 images (do these now, in this order; `node codex/next.mjs 10` gives the same order)
| Group | Missing | Images |
|---|---|---|
| heroes/david (approved) | 11 | run_2, run_3, run_4, run_5, run_6, melee_1, melee_2, melee_4, special_1, special_3, hurt_2 |
| fx/global | 27 | fx_hit_heavy_1-6, fx_dust_run_1-4, fx_dust_land_1-5, fx_jump_ring_1-4, fx_ko_blast_1-8 |
| stages/serverroom | 4 | bg_far, bg_mid, plat_main, plat_soft |
| stages/rooftop | 4 | bg_far, bg_mid, plat_main, plat_soft |
| items/icons | 24 | all 8 weapon_*, 8 item_*, 8 powerup_* |
| ui/ui | 6 | logo_game, title_background, title_keyart_roster, hud_frame, hud_stock_icon, hud_boss_bar |

David is the most urgent: he is in the game now with only his 8 finished frames and cannot run, attack or flinch properly until these 11 exist. Match his existing idle_1 scale and anchors exactly (hips x=512, soles y=960, the same normalisation you used for his first 13 frames).

## 2. Then: unlocked Tier 2 and 3 (keep going, the queue moves on to these by itself)
Zac, Chain and David Tier 2 (38 each) and Tier 3 (22 each), global fx Tier 2/3, extra stage layers (serverroom, rooftop, promptfactory, ramvault), and the rest of the UI.

## 3. NEW: everyone is approved (user, 2026-11-06)
The user approved ALL design sheets: Aiden, Anne-Maree, Bec, Caleb, Cameron, Jared, Lachlan, Ryan, Altwave, Muskbot, Chatbot and Neurobot are now `true` in `codex/approvals.json`. Their Tier 1 frames are unlocked and the queue now has **652 images** available. After David, make Tier 1 for each hero in queue order (Aiden, Anne-Maree, Bec, Caleb, Cameron, Jared, Lachlan, Ryan), then the bosses and minions. idle_1 comes first for each character (it is the scale anchor), then the key poses (run_1, melee_3, special_2, hurt_1), then the in-betweens. Their approved `sheet_turnaround.png` is their identity authority. For Jared, use the disc golf design and keep the bag strap on the LEFT shoulder in every frame (ignore the mirrored strap in his rear turnaround view).

## 4. Your questions, answered (Claude has updated `codex/roster.mjs` and re-run `build-prompts.mjs`)
- **Jared:** disc golf is now his main weapon in the roster and prompts (orange driver in the right hand, disc golf bag on a strap over the LEFT shoulder hanging at the right hip, all onsite tools kept, no staff or CRT). His moves were rewritten around the disc. Keep the strap on the same shoulder in every view. Fixing the rear-view strap on his turnaround is fine if you can, but his frames stay locked until the user approves him.
- **Chain:** the ultimate text now says he whirls the 3D-printed katana (no cable).
- **Cameron:** the tattoo is now on his anatomical RIGHT forearm (viewer-left in a front view), matching the photo and your sheets.
The prompt files were regenerated, so **re-read the prompt file for every image** rather than relying on an earlier copy.

## 5. What Claude has done meanwhile (so you know how your art is used)
- Zac and Chain: fully imported and playing (160px frames, import scale 0.15 of your 1024 canvas). Keep that canvas, scale and anchoring for every hero.
- David: his 8 finished frames (idle 1-4, jump, fall, hurt_1, launch) are imported; the rest unlock his animations as soon as they exist.
- The other 8 heroes: a temporary stand-in made from ONE front-view figure cut out of each `sheet_turnaround.png`, plus a portrait cut from `sheet_expressions.png`. These are placeholders; they are replaced when that hero's Tier 1 frames arrive. **Do not treat the stand-ins as approval** and do not change your plan because of them.

## 6. How to finish
Keep looping `node codex/next.mjs 10` -> generate the 10 images in parallel, one image per call -> `node tools/art/check-raw.mjs <group>` -> `node codex/next.mjs --status`, until it prints QUEUE EMPTY. Then update `codex/STATUS.md` and list the sheets still waiting for approval. Write only to `art-raw/`, `codex/STATUS.md` and `codex/PROGRESS.md`.
