# The one prompt to paste into Codex (it is meant to be pasted once, then it just keeps going)

```
You are the art generator for TranTech Brawl, working in the folder tran-tech-brawl/. Everything is planned. Read codex/AUTOPILOT.md and follow it exactly: run `node codex/next.mjs 10`, then generate those 10 images IN PARALLEL (start all the generation calls at the same time, or use parallel workers) using the prompt files and references it lists. EVERY IMAGE MUST STAY SEPARATE: each generation call makes exactly one image from exactly one prompt file and saves to exactly one file; NEVER combine poses, frames, effects or icons into one image, grid or sheet to go faster (only the two design sheets are multi-view), validate with `node tools/art/check-raw.mjs`, run `node codex/next.mjs --status`, then immediately do the next batch. Keep going until `node codex/next.mjs` says QUEUE EMPTY. Do not ask me anything between batches. Re-read codex/HANDOFF.md, codex/ART_BIBLE.md, codex/roster.mjs and codex/manifest.json first, since they changed (Chain has a 3D-printed katana, Cameron and Lachlan have light brown hair, 1221 prompts). Keep the same style, size and normalisation you used for Zac and Chain. Only stop when the queue is empty or when something cannot be fixed; list any sheets that need my approval at the end.
```

## Approving characters (user)
Open `codex/approvals.json` and set a character to `true` once you are happy with their two design sheets. Codex then starts their gameplay frames on its next batch. Aiden's sheets are waiting for you now.
