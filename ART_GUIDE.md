# Art Guide: how art gets into the game

The game already loads real Aseprite art. Any character with an entry in `src/data/art.ts` uses it; everyone else keeps the generated placeholder. Concept reference: `docs/art/concept-v1.webp`.

## Drop-in steps (per character)
1. Draw and animate in Aseprite (frame size below). Keep the `.aseprite` source in `art-source/` (not shipped).
2. **File > Export Sprite Sheet** with:
   - Layout: **Horizontal strip** (or Packed), **no trim**, no padding needed
   - Output: tick **JSON Data**, format **Array**
   - Meta: tick **Tags**
   - Item filename: `{frame}` (so frames are named 0, 1, 2…)
   - Save as `public/assets/sprites/<id>.png` and `<id>.json`
3. Add one line to `src/data/art.ts`: `helpdesk: { frame: 64, body: { w: 28, h: 44 } }`
4. Run `npm run dev`. Missing tags fall back automatically (launch → hurt → idle, and so on).

`<id>` must match the fighter's `id` in `src/data/heroes.ts` / `bosses.ts` (`helpdesk`, `netninja`, `sysadmin`, `altwave`, `chatbot`, and so on).

## Rules the code relies on
| Rule | Why |
|---|---|
| Square frames, same size for the whole sheet (heroes 64×64, minions 32×48 → use 64×64 for now, bosses 128×128) | One `frame` value per character |
| **Feet touch the bottom edge of the frame**, character centred horizontally | Physics body is bottom-aligned to the frame |
| Draw the character **facing right** | The game flips it for left |
| Tag names are `<id>:<state>`, e.g. `helpdesk:idle` | Phaser animation keys are global; the prefix stops clashes |
| States: `idle run jump fall melee special hurt launch` | Everything else is ignored for now |
| Loop: `idle run fall launch`. One-shot: `jump melee special hurt` | Set in `BootScene.ts` |
| Frame durations set in Aseprite are respected | Hold the hit frame, speed the swing |
| Keep trails and big effects out of the body sprite (separate effect sprites later) | Body size stays stable |

The physics body (`body.w/h` in art pixels) is **not** the frame size. It's the fighter's real collision box, usually a bit smaller than the drawing.

## Attack timing
`melee.windup` (ms, in `src/data/heroes.ts`) is when the hitbox goes live after the attack starts. Set it to the time of the "contact" frame. Example: frames at 100 ms each with contact on frame 3 → `windup: 200`.

## Starter animation budget (from the art-direction notes)
Idle 4 · Run 6 · Jump/Fall/Land 6 · Melee 6 · Special 6 · Hurt 2 · Launch 3 · Respawn 3 (respawn isn't wired in yet).

## Open art decisions (need an answer before production art starts)
- **Render scale.** The concept proposes a 640×360 pixel grid shown at 3×. The game currently renders 960×540 with the camera at 0.7× zoom, which is a non-integer scale. Real pixel art will look uneven at 0.7×. Either change the camera zoom to an integer-friendly value or move the render target to 640×360 before final sprites are drawn.
- **Real roster** and their signature moves.
- **Asset budget** for the download size (sprites and audio are on top of the roughly 290 KB code bundle).

## Importing from a ChatGPT "mega sheet" (what we did for v2)
Source image: `docs/art/sheet-v2.webp` (1536×1024, magenta background). Everything below runs from the project folder.
Coordinates are `--crop x,y,w,h` rectangles in the source image. Poses are found automatically (`--auto 1`); `--gap` is the empty space in pixels that separates poses.

```bash
# Zac: animated character, 3 rows of poses (9 / 9 / 4), frame 128, standing height 52
node tools/art/import.mjs sheet --in docs/art/sheet-v2.webp --crop 20,335,1130,370 --auto 1 --gap 4 --id helpdesk --frame 128 --height 52 --tags idle:3,run:6,jump:1,fall:1,melee:4,special:3,hurt:3,launch:1 --dur idle:220,melee:90,special:110,hurt:110
# Menu portrait (96x96)
node tools/art/import.mjs portrait --in docs/art/sheet-v2.webp --crop 8,8,250,322 --id helpdesk
# Single-pose characters (bosses, minions): one pose, tag idle:1
node tools/art/import.mjs sheet --in docs/art/sheet-v2.webp --crop 20,718,262,275 --auto 1 --gap 30 --id altwave --frame 128 --height 100 --tags idle:1
node tools/art/import.mjs sheet --in docs/art/sheet-v2.webp --crop 288,718,365,278 --auto 1 --gap 30 --id muskbot --frame 192 --height 108 --tags idle:1
node tools/art/import.mjs sheet --in docs/art/sheet-v2.webp --crop 650,812,115,135 --auto 1 --gap 20 --id chatbot --frame 64 --height 40 --tags idle:1
node tools/art/import.mjs sheet --in docs/art/sheet-v2.webp --crop 765,812,115,135 --auto 1 --gap 20 --id neurobot --frame 64 --height 40 --despill 0 --tags idle:1
# Backdrops (keep the background) and platforms
node tools/art/import.mjs image --in docs/art/sheet-v2.webp --crop 910,700,596,92 --keepbg 1 --id sky --colours 96
node tools/art/import.mjs image --in docs/art/sheet-v2.webp --crop 910,808,596,92 --keepbg 1 --id server --colours 96
node tools/art/import.mjs image --in docs/art/sheet-v2.webp --crop 905,930,275,75 --id bench
node tools/art/import.mjs image --in docs/art/sheet-v2.webp --crop 1205,935,170,55 --id hang
# Effects (plain equal-cell strips; add the frame size to FX in src/data/art.ts)
node tools/art/import.mjs fx --in docs/art/sheet-v2.webp --crop 1180,418,340,72 --id burst --scale 0.5 --minw 3 --minh 3
```

Importer flags: `--tol` (background tolerance, default 38), `--despill 0` (skip magenta removal, for genuinely pink art), `--minw/--minh` (smallest pose kept), `--dur tag:ms,...` (frame durations).
If the importer says it found the wrong number of poses, try other `--gap` values (smaller splits poses, larger merges them).

### Procedural motion for single-pose art
Characters with no `run` tag (bosses, minions, placeholders) lean into movement and tumble when launched, so they don't look frozen. Giving a sheet a `<id>:run` tag switches this off automatically and uses the real animation.
