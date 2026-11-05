# STATUS (Codex keeps this current; Claude reads it)

Last updated: 2026-11-05T06:54:24.236Z

Autopilot active: one current prompt per image, up to 10 independent image calls started together. Approval gates are read only from codex/approvals.json. See PROGRESS.md for the queue snapshot.

## Groups
| Group | State | Images done / total | Notes |
|---|---|---|---|
| heroes/zac | tier 1 ready | 26/86 | Approved design. |
| heroes/chain | tier 1 ready | 26/86 | Approved design. |
| heroes/aiden | sheet done | 2/86 | Design approval pending. |
| heroes/david | in progress | 15/86 | Approved design. |
| heroes/annemaree | sheet done | 2/86 | Design approval pending. |
| heroes/bec | sheet done | 2/86 | Design approval pending. |
| heroes/caleb | sheet done | 2/86 | Design approval pending. |
| heroes/cameron | sheet done | 2/86 | Design approval pending. |
| heroes/jared | sheet done | 2/86 | Design approval pending. |
| heroes/lachlan | sheet done | 2/86 | Design approval pending. |
| heroes/ryan | sheet done | 2/86 | Design approval pending. |
| bosses/altwave | sheet done | 1/43 | Design approval pending. |
| bosses/muskbot | sheet done | 1/47 | Design approval pending. |
| minions/chatbot | sheet done | 1/15 | Design approval pending. |
| minions/neurobot | sheet done | 1/15 | Design approval pending. |
| fx/global | in progress | 9/87 |  |
| stages/serverroom | not started | 0/9 |  |
| stages/rooftop | not started | 0/7 |  |
| stages/promptfactory | not started | 0/7 |  |
| stages/ramvault | not started | 0/7 |  |
| items/icons | not started | 0/24 |  |
| ui/ui | not started | 0/14 |  |

## Generator settings used
Built-in image_gen, current per-asset codex/prompts files and queue-listed existing references. Approved David sheet is rendering authority; staff photo is identity authority. Fine polished pixel art, navy outline, teal rim. Model/seed controls are not exposed. Every asset is separate; only design sheets are multi-view. Originals preserved in art-raw/_source/.

User-approved Node/Sharp normalization: nearest-neighbour whole artwork resizing; square production canvases 1024x1024 unless the prompt specifies another size. Grounded body feet y=960, hips x=512; source head/hip landmarks preserve per-character scale. Zac target head142.2px; Chain183.94px. No separate head deformation. New turnarounds normalized2048x1024; expressions1536x1024. Existing approved sheets keep original dimensions. Scripts and normalization records are under art-raw/_qa/.

## Questions for Zac
- Jared USER UPDATE: disc golf is his MAIN WEAPON, discs and disc bag; preserve all onsite technician tools, utility vest and veteran character. He is the main onsite guy. Current generated design follows this override. Claude must synchronize roster/moves/prompts; Codex does not edit protected source files. Gameplay remains gated by approvals.json.
- Chain source ultimate still says cable spin despite the approved 3D-printed katana. Current artwork follows katana design and user override; synchronize that move text in the source.
- Pending design sheets are listed in PROGRESS.md; continue ungated work without waiting for approval.

## Current production handoff
Zac and Chain Tier1 raw assets ready for import (24 each, plus approved sheets). Raw still-image validation passed; continuous animation and game integration need playtesting after Claude import. David and subsequent approved groups proceed through the queue. Do not treat file counts alone as full animation approval.

## Style reset and boundary
Approved style: codex/refs/style/APPROVED-style-david-sheet.webp. Retired art remains in art-raw/_old/. David supplied turnaround unchanged, SHA256 76a5a4de203f5a906ef5e10f794d39cc949559866d6af59b5bec4414b061ab53. Only art-raw/, codex/STATUS.md and codex/PROGRESS.md are writable. No src/public/tools/source prompt/roster/approval edits; no messages sent to Claude.

## Questions for Zac: unresolved image issues
- Jared disc-golf turnaround: after three generated candidates the generator still mirrors either the strap shoulder or the bag hip in the rear view. Retained the first disc-golf version with correct bag hip and user-approved face/tools; rear shoulder strap still needs review. Updated expressions use the front-view LEFT shoulder strap. Gameplay is gated. Do not treat this as final animation authority until approved/corrected.
- Cameron source roster specifies LEFT tattoo but staff photo and current front/profile show viewer-left=anatomical RIGHT. Preserve photo identity consistently; source needs synchronization.
