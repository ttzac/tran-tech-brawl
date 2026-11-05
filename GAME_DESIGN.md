# Tran Tech Brawl: Game Design

## The pitch
A lightweight 2D platform fighter that runs in the browser, in the spirit of Smash Bros, but co-op: **the TranTech crew fights a series of parody AI-company bosses and their bot armies.** Knock enemies off the stage by building up their damage %, not by draining a health bar.

## What we're trying to do
- Make a fun, fast, replayable brawler that is small enough to load instantly (Phaser 3, TypeScript, Vite, about 290 KB gzipped).
- Give TranTech its own game, with the IT crew as the heroes and recognisable tech-industry rivals as the villains.
- Build it so new characters, bosses and stages are mostly **data** (`src/data/`), so the game grows without engine rewrites.
- Look great with real pixel art and animation (Aseprite pipeline) once the mechanics feel right.

## The fiction
The AI companies have taken over the internet and run it with armies of bots. TranTech, a scrappy IT crew, is the only team left that can reboot them.

- **Heroes (TranTech crew):** each fighter has a different job and moveset. Current placeholders are Helpdesk Hero (all-rounder), Network Ninja (fast, light) and Sysadmin Tank (heavy). The real roster is to be decided: staff members or clients.
- **Bosses (all parody, renameable):**
  - *Chairman Altwave* (OpenAI-style): commands swarms of chatbot minions and floods the screen with prompts.
  - *Mecha Musk-Bot* (Grok/Neuralink-style): pilots a giant laser robot and charges the crew.
  - More bosses later, one per stage.
- **Minions:** a steady stream of weak bots per boss, so there is always a crowd to fight.

## Core gameplay
- **Damage %, not HP:** every hit raises the victim's %; the higher it is, the further they are launched. Heavier fighters fly less far.
- **Stocks:** 3 lives each. Leaving the blast zone costs a stock.
- **Moves:** movement and double jump, a melee attack, a projectile special, and drop-through platforms.
- **Match shape:** you plus 4 AI allies (5) against a boss plus up to 4 minions (5), so up to **10 fighters** on a 1920×1080 stage with a scrolling camera.
- **Win/lose:** defeat the boss to win; you lose when your whole team is out.
- **Boss behaviour:** bots run a small state machine (approach, attack, dodge, recover). Bosses add a signature pattern (a projectile barrage or a charge) and spawn minion waves.

## Controls
WASD or arrows to move, W/Up/Space to jump, S/Down to drop through platforms, J or Z to attack, K or X for special.

## Where it is now
Playable prototype: menu with hero and boss select, 2 stages, 3 heroes, 2 bosses with minion waves, 4 AI allies, HUD, results screen. Sprites are generated in code, with no art yet.

## Roadmap
1. **Feel pass:** tune knockback, ally AI and balance in 5v5.
2. **Real roster:** replace placeholder heroes with the actual TranTech crew and give each a signature move.
3. **Pixel art and animation:** Aseprite sheets for heroes, bosses and minions, plus parallax backgrounds.
4. **More content:** more bosses and stages, boss intros, music and sound.
5. **Optional:** gamepad support and online multiplayer, so 10 real players can join one match.

## Open questions
- Are the heroes TranTech staff or clients?
- Is multiplayer co-op against bosses only, or also free-for-all?
- Is this an internal fun project, a marketing piece for TranTech, or something to release? This affects how careful we need to be about parody names and branding.
