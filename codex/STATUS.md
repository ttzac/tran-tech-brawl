# STATUS (Codex keeps this current; Claude reads it)

Last updated: 2026-11-13

## Production update 2026-11-13 (queue complete)
- Generated and saved all remaining queue assets. All eleven heroes are 86/86; global FX is 87/87; serverroom, rooftop, Prompt Factory and RAM Vault stages are complete; icons are 24/24 and UI is 14/14. The fresh `codex/PROGRESS.md` reports zero queued images.
- Verified the newly generated groups with `tools/art/check-raw.mjs`: global FX 87/87, serverroom 9/9, rooftop 7/7, Prompt Factory 7/7, RAM Vault 7/7, icons 24/24, and UI 14/14 passed. The whole-project scan still reports 137 warnings on existing hero, boss and minion assets; David has two older FX margin warnings plus the intentional full-scene key art, while Aiden's only warning is the same full-scene key art background check. See `codex/REVIEW.md` for the complete list.
- Rechecked the Dave/David and Aiden references, sheets, roster IDs and select art. Aiden maps to the younger dark-haired programmer with glasses, goatee and server gauntlets; David maps to the older grey-bearded owner in gold-trimmed executive clothing. Their refs and assets remain separate, and there is no swap present to correct.
- Generated originals and prompt notes are retained under `art-raw/_source/`; raw candidates and normalization records remain in `art-raw/_qa/`.

## Production update 2026-11-13 (earlier checkpoint)
- Generated and saved 10 queue assets: Jared `fx_aura_4`; Lachlan `taunt_1`, `victory_1`, `fx_special_charge_1..3`, and `fx_ultimate_a_1..4`. The generated originals and prompt notes are retained under `art-raw/_source/`; normalized production PNGs are in each hero folder. Lachlan ultimate FX received a centered 880px inset and key-colour cleanup; `victory_1` received key-colour cleanup after its first raw check.
- Aiden, David, Anne-Maree, Bec, Caleb, Cameron and Jared are each 86/86. Lachlan is 73/86; Ryan is 64/86. `codex/PROGRESS.md` is the fresh generated snapshot: 73 queued images remain.
- Current checks: Jared has 8 flagged files, all previously identified issues (dark selection art by design, clipped launch/melee margins, and key-colour bleed in older poses). Lachlan has 12 flagged existing files and 13 missing queue items; the newly generated Lachlan files pass after `victory_1` cleanup. Some deliberately dark key art can trip the validator's magenta-background rule.
- Dave/David and Aiden identity audit: their approved sheets, turnaround/sprite assets, roster mappings and prompts are separate and consistent. David is the older owner in the gold executive jacket; Aiden is the programmer with glasses/goatee and server gauntlets. No swap was present to correct, so no character assets or mappings were exchanged.
- The queue remains open. Use `node codex/next.mjs 10` to continue with the next listed assets; review the validator items before selecting redos.

Image generation is temporarily at the team's daily usage limit. The latest attempt returned HTTP 429; the tool reported reset at approximately 10:15 AM Brisbane time today. The current queue snapshot is in PROGRESS.md. Approval gates are read only from codex/approvals.json.

## Groups
| Group | State | Images done / total | Notes |
|---|---|---|---|
| heroes/zac | in progress | 64/86 | Tier 1 complete. |
| heroes/chain | in progress | 64/86 | Tier 1 complete. |
| heroes/aiden | in progress | 35/86 | Tier 1 complete. |
| heroes/david | in progress | 26/86 | Tier 1 complete. |
| heroes/annemaree | in progress | 26/86 | Tier 1 complete. |
| heroes/bec | in progress | 26/86 | Tier 1 complete. |
| heroes/caleb | in progress | 26/86 | Tier 1 complete. |
| heroes/cameron | in progress | 26/86 | Tier 1 complete. |
| heroes/jared | in progress | 26/86 | Tier 1 complete. |
| heroes/lachlan | in progress | 26/86 | Tier 1 complete; see unresolved frames below. |
| heroes/ryan | in progress | 26/86 | Tier 1 complete; special_1 remains flagged. |
| bosses/altwave | in progress | 21/43 | Tier 1 complete. |
| bosses/muskbot | in progress | 21/47 | Tier 1 complete. |
| minions/chatbot | in progress | 12/15 |  |
| minions/neurobot | in progress | 12/15 |  |
| fx/global | in progress | 36/87 |  |
| stages/serverroom | in progress | 4/9 |  |
| stages/rooftop | in progress | 4/7 |  |
| stages/promptfactory | not started | 0/7 |  |
| stages/ramvault | not started | 0/7 |  |
| items/icons | complete | 24/24 |  |
| ui/ui | in progress | 7/14 |  |

## Generator settings used
Built-in image_gen, current per-asset codex/prompts files and queue-listed existing references. Approved David sheet is rendering authority; staff photo is identity authority. Fine polished pixel art, navy outline, teal rim. Model/seed controls are not exposed. Every asset is separate; only design sheets are multi-view. Originals preserved in art-raw/_source/.

User-approved Node/Sharp normalization: nearest-neighbour whole artwork resizing; square production canvases 1024x1024 unless the prompt specifies another size. Grounded body feet y=960, hips x=512; source head/hip landmarks preserve per-character scale. Zac target head142.2px; Chain183.94px. No separate head deformation. New turnarounds normalized2048x1024; expressions1536x1024. Existing approved sheets keep original dimensions. Scripts and normalization records are under art-raw/_qa/.

## Questions for Zac
- Previous roster questions resolved by MISSED.md: Jared disc golf with strap over LEFT shoulder; Chain 3D-printed katana; Cameron tattoo on anatomical RIGHT forearm. All characters approved.

## Current production handoff
Zac and Chain Tier1 raw assets ready for import (24 each, plus approved sheets). Raw still-image validation passed; continuous animation and game integration need playtesting after Claude import. David and subsequent approved groups proceed through the queue. Do not treat file counts alone as full animation approval.

## Style reset and boundary
Approved style: codex/refs/style/APPROVED-style-david-sheet.webp. Retired art remains in art-raw/_old/. David supplied turnaround unchanged, SHA256 76a5a4de203f5a906ef5e10f794d39cc949559866d6af59b5bec4414b061ab53. Only art-raw/, codex/STATUS.md and codex/PROGRESS.md are writable. No src/public/tools/source prompt/roster/approval edits; no messages sent to Claude.

## Questions for Zac: unresolved image issues
- Jared rear-view strap inconsistency was explicitly approved/overridden by the user; gameplay must keep anatomical LEFT shoulder strap and right hip bag, regardless of mirrored rear view.
- Lachlan `run_1`, `jump_1`, `launch_1`, `melee_1`, and `special_1` still exceed the pink/key-colour scan threshold after three separate generations. Kept the candidates for review and skipped retries per the art workflow.
- Ryan `special_1` remains above the pink/key-colour threshold after two generations; a third attempt was blocked by the image generator's usage limit.

## Production update 2026-11-06
- 37 additional distinct assets saved using built-in image_gen and existing Node/Sharp normalization; full raw validation: zero bad. Aiden and David now each have 24/24 Tier 1 files. Anne-Maree portrait/icon ready.
- All approvals are true. MISSED.md resolves previous questions: Chain katana ultimate, Jared disc golf/left shoulder strap and Cameron anatomical right tattoo are synchronized in current prompts. No sheets awaiting approval.
- Continue next.mjs 10 loop. Queue is not empty.

## Current production checkpoint
- 130 additional distinct assets saved since generation resumed. Bec, Caleb, Cameron, Jared and Lachlan now have complete Tier 1 sets; Ryan is at 22/24. Altwave's portrait and idle frame are in place. Originals and prompts are kept under art-raw/_source; normalization records are under art-raw/_qa.
- Whole-art anchor offsets were applied to align grounded feet. Key-colour and canvas-edge issues found during the scan were regenerated and rechecked; remaining flags are listed under Questions for Zac.
- All design sheets are approved. No sheets are waiting for approval.
- Image generation is temporarily blocked: the built-in tool returned HTTP 429 `usage_limit_reached` with a 24-hour team limit and about 21.5 hours until reset. Queue is NOT EMPTY: 723 images are available now; continue `node codex/next.mjs 10` with one parallel call per image after reset.

## Production update 2026-11-09
- Generated and saved Ryan hurt_2 and launch_1 plus Altwave idle_2..4 and walk_1..3 as separate 1024x1024 assets; originals and prompt notes are retained under art-raw/_source/. Ryan Tier 1 is now 24/24; Altwave has 8/20 Tier 1 assets.
- Regenerated Altwave idle_2, idle_3, walk_1 and walk_2 for frame margins, then adjusted their vertical placement to the 960px foot anchor. Altwave raw validation reports 0 bad assets.
- Ryan launch_1 now passes canvas margin validation. Existing Ryan special_1 key-colour bleed remains flagged from earlier production; no new issue introduced.

## Production update 2026-11-09 (continued)
- Chairman Altwave Tier 1 is now 20/20 complete. Musk-Bot has its boss portrait and first idle frame; Chatbot has its first idle frame. Altwave, Musk-Bot and Chatbot validation is clean.
- Ryan hurt_2 and launch_1 are complete. Retained the earlier Ryan special_1 source candidate after a third generation still failed the key-colour scan; it remains flagged for later review.
- Altwave chair/contract sprites were normalized with nearest-neighbour whole-artwork scaling and position adjustments to preserve the canvas margin and y=960 foot anchor. Raw validation passes for Altwave.
- node codex/next.mjs --status refreshed the queue snapshot. Queue remains open with 709 images available; approvals remain unchanged.

## Production update 2026-11-09 (latest)
- Raw art saved this session: Ryan hurt_2 and launch_1; Chairman Altwave's remaining Tier 1 sequence; Musk-Bot portrait, idle_1..4 and walk_1..3; Chatbot idle_1. All production files are separate 1024x1024 PNGs with originals/prompt notes under art-raw/_source/.
- Chairman Altwave Tier 1 is complete at 20/20; group validation: 0 bad. Musk-Bot currently has 8/20 Tier 1 and validates clean; Chatbot has its first gameplay frame and validates clean.
- Ryan special_1 remains flagged for key-colour bleed after a third generation; restored the earlier candidate and skipped further retries under the three-attempt rule. Ryan's hurt_2 and launch_1 are in place; launch_1 passes edge checks.
- The validator's codex/REVIEW.md still lists resolved historical edge issues for Altwave contract poses and Musk-Bot idle_2/idle_3. Latest per-group checks for Altwave and Musk-Bot show 0 bad; I have not modified that separate review file.
- Current unlocked queue is in codex/PROGRESS.md; queue remains open. No approval gates changed.

## Production update 2026-11-09 (continued)
- Generated and filed the complete 24 item icon set; item validation passes. Added seven UI assets and the Rooftop foreground layer; UI is 7/14 and Rooftop is 4/7.
- Zac now has 61/86 assets, including respawn poses, KO, melee trails and impact frames, plus special projectile and hit VFX. Originals and prompt notes are retained in art-raw/_source/heroes/zac/.
- Latest `node tools/art/check-raw.mjs heroes/zac` reports 0 bad assets; 25 Zac assets remain missing. `node codex/next.mjs --status` refreshed progress and reports 626 unlocked images remaining across the project.
- `next.mjs` still prints four older impact-frame warnings from codex/REVIEW.md even though the latest group check is clean; REVIEW.md is maintained separately and was not edited.

## Production update 2026-11-09 (continued, second batch)
- Chain gained hurt, angry and win portraits; select key art; jump_2; both landing frames; melee2_3; special_4/5; ultimate_4; and respawn_1. Latest group checks: Zac 0 bad; Chain 1 prompt/validator mismatch plus 0 gameplay-frame errors.
- Chain `keyart_select` uses the dark teal-navy vignette explicitly required by its prompt, while the generic checker expects magenta. The art is retained as a composed key-art image; this mismatch remains visible in the validator report.
- `node codex/next.mjs --status` refreshed `codex/PROGRESS.md`; current counts: Zac 64/86, Chain 38/86, 616 images in the unlocked queue at the last snapshot. No approval gates changed.

## Production update 2026-11-09 (continued, Aiden batch)
- Aiden gained jump_2, land_1/2, melee2_3 and special_4; originals and matching prompt notes are saved under `art-raw/_source/heroes/aiden/`.
- Aiden is now 35/86. `node tools/art/check-raw.mjs heroes/aiden` reports 0 bad gameplay sprites; the one remaining reported mismatch is `keyart_select`, whose dark background is intentional per its prompt.
- `node codex/next.mjs --status` refreshed `codex/PROGRESS.md`: 589 unlocked images remain. Its four redo warnings for Aiden animation files are stale entries; the current group validator confirms those files pass.
- Image generation is temporarily unavailable because the image service returned its daily usage limit. The next queued batch is Aiden `melee2_1`, `melee2_2`, `melee2_4`, `special_5` and `ultimate_4`.

## Production update 2026-11-10 (resume attempt)
- User asked to continue. The current queue is 589 available assets; next batch is Aiden `melee2_1`, `melee2_2`, `melee2_4`, `special_5`, `ultimate_4`, `respawn_1`, `ko_1`, and `fx_melee_trail_1..3`.
- Tried the ten image calls in parallel. All were rejected immediately with HTTP 429 `usage_limit_reached`; no assets were generated. Tool reports the daily limit resets at approximately 10:15 AM Brisbane time today.
- Resume with `node codex/next.mjs 10` after the limit resets. The queue and prompts are unchanged.
- User selected the CLI/API fallback. The local environment check found no `OPENAI_API_KEY`, so no API calls were made. Wait for the user to set it locally or resume the built-in tool after its limit resets; never ask them to paste the key into chat.

## Production update 2026-11-10 (post-reset)
- Built-in image generation reset and worked. Aiden gained the Compile finisher frames, Blue Screen special frame, Kernel Panic frames, respawn and KO poses, and melee/special FX. David gained the hurt portrait. Originals and prompts are preserved under `art-raw/_source/`; Sharp-normalized files and records are in `art-raw/_qa/`.
- Aiden is now 55/86 and the queue reports 576 available assets. The latest completed batch also includes four corrections to remove key-colour bleed and restore FX margins.
- `codex/REVIEW.md` retains the prior four Aiden warnings; no validator run was done after the corrections to avoid rewriting the review list.
- The latest generation batches ran as separate calls per asset. Generation can take several minutes per batch.

## Production update 2026-11-10 (batch 3)
- Added Aiden's last melee impact, four Blue Screen projectile frames, four special-hit frames; David gained his hurt portrait. Originals/prompts and normalization records remain in `art-raw/_source/` and `art-raw/_qa/`.
- Aiden is now 64/86; David 27/86; 566 available images remain in the unlocked queue.

## Production update 2026-11-10 (batch 4)
- David gained his angry and victory portraits, selection key art, jump/landing poses, combo frames, Kernel Panic sequence, respawn and KO assets. Originals and full prompts are kept in `_source`; normalization records in `_qa`.
- Current counts: Aiden 64/86, David 47/86, queue 556 images available. The project review still carries the same four previous Aiden warnings.


## Production update 2026-11-10 (batch 5)
- David added respawn_2/3, three melee trails, four melee impact frames and Blue Screen projectile frame 1. Originals/prompts and normalization records are saved.
- David is now 57/86. Queue snapshot is refreshed in `codex/PROGRESS.md`.

## Production update 2026-11-10 (batch 6)
- David gained Blue Screen projectile frames 2–4 and special-hit frames 1–4. Anne-Maree gained hurt, angry and win portraits. Originals, prompts and normalization records are preserved.
- Counts now read Aiden 64/86, David 64/86, Anne-Maree 29/86; queue snapshot is in `codex/PROGRESS.md`.

## Production update 2026-11-10 (batches 7–10)
- Anne-Maree gained key art, core animation/combat frames, respawn/KO, ultimate sequence, melee trails/impacts and special projectile/impact frames. Bec gained three corrected HUD bust portraits, select art, jump/landing/combat poses, respawn/KO, one ultimate frame and melee trails.
- Original images, prompt copies and normalization records are saved in `art-raw/_source/` and `art-raw/_qa/`; generated production assets are in each hero folder.
- Current snapshot: Anne-Maree 64/86; Bec 41/86. `codex/PROGRESS.md` has refreshed counts. The queue reports 506 images available; four older Aiden validator warnings remain for redo.

## Production update 2026-11-10 (continued)
- Bec now has most core combat/ultimate/respawn poses and her melee/special VFX frames. Her HUD portraits were regenerated as single bust crops after the first outputs echoed the attached model-sheet layout.
- Latest status: Anne-Maree 64/86, Bec 61/86. `codex/PROGRESS.md` is refreshed; 486 images remain available in the broader art queue, and four Aiden validator issues remain.

## Production update 2026-11-10 (Caleb batch)
- Bec gained special impact frames 2–4. Caleb gained select art, jump and two landing poses, three corrected single bust HUD portraits, melee poses, special/ultimate/respawn/KO poses and his first melee trail.
- Caleb now reads 40/86 and Bec 64/86. Sources, prompt copies and normalization records are preserved in `art-raw/_source/` and `art-raw/_qa/`; `codex/PROGRESS.md` was refreshed.
- Four pre-existing Aiden validator warnings remain queued for redo.

## Production update 2026-11-10 (Caleb animation and FX)
- Caleb gained the rest of his second melee combo, remaining Tidal Network frames, respawn frames, a full wakeboard melee trail and impact sequence, and four Wake Dash projectile frames.
- Caleb now reads 60/86. `codex/PROGRESS.md` is refreshed; the queue reports 459 available images and four Aiden validator warnings remain for redo.

## Production update 2026-11-10 (Cameron opening set)
- Cameron gained corrected hurt/angry/win bust portraits, select key art, jump and landing frames, Root Kick combo poses, a respawn/KO pose, his Fork Bomb/ultimate key poses, and three code-vine melee trails. One multi-pose respawn output was excluded; a single-pose replacement remains queued.
- Caleb now has the full special-impact sequence. Cameron's current count and queue snapshot are in `codex/PROGRESS.md`.
- ImageGen usage is exhausted until approximately 2026-11-11 10:15 Australia/Brisbane. The next queued items begin at `cameron/ultimate_2`; four earlier Aiden validator warnings remain.

## Production update 2026-11-11 (resume)
- Generated Cameron's ultimate_2 frame and saved the original and prompt note under art-raw/_source/heroes/cameron/; the normalized production sprite is at art-raw/heroes/cameron/ultimate_2.png.
- The Cameron tier-2 check confirms ultimate_2 passes. Other pre-existing Cameron and Aiden validator flags remain and need correction before the queue is clean.
- node codex/next.mjs --status now reports Cameron at 46/86 and 443 images available in the queue. The next queue batch begins with Cameron's ultimate_3, ultimate_5, ultimate_6, and respawn_1.

## Production update 2026-11-11 (continued)
- Added Cameron's remaining ultimate frames and full respawn sequence, plus Cameron melee/special effect frames. Cameron is now 64/86; its only current raw validator flag is the keyart_select background, which is dark by design per its prompt.
- Added Jared's three portraits, key art, land/jump frames, combo and special/ultimate frames, respawn/KO poses, and melee trails. Jared is now 52/86; its keyart background is likewise intentional, while launch_1 clips the edge and ultimate_2/respawn_2 have key-colour bleed.
- The raw art scan and queue snapshot are refreshed. 411 images remain available; 50 validator flags are reported across the project, including intended dark key art and other older issues.


## Production update 2026-11-12 (continued)
- Added Lachlan's melee combo frames, ultimate sequence, respawn/KO poses, and melee/special effects. Lachlan is now 64/86.
- Added Ryan's portraits, key art, jump/landing frames, combo/ultimate sequence, respawn/KO poses, and melee trails. Ryan is now 53/86.
- The latest group checks and queue snapshot are refreshed. 354 images remain available. Ryan's current group check flags intentional dark key art plus pink bleed in ultimate_1 and respawn_2; those two sprites need cleanup.
