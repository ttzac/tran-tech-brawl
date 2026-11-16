# TODO: Tran Tech Brawl

Single source of truth for project status. **Keep it current:** tick items when done, move partly-done work to "In progress", add new ideas under "To do". One line per item, plain words.
`[x]` done · `[~]` partly done / needs polish · `[ ]` not started · `(needs: ...)` what is blocking it · `(you)` needs the user (e.g. ChatGPT art or a decision)

## Done
**Engine and gameplay**
- [x] Phaser 3 + TypeScript + Vite project, builds clean (`npm run build`); `npm test` passes (370 tests)
- [x] Fighter movement, double jump, drop-through platforms, melee + projectile special
- [x] Damage % knockback, stocks, blast-zone KOs, respawn invulnerability
- [x] Bot AI: approach / attack / dodge / recover; bots avoid stage edges; varied attacks; allies prefer the boss; groups spread out
- [x] Boss movesets: barrage, charge and leap, each with its own warning flash and a "tired" window after
- [x] Minion waves spread across the stage
- [x] 10 fighters on screen: player + 4 AI allies vs boss + up to 4 minions; allies wear themed gear
- [x] Big scrolling world (1920x1080) with follow camera, HUD in its own scene
- [x] 2 stages: Server Room (vs Chairman Altwave), Rooftop (vs Mecha Musk-Bot)
- [x] Characters bigger: fight camera zoom 0.7 to 1.2 (2026-11-06)
- [x] Pause (P), resume with P/Esc, quit to menu; Esc during a fight returns to the menu
- [x] Sim core (multiplayer Phase 1, 2026-11-06): the fight runs in `src/sim/World.ts` with no Phaser: fixed 60 Hz tick, own platform physics (`sim/kinematics.ts`, Arcade physics removed), seeded RNG (same seed + inputs = same match), effects/sound as sim events. Sprites are drawn by `src/view/` with interpolation between ticks (smooth on 120/144 Hz screens). Tests: kinematics, determinism, a full AI match
- [x] Net layer (multiplayer Phase 2, 2026-11-06): `src/net/` binary input/snapshot codecs (a 10-fighter snapshot is about 200-450 bytes), JSON ctrl messages, `Link` with ping/RTT and fake lag/jitter/loss, WebRTC links (2 data channels, star around the host), two-tab BroadcastChannel links, signalling (`npm run dev` serves it at /signal; Cloudflare Worker in `server/signal/`, not deployed). Tested two tabs over real WebRTC: about 2 ms RTT, 30 Hz fight snapshots. Dev console: `__net.host()` / `__net.join(code)`. Wired into the game in Phase 3
- [x] Online co-op (multiplayer Phase 3, 2026-11-06): Menu → H host / J join (or a `?join=CODE` link), lobby with up to 5 players (AI fills empty hero slots), hero pick, ready-up, host picks the boss and starts; the host runs the fight and streams it, players send inputs; results → back to the lobby; leaving and "host ended the game" handled. Markers: you white, other players yellow, AI cyan. Pause does not freeze online fights. Tested in two tabs over real WebRTC (lobby, fight, result, lobby, leave, rejoin by link, host quit). `?net=local` = same-PC tabs without WebRTC

- [x] Solo Crawl (2026-11-16): new SOLO pill in the Menu mode strip. A dungeon run with no AI allies on its own winding map ("the Gauntlet", `generateSoloFloor` in `sim/crawl.ts`): 6 rooms + boss per floor (classic is 4 + boss), mostly one road with occasional forks, and a guaranteed Break Room / Elite fork in room 4. 4 starting stocks, enemy damage x0.85 and smaller waves to make up for the missing party. `RunState.solo` drives it; own best-score record (`ttb.solo.best`). Uses the existing art only. Balance numbers are first guesses (play-test)
- [x] Menu showcase: hero shown smaller (`SHOW_SCALE` 2.55 -> 1.85) so heads and swings stay inside the panel (2026-11-16)
- [x] Online feel + robustness (multiplayer Phases 4-5, 2026-11-16): your own fighter is predicted on your PC (moves on the tick you press; measured 43 ms from key to movement at 130 ms ping, was a full round trip) and corrected against the host with a short glide instead of a snap; other fighters are drawn about 70 ms in the past, blended between snapshots (adapts to jitter, coasts through one late snapshot). A player who drops out or goes quiet for 2.5 s is played by the AI; a dropped player's game reconnects by itself for 20 s and gets the same fighter back (the host holds the seat 30 s). A hidden or minimised host tab keeps the match running (a Web Worker timer drives the game loop). Dead connections are noticed after 10 s of silence. F3 in an online fight shows ping / corrections. Tested in two tabs over real WebRTC with fake lag, jitter and loss
- [x] Online modes (2026-11-16): the host picks Boss co-op or Team Brawl in the lobby (Tab). Brawl online: players + AI vs a rival crew, generated map, power-up crates (now in snapshots). Dungeon Crawl is solo only and the lobby says so
- [x] Dungeon Crawl rebuilt as a real crawler (2026-11-16): every run is generated from one seed (shown on the map and result screens; same seed = same dungeon). 3 floors, each a branching map of 4 columns of rooms + a boss: pick your path. Room types: Skirmish (guardian + waves), Horde (mixed bot types; the pack leader only shows up after enough KOs), Elite Pack (guardian + lieutenants, better relics), Break Room (no fight: a stock back or a relic), Boss. Room modifiers from the second room on (Supply Drop, Swarm, Armoured, Frenzy, Overclocked). Enemies hit harder, react faster and come in bigger waves the deeper you go. 15 relics carry through the run (2 new ones start each room with ultimate charge); stocks carry over, +1 after each boss. Result screen: run won / run over, rooms reached, relics, run time and KOs, seed, best score on this PC. Data in `src/data/dungeon.ts`, rules in `src/sim/crawl.ts`, map screen `src/scenes/MapScene.ts`

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
- [~] (Claude) All 11 heroes are in `heroes.ts` with stats, moves, 2-row select screen and a compact Manager list (2026-11-06). Sysadmin Tank became Aiden. All 11 have portraits (the 8 unfinished ones cut from their `sheet_expressions.png`). David uses his 8 finished frames; the other 8 use ONE front-view pose cut from `sheet_turnaround.png` (`import.mjs pose`), leaned/tumbled in code. Replace each with a `frames` import when Codex finishes them. Still to do: ultimates, per-hero tuning by play-test (`tools/balance/sim.mts` only knows the old heroes)
- [x] (Claude) 2026-11-06: new select screen: big showcase of the picked hero (spotlight, themed colour, show-reel: idle, run, melee + slash, special + bolt, jump, run back; single-pose stand-ins lean/flip), roster grid on the right, equipped gear shown under the hero. Still to do: a unique idle/taunt per hero (needs Codex taunt/victory frames), gear-driven effects (e.g. weapon glow)
- [x] (Claude) 2026-11-06: Aiden, David and Anne-Maree imported with full Tier 1 animation (22 frames each, scale 0.15, windups 160/100 like Zac). Bec, Caleb, Cameron still partial at Codex; Jared, Lachlan, Ryan, bosses, minions not started. Import each when `codex/STATUS.md` says tier 1 ready
- [ ] (Claude) New animation states: land, melee2 combo, ultimate, respawn, ko, taunt, victory; per-hero fx playback (trail, projectile, impact)
- [ ] (Claude) Parallax stage layers (bg_far/mid/near) + new platform art; boss intro/defeat; item icons in the Manager
- [ ] (you) Confirm titles/weapons/moves for each person and any role changes (see `codex/ROSTER_SUMMARY.md`)
- [ ] Render scale: the approved look is finer (about 256 logical grid, hero frames should be about 192px or bigger instead of 128 to keep the detail, importer `--frame`/`--height` will change); the old note: new art is a 128 logical grid with 128px hero frames; 960x540 at 0.7x camera zoom will blur it (see "Needs a decision")

- 2026-11-09 import pass (Claude): Bec, Caleb, Cameron, Jared, Lachlan, Ryan re-imported from their complete Tier 1 sets (22 frames, `--frame 256 --scale 0.25 --soft 0`) with fresh 192px portraits; Jared/Lachlan/Ryan moved from stand-ins to `res: 8/5` entries in `art.ts`. Build + 189 tests pass; textures/anims confirmed loading in dev. Importer warnings to eyeball in play: Lachlan run_3 clipped by frame and his feet sit ~32px low in idle; Bec run_1/3/4/6 and Caleb/Cameron idle_3/4 read 120-135% of idle_1 height (pose drift). Windups for these six are still the default (160/100) until timing is checked. NOT yet imported (art exists): Altwave, Musk-Bot, Chatbot, Neurobot (need `walk`/`attack` tag mapping + `art.ts` bumps), new fx (heavy hit, dust, jump ring, KO blast), item icons, UI (HUD frame, logo, title art), rooftop/serverroom parallax; extra Zac/Chain/Aiden frames (land, melee2, ultimate, respawn, portraits) wait on new animation states.

- 2026-11-12 full art import (Claude): all 11 heroes re-imported with the complete 41-frame sets (idle4 run6 jump2 fall1 melee4 special5 hurt2 launch1 land2 melee2 4 ultimate6 respawn3 ko1; Codex "_contained" frames preferred), Altwave/Musk-Bot (run=walk) and Chatbot/Neurobot (melee=attack) imported at 256px with per-character `res` so hitboxes stay the same. New states wired in FighterView: land (idle landing), melee2 (quick second swing), respawn. Effects: per-hero trail / melee hit / projectile / special hit (Ryan has trail + hit only), global hit_heavy, ko_blast, dust_land, dust_run, jump_ring. Stages: serverroom and rooftop parallax far/mid layers and new platform pieces. UI: HUD frame, boss bar, stock icon, game logo and title background on the menu. Items: 24 icons in the Manager and menu gear row. Portraits: angry/hurt/win moods (HUD portrait changes with damage), 192px neutral re-cut. New tools: `tools/art/keyfit.mjs` (single images), `import.mjs` tag alias (`run=walk:4`) and `_contained` support. ULTIMATE built (same day): meter on every hero (+0.9 x damage dealt, +0.35 x damage taken, heroes and allies only), press L / C (pad shoulder, touch ULT) at 100 for the 6-frame animation, invulnerable, then a 300px blast (20 dmg, big knockback) 220 ms before the end; AI allies use it when in reach; meter bar on the HUD card; online: input bit 6, snapshot byte + action code 3. Needs play-test tuning (fill rate, damage). Imported but NOT used yet: ko, taunt/victory, win portrait on the result screen, keyart_select, title_keyart_roster, logo_badge, icon_hud. Pose drift warnings from the importer (run/melee2 heights) are unchanged Codex issues. Fixed on the way: MenuScene crashed on start (buildModes ran before the opponent picker existed); online 'hit' events now carry the attacker id.

## In progress
- [~] Fight balance: tuned by simulation (about 85-95 s, 92-100% win rate in the model); bosses are now heavy (weight 3.3-3.6, 4 stocks). Needs a real play-test, the sim's hit rates are guesses (you)
- [~] Sound: events and synth are wired and fire correctly; not yet judged by ear (volumes, pitch) (you)
- [~] Gamepad and touch: built, untested on a real pad or phone (you)
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
- [~] Online multiplayer: plan in `docs/MULTIPLAYER.md`. **Phases 1-5 done** (1-3 on 2026-11-06, 4-5 on 2026-11-16, see Done). Left out on purpose: lag compensation for remote players' hits (the host checks swings against where enemies are on the host), host migration (if the host leaves, the game ends), rejoin after a page refresh (a refresh loses the seat), dungeon runs online. Not yet tried between two real PCs, and the hidden-host ticker was tested with a simulated hidden tab only (you)
- [ ] Host as a static site

## To do: dungeon (after 2026-11-16)
- [ ] Play-test the dungeon balance (you): room difficulty, relic strength and score numbers are first guesses; the AI clears floor 1 most of the time in tests
- [ ] (Codex) Dungeon art: room-type icons for the map, relic icons (`items/relic_<id>`), a map background. Today the map and relic cards use emoji and plain boxes
- [ ] Ideas: shop rooms (spend score), cursed relics, a daily seed, online co-op runs

## Needs a decision (you)
- [ ] Render scale: keep 960x540 with 0.7x camera zoom, or move to a 640x360 pixel grid shown at 3x? (blurry pixels vs. rework; decide before more art is drawn)
- [ ] Heroes: TranTech staff or clients? Real roster and signature moves
- [ ] Multiplayer: co-op vs boss only, or also free-for-all?
- [~] Multiplayer: humans on the hero team only (up to 5, AI fills the rest), or humans can also play boss/minions (10 players)? Built as heroes-only (5); say if you want boss/minion players
- [ ] Multiplayer hosting: everything on Cloudflare (Pages + Worker signalling + TURN), or static site on Vercel + signalling on Cloudflare? Either way: deploy `server/signal/` (`npx wrangler deploy`, needs your Cloudflare login) and optionally create a TURN key (see `server/signal/README.md`)
- [ ] Aseprite: buy the licence (~US$20) or switch to LibreSprite (the trial can't save or script)
- [ ] Purpose: internal fun, TranTech marketing, or public release? (affects the parody boss names)

## Art import pass, 2026-11-06 (Claude)
Imported: Bec (idle 4 + jump 1), Caleb (idle 2), Cameron (idle 1) real Codex frames replacing the turnaround stand-ins (scale 0.15, same `ART` entries/body sizes, so hitboxes are unchanged); portraits for all three re-cut from `portrait_neutral.png` at 192px; `hit_small` (4) and `hit_medium` (5) global fx via new `tools/art/fxframes.mjs`, wired into `CombatView.spark` (replaces the old burst). Zac, Chain, David, Aiden, Anne-Maree were already imported from their final Tier 1 sets. `npm test` and `npm run build` pass; checked in a fight and on the menu.
Still waiting on Codex (not faked): Bec run/melee/special/hurt/fall/launch; Caleb and Cameron everything after idle; Jared, Lachlan, Ryan frames (turnaround + expressions only, stand-ins stay); bosses altwave/muskbot and minions chatbot/neurobot (turnaround only, old art stays); fx beyond hit_small/hit_medium (rest of fx/global); all stage layers, items icons and ui art (none generated). Windups for Bec/Caleb/Cameron stay at current values until melee frames exist. Not done in code (blocked on art): parallax layers, land/combo/ultimate/respawn/victory states.
- 2026-11-06 sharpness fix: the 8 real-art heroes (zac, chain, david, aiden, annemaree, bec, caleb, cameron) are re-imported at `--frame 256 --scale 0.25 --soft 0` (1 art pixel = 1 image pixel; the old 0.15 smeared the 4px blocks). `ArtDef.res = 8/5` keeps world size and hitboxes identical (checked: Zac body still 34.3x82.7); display scale goes through `artScale()`. Use these flags for future hero imports and set `res: 8 / 5` + body x1.6. Stand-ins (jared, lachlan, ryan) and bosses/minions are still the old low-res art.

## 2026-11-13 art import (Claude)
- [x] Zac + Chain sheets re-imported with `taunt` (2) and `victory` (3) tags (46 frames); showcase reel on the select screen plays them

## 2026-11-13 full update pass (Claude): everything Codex finished is now imported
One command re-does every import: `node tools/art/import-all.mjs` (or one group: `heroes`, `herofx`, `portraits`, `globalfx`, `enemies`, `ui`; add ids to limit it). The settings, the frames left out and the size fixes all live in that file.
- [x] All 11 heroes re-imported with the full set incl. `taunt` (2) + `victory` (3): 46 frames each (David 45, Jared 45, Cameron 40: bad frames left out, see below)
- [x] Jared, Lachlan and Ryan were giants: their first frames were drawn a third bigger than everything else. The importer now shrinks those frames (new `--rescale`), so they match the other heroes and no longer shrink when they do a second swing, land or use the ultimate. Hitboxes unchanged
- [x] Size jumps fixed the same way for Bec (run, attacks), Caleb and Cameron (idle loop pulsing, run, attacks), Anne-Maree (run), Aiden (landing)
- [x] Every hero now has ultimate wind-up + blast effects, aura and a special cast flash (was Zac and Chain only); Ryan has his projectile and special-hit effects
- [x] Fixed: the ultimate animation never played in a fight (the respawn animation started over the top of it, because the ultimate's invulnerability was mistaken for a respawn). Checked in a running fight
- [x] New effects in fights: respawn pad, power-up pickup glow, KO star, smoke puff when reinforcements arrive, confetti bursts on a win, Altwave's prompt projectile + impact, Musk-Bot's laser impact and stomp shockwave
- [x] Heroes play `victory` when the fight is won and `taunt` after scoring a KO (if standing still)
- [x] Result screen: "SYSTEM RESTORED" / "SYSTEM DOWN" banner art, your hero's win / hurt portrait; fixed the score boxes hiding under the time / KO boxes. "K.O.!" art when the boss loses a stock
- [x] Effect strips are now 256-colour: `public/assets` went from 17 MB to 12 MB even with all the new art
- [ ] (Codex) Redo list in `codex/REDO.md`: David `ultimate_6` is still Aiden's art; Jared `victory_2` is a scoreboard, not Jared; Cameron has five copies of one pose and one empty frame; both `bg_near` stage layers are tinted magenta and can't be used. Remove the matching `SKIP` / `RESCALE` entry in `import-all.mjs` when a frame is redrawn
- [ ] Imported sizes are corrected by measurement, not redrawn: judge by eye in play and adjust the factors in `import-all.mjs` (you)
- [ ] Not used yet (art exists): hero `ko` frame, boss intro / defeat and minion death frames (need new animation states), Altwave chair glow / contract slam, Musk-Bot laser beam / thruster, global block spark / damage flash / explosion / lightning arc / shield bubble / speed lines, `plat_ledge`, `prop_desk`, `menu_button`, `menu_panel`, `keyart_select`, `icon_hud`, `logo_badge`, `title_keyart_roster`

## 2026-11-16 character audit (Claude): sizes, wrong frames, resolution
- [x] Every raw frame of all 15 characters measured (`tools/art/measure.mjs`, `heads.mjs`): nearly every hero had poses drawn 20-70% bigger or smaller than their idle. `tools/art/rescale.json` now holds a factor per frame (head the same size in every pose); the old `RESCALE` list is gone
- [x] Sheets are twice the resolution: 512px logical frames (raw at 0.5), trimmed and packed into `<id>.webp` (17 MB for all 15), soft edges instead of hard-cut ones. World size and hitboxes unchanged
- [x] Grounded frames are stood on the ground line (no more hopping / sinking between frames; Musk-Bot no longer hovers)
- [x] Wrong-character frames left out: Altwave `launch_1` (Musk-Bot art), Musk-Bot `hurt_1` (a Chatbot), Chatbot `idle_2` (Musk-Bot art), Lachlan `idle_4` (no goggles). Listed in `codex/REDO.md`
- [x] Fixed: bosses and minions played their attack animation every time they landed (missing-animation fallback)
- [x] Fixed: fighters floated above the floor: platform art is now placed by its walking surface (`STAGE_SURFACE` in `art.ts`)
- [x] Portraits re-imported at 384px (were 192px, soft on the result screen)
- [x] Stand-ins from existing frames (no new art): heroes crouch with their landing crouch (`duck` = land_1) instead of a squashed idle; minions use a mid-stride walk frame in the air (`jump` = walk_2); Caleb's `jump_2` and `land_2` (riding the wakeboard on water) are left out, so the top of his jump uses jump_1
- [ ] (Codex) Still no real art for: crouch, ledge hang / climb (hang uses the apex / jump pose), minion and boss jump / fall, boss crouch (squashed idle)
- [ ] Judge by eye in play (you): frame sizes are fitted by measurement + my eye; adjust single factors in `tools/art/rescale.json` and re-import
