# Art bible: TranTech Brawl

Reference: `refs/style/art-direction-concept.webp` (the target). Goal: **same world, a notch higher quality, a touch more vibrant.**

## Look
- 2D pixel art, arcade-brawler proportions: head about 1/3.5 of body height, big hands and boots, expressive faces, strong silhouettes.
- **Approved look: `refs/style/APPROVED-style-david-sheet.webp`.** Clean, polished, less-pixelated pixel art: fine uniform pixel blocks (about 4x4 px on a 1024 canvas = 256x256 logical grid), tidy smooth edges, no blur, no gradients, no painterly or 3D rendering, no stray single-pixel noise.
- Outline: deep navy `#0B1026`, never pure black. Outer silhouette outline slightly heavier than inner lines.
- Shading: cel, 3 tones + 1 highlight per material. Key light warm from the top-left; cool teal rim light from the back-right so characters pop off the dark backgrounds.
- Detail target = the approved reference: clean faces (eyes, brows, glasses glints, beard texture), fabric folds and seams, gold/teal trim lines, metallic highlights, glowing screens and LEDs. Keep the arcade proportions of the concept (big head, hands, boots).
- Vibrance target: saturation about +15% vs the concept. Rich, clean, game-like; never neon-garish and never muddy.

## Palette (per character about 32 colours; share these anchors)
| Use | Hex |
|---|---|
| Outline | `#0B1026` |
| Uniform polo (near black navy) / mid / light | `#121B33` / `#1D2C52` / `#2E4478` |
| TranTech teal (brand) / bright teal | `#19D3C5` / `#2EE6D6` |
| Amber (hazard stripes, boots, accents) | `#FFA31A` |
| Warm gold (key light, tickets, stars) | `#FFC857` |
| Electric blue (server LEDs) | `#3EA6FF` |
| LED green / emerald (Altwave) | `#4DFF88` / `#19D37A` |
| Boss red (Musk-Bot) | `#FF3B3B` |
| Violet (Bec, epic glow) | `#B26BFF` / `#9B5CFF` |
| Cream (Altwave suit, paper) | `#F6EAD2` |
| Keying colours (never in art) | magenta `#FF00FF` (green `#00FF00` only for RAM Vault) |

## Proportion and scale (1024 canvas, standing height)
Zac about 640 px (the reference 1.0), Chain 620, Aiden 735 (heavy), Anne-Maree 630, Bec 640, Caleb 670, Cameron 640, Jared 660, Lachlan 690, Ryan 660, minions about 330, Altwave about 820 (in chair), Musk-Bot about 900. Feet on y=960, centre x=512.

## The uniform (the glue of the roster)
Dark navy-black polo (or the black top for Anne-Maree and Bec), teal/light-blue inner collar, small teal perforation dots on the sleeve hems, a wide rectangular **teal-outlined TranTech badge** on the left chest. Everyone looks like crew, everyone's face and kit are different.

## Per-hero silhouette cheat (they must read apart in 1 second at 64 px)
| Hero | Hair / head | Signature silhouette |
|---|---|---|
| Zac | short light-brown hair, full copper-brown beard | slim minimalist keyboard-blade, floating white AI puck, tattooed forearms |
| Chain | short black fringe, round face | long teal cable with a 3D-printed head, back-mounted printer pod, filament spools |
| Aiden | tousled dark hair, black glasses, goatee | huge code-scrolling rack-server fists, widest body |
| David | short dark hair greying at temples, black glasses, grey-and-brown beard | briefcase-shield, gold-trim executive jacket |
| Anne-Maree | curly hair, pink glasses, big laugh | golden gavel, floating executive clipboard, blazer |
| Bec | slicked-back hair, thick black glasses | calculator shield, unspooling receipt tape, PAID stamp |
| Caleb | tight curls, light stubble | lanky, wakeboard in hand, water spray |
| Cameron | light brown hair, black glasses | open laptop, fern tattoo, green code vines |
| Jared | long ponytail, big grey beard | gnarly staff with CRT monitor |
| Lachlan | light brown hair, long thin goatee | very tall, duct-taped soldering iron, goggles |
| Ryan | sandy spiky hair, grin | battle-worn toolbelt, grappling hook, sticker-covered drill |

## Animation principles (for the individual frames)
- Anticipation, strike, follow-through: the CONTACT frame is the biggest and clearest pose; the frame before is the most coiled.
- Run is a 6-frame cycle (contact, down, passing, contact, down, passing) with a forward lean.
- Loops (idle, run, fall, launch, effects marked "loop") must end one step before frame 1.
- Squash and stretch allowed on faces, hair and weapons; the body mass stays consistent so scale never drifts.

## Effects principles
White-hot core, saturated mid, dark edge, dithered fade. Each hero's effects use their own two-colour scheme (see `ROSTER_SUMMARY.md` / `roster.mjs` `fx`). Readable at 0.7x. They never cover the fighter's face.
