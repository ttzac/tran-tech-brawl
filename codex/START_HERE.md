# Paste this to Codex to start

> You are the art and asset generator for TranTech Brawl. Work in the folder `tran-tech-brawl/`.
> 1. Read `codex/HANDOFF.md` completely, then `codex/ART_BIBLE.md`.
> 2. Look at `codex/refs/style/art-direction-concept.webp` (early concept only) and, MORE IMPORTANT, `codex/refs/style/APPROVED-style-david-sheet.webp` (the approved final look: clean, less pixelated, fine pixels) and every photo in `codex/refs/photos/`.
> 3. Create `codex/STATUS.md` from `codex/STATUS_TEMPLATE.md`.
> 4. Start Phase 1: redo **Zac from scratch**. Generate `art-raw/heroes/zac/sheet_turnaround.png` and `sheet_expressions.png` using the prompts in `codex/prompts/heroes/zac/`, compare them to `codex/refs/photos/zac.jpeg`, iterate until unmistakably Zac, then STOP and show me both images for approval.
> 5. Every pose, frame, effect frame, icon and background is its **own image** from its own prompt file (`codex/manifest.json` lists all 1221). Never put multiple poses in one image (design sheets excepted).
> 6. Only write to `art-raw/` and `codex/STATUS.md`. Do not touch `src/`, `public/` or `tools/`. Run `node tools/art/check-raw.mjs heroes/zac` before telling me a group is ready.

## Claude's side (for the human)
- `node tools/art/check-raw.mjs` = progress and QA over everything in `art-raw/`; problems land in `codex/REVIEW.md`.
- `node tools/art/import.mjs frames --dir art-raw/heroes/zac --id zac --frame 128 --height 52 --tags idle:4,run:6,jump:1,fall:1,melee:4,special:3,hurt:2,launch:1` converts one hero's separate frames into the game sprite sheet (Tier 1). Claude runs this when `STATUS.md` says a hero is ready.
- To change anyone's look, weapon or moves: edit `codex/roster.mjs`, run `node codex/build-prompts.mjs`, regenerate the affected images.
