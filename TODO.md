# TODO: Tran Tech Brawl

Single source of truth for project status. **Keep it current:** tick items when done, move partly-done work to "In progress", add new ideas under "To do". One line per item, plain words.
`[x]` done · `[~]` partly done / needs polish · `[ ]` not started · `(needs: ...)` what is blocking it · `(you)` needs the user (e.g. ChatGPT art or a decision)

## Done
**Engine and gameplay**
- [x] Phaser 3 + TypeScript + Vite project, builds clean (`npm run build`); `npm test` passes (63 tests)
- [x] Fighter movement, double jump, drop-through platforms, melee + projectile special
- [x] Damage % knockback, stocks, blast-zone KOs, respawn invulnerability
- [x] Bot AI: approach / attack / dodge / recover; bots avoid stage edges; varied attacks; allies prefer the boss; groups spread out
- [x] Boss movesets: barrage, charge and leap, each with its own warning flash and a "tired" window after
- [x] Minion waves spread across the stage
- [x] 10 fighters on screen: player + 4 AI allies vs boss + up to 4 minions; allies wear themed gear
- [x] Big scrolling world (1920x1080) with follow camera, HUD in its own scene
- [x] 2 stages: Server Room (vs Chairman Altwave), Rooftop (vs Mecha Musk-Bot)
- [x] Pause (P), resume with P/Esc, quit to menu; Esc during a fight returns to the menu

**Performance and robustness**
- [x] No per-frame allocation in the fight loop; swings, shots and effects pooled and capped
- [x] Cleanup on scene shutdown/rematch (listeners, colliders, markers); boot progress bar
- [x] Measured: about 1.5 ms per frame with 8 fighters; art 157 KB total; JS about 300 KB gzipped (Phaser in its own cached chunk)

**Audio and UI**
- [x] Synthesised sound effects (no audio files): swing, special, hit, jump, land, KO, menu, win/lose; M = mute (saved)
- [x] New HUD: portrait + big damage % + stock pips, boss bar, KO banners
- [x] Menu polish (controls + keys shown), results screen with time and KO count

**Input**
- [x] Gamepad in the fight (stick/d-pad, A jump, X attack, B/Y special) and touch overlay (virtual stick + buttons), keyboard unchanged

**Art pipeline**
- [x] Aseprite-format sheet loader + animation states (idle run jump fall melee special hurt launch)
- [x] Import tool `tools/art/import.mjs` (portrait, sheet, auto-segment, image, fx) + `ART_GUIDE.md`; ChatGPT prompt kit `ART_PROMPTS.md`
- [x] Zac: portrait + full 22-frame animation; bosses and minions as single poses (lean/tumble motion in code)
- [x] Stage art (sky, server wall, tiled platforms); effects (burst, dust, KO ring)

**Character Manager and items**
- [x] Manager screen: swap weapon / item / powerup per hero, saved in the browser, applied in the fight
- [x] 8 weapons, 8 items, 8 powerups with rarities; compare panel; 3 saved presets per hero; reset-all
- [x] Allies use themed loadouts

**Tools and docs**
- [x] `npm test` (vitest): knockback, items, loadouts, spawner + asset/data integrity checks (run it after importing art)
- [x] Balance simulation: `node tools/balance/sim.mts` (hits-to-KO and abstract 5v5 fights)
- [x] Docs: `GAME_DESIGN.md`, `ART_GUIDE.md`, `ART_PROMPTS.md`, this file, `CLAUDE.md`

## Art overhaul (Codex generates, Claude wires), started 2026-11-05
Handoff: `codex/HANDOFF.md` (start with `codex/START_HERE.md`). 1221 one-image-per-asset prompts in `codex/prompts/`; progress check: `node tools/art/check-raw.mjs`.
- [x] Handoff, art bible, roster of 11 real staff heroes, prompt generator, validator, per-frame importer (`import.mjs frames`)
- [ ] (Codex) Zac redone from scratch: design sheets, then Zac approves, then tier 1 frames (you: approve the sheets)
- [ ] (Codex) Chain + Aiden, bosses, minions, global fx, stages, items, UI (tier 1), then the other 7 heroes, then tier 2/3
- [x] (Claude) Zac and Chain imported and playing in fights (160px frames, shown at scale 0.9, smooth filtering, run speed matches ground speed, special leaves on the release frame, tinted slash arc). Old helpdesk/netninja art removed; ids are now `zac` and `chain`
- [ ] (Claude) Import each further hero when `codex/STATUS.md` says tier 1 ready; register in `art.ts` (command in `codex/START_HERE.md`)
- [ ] (Claude) Roster to 11 heroes in `heroes.ts` (moves, ultimates), select screen for 11, HUD portraits
- [ ] (Claude) New animation states: land, melee2 combo, ultimate, respawn, ko, taunt, victory; per-hero fx playback (trail, projectile, impact)
- [ ] (Claude) Parallax stage layers (bg_far/mid/near) + new platform art; boss intro/defeat; item icons in the Manager
- [ ] (you) Confirm titles/weapons/moves for each person and any role changes (see `codex/ROSTER_SUMMARY.md`)
- [ ] Render scale: the approved look is finer (about 256 logical grid, hero frames should be about 192px or bigger instead of 128 to keep the detail, importer `--frame`/`--height` will change); the old note: new art is a 128 logical grid with 128px hero frames; 960x540 at 0.7x camera zoom will blur it (see "Needs a decision")

## In progress
- [~] Fight balance: tuned by simulation (about 85-95 s, 92-100% win rate in the model); bosses are now heavy (weight 3.3-3.6, 4 stocks). Needs a real play-test, the sim's hit rates are guesses (you)
- [~] Sound: events and synth are wired and fire correctly; not yet judged by ear (volumes, pitch) (you)
- [~] Gamepad and touch: built, untested on a real pad or phone (you)
- [~] Network Ninja and Sysadmin Tank: portraits only, still placeholder shapes in fights (you: ChatGPT animation sheets)
- [~] Bosses and minions: single pose only, no real animation (you: ChatGPT frames)
- [~] Weapon swaps change numbers only (the swing animation stays the hero's own)
- [~] Result screen KO count counts every KO (allies and minions too), not just the player's

## To do
**Art**
- [ ] Network Ninja + Sysadmin Tank animation sheets (you: prompts in `ART_PROMPTS.md`)
- [ ] Boss and minion animations (idle, attack, hurt)
- [ ] Wider platform piece for the rooftop
- [ ] Respawn animation, weapon sprites for the Manager weapons
- [ ] Stage 3+ (ideas: Prompt Factory, RAM Vault, The Cloud, Printer Incident)

**Gameplay**
- [ ] Unlock/earn items and powerups
- [ ] More bosses, one per stage
- [ ] Hit pause on big hits (keep it small with 10 fighters)

**Menus and input**
- [ ] Gamepad and touch navigation in the menu, manager and result screens
- [ ] Touch pause button
- [ ] Check the HUD does not draw over the touch buttons on a phone

**Audio and polish**
- [ ] Music (procedural loop, off by default?)
- [ ] Boss intro screens

**Later**
- [ ] Online multiplayer, up to 10 real players (separate server work)
- [ ] Host as a static site

## Needs a decision (you)
- [ ] Render scale: keep 960x540 with 0.7x camera zoom, or move to a 640x360 pixel grid shown at 3x? (blurry pixels vs. rework; decide before more art is drawn)
- [ ] Heroes: TranTech staff or clients? Real roster and signature moves
- [ ] Multiplayer: co-op vs boss only, or also free-for-all?
- [ ] Aseprite: buy the licence (~US$20) or switch to LibreSprite (the trial can't save or script)
- [ ] Purpose: internal fun, TranTech marketing, or public release? (affects the parody boss names)
