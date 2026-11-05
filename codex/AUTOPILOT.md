# AUTOPILOT: keep generating until the queue is empty

The whole plan is already written. You do not need new instructions from the user between batches. The loop:

## NON-NEGOTIABLE: parallel generation, but EVERY IMAGE STAYS SEPARATE
- **Generate in parallel.** Do not do one image, wait, then the next. Start the whole batch at the same time: issue all the image-generation calls of the batch together (up to 10 at once; if your environment supports parallel workers or sub-agents, give each worker its own image(s) and run them at the same time). Then collect, check and save the results.
- **Each call makes exactly ONE image**, from exactly ONE prompt file, saved to exactly ONE file. **Never** combine several poses, frames, effects, icons or characters into one image, one grid, one sprite sheet or one contact sheet to "go faster" or to "save calls". A combined image is a rejected image and must be redone as separate images. (Only the two design sheets `sheet_turnaround` and `sheet_expressions` are multi-view by design.)
- Parallel is safe because `node codex/next.mjs` only lists images whose reference anchors already exist (idle_1 first, then the key pose of each animation such as run_1, melee_3, special_2, hurt_1). Every image in one batch is independent of the others, so attach exactly the references it lists. Do not wait for the previous frame of the same animation; the key pose plus idle_1 plus the sheet keep the animation consistent.
- If your environment truly cannot run generations in parallel, fall back to sequential, but the images are still separate and the same queue and rules apply.

```
1. node codex/next.mjs 10        -> the next 10 INDEPENDENT images (plan order, approval gates and redo list are built in)
2. Start all 10 generations AT THE SAME TIME, one image each: open its prompt file, attach the listed references, generate ONE image.
   When they return, check each one (QA list in HANDOFF.md section 7), normalise it the same way you did for Zac/Chain
   (1024x1024, hips x=512, soles y=960, same scale), save it to its own "save as" path. Redo any that fail, as single images.
3. After each batch of about 10:
     node tools/art/check-raw.mjs <category>/<group>     (fix anything it flags: redo the image, do not ignore it)
     node codex/next.mjs --status                          (refreshes codex/PROGRESS.md)
4. Go back to step 1. Do not wait for the user between batches.
```

## Gates (the only reasons to stop)
- **Design sheets** (`sheet_turnaround`, `sheet_expressions` for heroes, bosses, minions) are made for everyone first. A character's gameplay frames only unlock when its line in `codex/approvals.json` is `true`. **Never edit approvals.json yourself**; only the user does. Characters still waiting are simply skipped, so you never sit idle: the queue moves on to other approved work.
- When `node codex/next.mjs` prints **QUEUE EMPTY**, run `--status`, tell the user which sheets are waiting for approval (list the files to look at), and stop.
- If a sheet or frame cannot be made consistent after 3 honest tries, write the problem in `codex/STATUS.md` under "Questions for Zac", skip that image, and continue.

## Rules that never change
- One pose / one frame / one effect frame / one icon per image. No sheets except the design sheets.
- Style authority: `codex/refs/style/APPROVED-style-david-sheet.webp` (clean, fine uniform pixels, teal rim light, navy outline). Identity authority: the staff photo plus the character's approved `sheet_turnaround.png`. Scale/anchor authority: the character's `idle_1.png`. For animation frames also attach the previous frame of the same animation.
- Likeness details live in `codex/roster.mjs` (hair colours, glasses, beards, tattoos, quirks). Zac, Cameron and Lachlan have LIGHT BROWN hair. Chain uses a 3D-printed KATANA, not a cable whip. Anne-Maree is David's wife and also the boss. Bec is the accounts lady.
- No effects baked into body frames. Faces right. Flat magenta background (RAM Vault stage uses green `#00FF00`).
- Write only to `art-raw/`, `codex/STATUS.md` and `codex/PROGRESS.md`. Never touch `src/`, `public/`, `tools/`, `codex/roster.mjs`, `codex/world.mjs`, `codex/prompts/` or `codex/approvals.json`. Keep your originals in `art-raw/_source/` as you did before.
- If you think a prompt or roster entry is wrong, do not edit it: add a line to "Questions for Zac" in `codex/STATUS.md`.

## What Claude does meanwhile (so you never wait on it)
Claude watches `codex/PROGRESS.md`, imports every hero whose Tier 1 is complete into the game, and writes any rejected images into `codex/REVIEW.md` (the redo list that `next.mjs` shows first). You just keep going.

## Plan order the queue follows
1. Design sheets for everyone (turnaround + expressions): Anne-Maree, Bec, Caleb, Cameron, Jared, Lachlan, Ryan, then the bosses (Altwave, Musk-Bot) and minions (Chatbot, Neuro-Bot). [Aiden, Zac, Chain, David are done.]
2. Tier 1 (gameplay frames): David, Aiden once approved, then each newly approved hero in the order Anne-Maree, Bec, Caleb, Cameron, Jared, Lachlan, Ryan; then bosses/minions; then global effects, Server Room and Rooftop stage layers, item icons, UI.
3. Tier 2 (polish): land, combo finisher, special variants, ultimate, respawn, KO, plus each hero's own effect frames (trail, hit, projectile), boss intros/defeats, stage props, previews. Order: Zac, Chain, Aiden, David, then the rest.
4. Tier 3 (extras): taunts, victory, auras, extra stages (Prompt Factory, RAM Vault), key art.
