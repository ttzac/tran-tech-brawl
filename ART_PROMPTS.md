# ChatGPT art prompt kit

Workflow: **ChatGPT draws, `tools/art/import.mjs` converts, the game loads.**
Paste the concept image (`docs/art/concept-v1.webp`) into the same chat first and say "match this exact style and these characters" so every asset stays consistent. Do one character per chat.

## Rules that make the import work
- **Flat solid magenta background (#FF00FF)**, nothing else behind the character: no floor, no shadow, no glow, no text, no labels. (Magenta is trivially removable and never appears in the art.)
- **Pixel art look**, chunky pixels, hard edges, no blur, limited palette (about 24 to 32 colours), dark navy outline.
- **Character always faces right.**
- **Same character size and same scale in every pose**, feet at roughly the same height in every cell.
- **Equal grid**: every pose in its own equal-sized cell, no overlap between cells, no cell borders drawn.

If ChatGPT can't keep poses in a clean grid, ask for **one pose per image** instead and I'll stitch them. The importer scales, centres and feet-aligns each pose for you, so the poses don't need to be perfectly aligned. They do need to look like the same character.

## 0. Zac, the first hero (start here)
Attach **two images** to the chat: the concept image (`docs/art/concept-v1.webp`, for the art style) and the **photo of Zac** (for the likeness). The photo is only a reference for the character's features.

**Step A: character design sheet** (approve the look before any animation):
> Using the attached concept image as the **art style** (chunky pixel art, dark navy outline, arcade brawler proportions) and the attached **photo as the likeness reference**, design **"Zac", the first playable hero of TranTech Brawl**, as a stylised adult caricature with a slightly enlarged head, hands and boots. Keep these recognisable features: **short neat auburn-brown hair, shorter at the sides and a little longer on top; a full short ginger-brown beard with a defined jawline; fair skin; a calm, confident, slightly amused expression**. Costume: a **dark navy-black short-sleeve polo with a teal-blue inner collar, and the TranTech logo as a small rectangular teal-outlined badge on the chest**; dark work trousers, sturdy boots, a tool pouch on the belt; **visible dark tattoos on the forearms**. Signature item: a chunky mechanical keyboard used as a melee weapon (placeholder, can change). Show front view, side view facing right, and a 3/4 action pose on a **flat solid magenta (#FF00FF) background**, no text, no shadows.

**Step B: animation sheet** (once the design is approved; keep the same chat):
> Now make the **pixel-art animation sprite sheet for Zac** exactly as designed above, on a **flat solid magenta (#FF00FF) background**. Strict grid of **8 columns × 3 rows of equal cells**, reading left to right, top to bottom, **22 poses** (leave the last 2 cells empty magenta). The character **faces right** in every pose, the **same size and scale throughout**, **feet on the same baseline in every cell**, no text, no shadows, no cell borders. Poses in order:
> 1-4 idle (relaxed ready stance with the keyboard raised, tiny breathing bob);
> 5-10 run cycle (6 frames, leaning forward);
> 11 jump (rising, knees tucked);
> 12 fall (arms up, legs apart);
> 13-16 keyboard swing (wind-up behind the head, mid-swing, contact with the arm fully extended and shouting, recovery);
> 17-19 special "ticket escalation" (pull back both hands, thrust one hand forward, recover);
> 20-21 hurt (flinch backwards, eyes shut);
> 22 launched (knocked back, limbs flailing).

**Step C: portrait** (same chat):
> Close-up bust portrait of Zac in the same pixel-art style, flat magenta background, no text.

Then import (Zac replaces the placeholder Helpdesk Hero in slot 1, so keep the id `helpdesk` for now and I'll rename the hero in code):
```
node tools/art/import.mjs sheet    --in <sheet image>    --id helpdesk --cols 8 --rows 3 --tags idle:4,run:6,jump:1,fall:1,melee:4,special:3,hurt:2,launch:1
node tools/art/import.mjs portrait --in <portrait image> --id helpdesk
```

## 1. Generic character animation sheet template
> Using the attached concept image as the exact character design and art style, make a **pixel-art animation sprite sheet for the Helpdesk Hero** on a **flat solid magenta (#FF00FF) background**. Layout: a strict grid of **8 columns × 3 rows of equal cells**, reading left to right, top to bottom, **22 poses** (leave the last 2 cells empty magenta). Character faces right in every pose, same size and same scale throughout, feet on the same baseline in every cell, no text, no shadows, no cell borders.
> Poses in order:
> 1-4 idle (relaxed ready stance holding the keyboard up, tiny breathing bob);
> 5-10 run cycle (6 frames, leaning forward);
> 11 jump (rising, knees tucked);
> 12 fall (arms up, legs apart);
> 13-16 melee keyboard swing (wind-up behind the head, mid-swing, contact with arm fully extended and shouting, recovery);
> 17-19 special "ticket escalation" (pull back both hands, thrust one hand forward, recover);
> 20-21 hurt (flinch backwards, eyes shut);
> 22 launched (knocked back, limbs flailing).

Then import it:
```
node tools/art/import.mjs sheet --in <saved image> --id helpdesk --cols 8 --rows 3 --tags idle:4,run:6,jump:1,fall:1,melee:4,special:3,hurt:2,launch:1
```
Repeat for `netninja` (cable whip melee, packet-bolt special) and `sysadmin` (rack-server fist melee, spinning RAM stick special). Use the same pose list, changing only the weapon and special descriptions.

## 2. Boss and minion sheets
Same format. Use 6 poses for minions (idle ×2, walk ×2, attack, hurt) and add `--frame 128 --height 100` for bosses.
- **Chairman Altwave:** immaculate cream suit, oversized hovering command chair/console, theatrical.
- **Mecha Musk-Bot:** heavy angular red machine, forward lean before a charge, aiming pose before a laser.
- **Minions:** small monitor-faced bots, one colour per faction (teal chatbot, pink Neuro-Bot).

## 3. Portraits
> Close-up bust portrait of the Helpdesk Hero in the same pixel-art style, 96×96 look, flat magenta background, no text.

Import: `node tools/art/import.mjs portrait --in <image> --id helpdesk`
(Full-body portraits for the three heroes are already extracted from the concept image.)

## 4. Stage backgrounds (3 separate images)
Ask for each layer **separately, no characters, 1920×1080, same style, muted low-contrast colours**:
1. *Far layer:* windows, afternoon sky, distant buildings.
2. *Mid layer:* server racks, patch panels and shelving.
3. *Platform kit:* one wide service-bench main platform, one suspended rack-unit platform, one maintenance ledge, each on a magenta background and clearly walkable.

Keep the middle of the screen quiet so fighters stay readable.

## 5. Effects (optional later)
Sprite strips on magenta: weapon swing trail, impact burst (4 frames), landing dust (4 frames), knockout flash (6 frames).
