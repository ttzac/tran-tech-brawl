// Everything that is NOT a playable hero: bosses, minions, stages, effects, items, UI, key art.
// Each entry becomes its own prompt file / image. Format: [filename, tier, frames-or-1, prompt]
// size: 'char' = 1024x1024 sprite frame (magenta bg) | 'wide' = 1920x1080 | 'tile' = see prompt | 'icon' = 512x512

export const BOSSES = [
  {
    id: 'altwave', name: 'Chairman Altwave', priority: 1, size: 'char', stand: 'about 130% of Zac height',
    look:
      'A silver-haired, smug, theatrical tech-CEO caricature (parody of an AI-company founder, NOT a real person\'s portrait: exaggerated cartoon). ' +
      'Immaculate CREAM / ivory three-piece suit with a flowing cape-like coat, a green-gem lapel pin, a green tie, neat silver beard and swept-back silver hair, warm villain grin, rides a floating luxury COMMAND CHAIR (white leather, hovering on a green anti-gravity glow, with a glowing "prompt" console in front). Colour accents: emerald green #19D37A, cream #F6EAD2, gold.',
    melee: '"Hostile Takeover": lunges forward in the chair and slams a gigantic glowing contract down.',
    special: '"Prompt Flood": throws a flood of glowing text-bubble prompts that fly at the heroes.',
    frames: [
      ['idle_1', 1, 'IDLE 1 of 4: hovering, one leg crossed, arms spread, laughing.'], ['idle_2', 1, 'IDLE 2 of 4: chair bobs up, hand raised in a lecturing gesture.'],
      ['idle_3', 1, 'IDLE 3 of 4: chair at the peak, a smug head tilt.'], ['idle_4', 1, 'IDLE 4 of 4: chair bobs down, fingers steepled.'],
      ['walk_1', 1, 'MOVE 1 of 4: the chair glides forward leaning in, cape streaming back.'], ['walk_2', 1, 'MOVE 2 of 4: chair rising, engine glow stronger.'],
      ['walk_3', 1, 'MOVE 3 of 4: chair cruising, he waves a hand dismissively.'], ['walk_4', 1, 'MOVE 4 of 4: chair dipping, loops to 1.'],
      ['melee_1', 1, 'MELEE 1 of 4 "Hostile Takeover" ANTICIPATION: leans back, a gigantic contract scroll rises in one hand.'], ['melee_2', 1, 'MELEE 2 of 4 WIND-UP: chair tilts back, contract raised over his head, evil laugh.'],
      ['melee_3', 1, 'MELEE 3 of 4 CONTACT: chair lunges forward, contract slammed down, arm fully extended. No effects drawn.'], ['melee_4', 1, 'MELEE 4 of 4 RECOVERY: chair slides back, he straightens his tie.'],
      ['special_1', 1, 'SPECIAL 1 of 4 "Prompt Flood" CHARGE: both hands raised, the console in front glows.'], ['special_2', 1, 'SPECIAL 2 of 4: hands thrust forward, mouth wide, shouting commands.'],
      ['special_3', 1, 'SPECIAL 3 of 4: rapid-fire repeating gesture, one hand flicking forward.'], ['special_4', 1, 'SPECIAL 4 of 4 RECOVERY: leans back, smug smirk.'],
      ['hurt_1', 1, 'HURT 1 of 2: head snapping back, monocle-less eyes shut, chair wobbling.'], ['hurt_2', 1, 'HURT 2 of 2: gripping the chair arms, chair sparking, grimace.'],
      ['launch_1', 1, 'LAUNCHED: tumbling out of the chair mid-air, limbs flailing, cape wrapping around him.'],
      ['intro_1', 2, 'INTRO 1 of 3: descends from above on the chair in a spotlight, arms wide.'], ['intro_2', 2, 'INTRO 2 of 3: lands, points at the heroes with a sneer.'], ['intro_3', 2, 'INTRO 3 of 3: leans in, a villain laugh, chair glowing.'],
      ['defeat_1', 2, 'DEFEAT 1 of 3: the chair sparks and smokes, he falls out of it, shocked.'], ['defeat_2', 2, 'DEFEAT 2 of 3: on the ground, suit torn, hair messed, fist shaking.'], ['defeat_3', 2, 'DEFEAT 3 of 3: collapsed, swirl eyes, the chair\'s glow dies.'],
    ],
    fx: [
      ['fx_contract_slam', 2, 4, '4-frame impact burst: a giant glowing contract page slam with text bubbles and green shockwave.'],
      ['fx_prompt_proj', 2, 4, '4-frame looping projectile: a glowing speech-bubble/prompt chat bubble with a blinking cursor, green and white.'],
      ['fx_prompt_hit', 2, 4, '4-frame hit burst: chat bubble pops into green "..." characters and sparks.'],
      ['fx_chair_glow', 2, 4, '4-frame looping anti-gravity glow under the hovering command chair, emerald green rings.'],
    ],
  },
  {
    id: 'muskbot', name: 'Mecha Musk-Bot', priority: 1, size: 'char', stand: 'about 180% of Zac height',
    look:
      'A HUGE, heavy, angular red-and-black war robot (a parody mech, NOT a likeness of a real person: a faceless menacing robot head with a single glowing red visor slit and twin laser-eye lenses), thick armour plates, rocket-boot thrusters, shoulder-mounted launcher pods, a chest panel with a tiny rocket-and-bird emblem-like glyph (generic, no real logos). Colour accents: hot red #FF3B3B, black #1A1A24, steel grey, orange thruster flame.',
    melee: '"Robo Stomp": a huge stomp shaking the stage.',
    special: '"Laser Eyes": fires twin red laser beams from the visor.',
    frames: [
      ['idle_1', 1, 'IDLE 1 of 4: heavy stance, shoulders rising with a mechanical hiss.'], ['idle_2', 1, 'IDLE 2 of 4: visor flickers, steam from the vents.'], ['idle_3', 1, 'IDLE 3 of 4: shoulders at the peak.'], ['idle_4', 1, 'IDLE 4 of 4: settling, glowing visor steady.'],
      ['walk_1', 1, 'WALK 1 of 4: heavy step, left foot forward, leaning in.'], ['walk_2', 1, 'WALK 2 of 4: weight transfer, thrusters puffing.'], ['walk_3', 1, 'WALK 3 of 4: right foot forward.'], ['walk_4', 1, 'WALK 4 of 4: weight transfer, loops to 1.'],
      ['melee_1', 1, 'STOMP 1 of 4 ANTICIPATION: raises a leg high, thrusters hissing.'], ['melee_2', 1, 'STOMP 2 of 4 WIND-UP: body leaning back, leg at the apex, arms out.'], ['melee_3', 1, 'STOMP 3 of 4 CONTACT: foot slammed down, body bent, no effects drawn.'], ['melee_4', 1, 'STOMP 4 of 4 RECOVERY: slowly lifting the foot, steam venting.'],
      ['special_1', 1, 'LASER 1 of 4 CHARGE: head tilts, visor glows bright, shoulder pods open.'], ['special_2', 1, 'LASER 2 of 4: head locked forward, lenses blazing white-red. No beam drawn.'], ['special_3', 1, 'LASER 3 of 4: beam firing pose, body braced, recoil.'], ['special_4', 1, 'LASER 4 of 4 RECOVERY: venting steam from the visor.'],
      ['hurt_1', 1, 'HURT 1 of 2: armour dented, head snapped back, sparks.'], ['hurt_2', 1, 'HURT 2 of 2: staggering, a panel hangs open with sparks.'],
      ['launch_1', 1, 'LAUNCHED: tumbling, thrusters misfiring, parts flying.'],
      ['intro_1', 2, 'INTRO 1 of 3: dropping from above, thrusters blazing.'], ['intro_2', 2, 'INTRO 2 of 3: lands with a huge crouch, steam all around.'], ['intro_3', 2, 'INTRO 3 of 3: rises, roars, red visor flaring.'],
      ['defeat_1', 2, 'DEFEAT 1 of 3: armour cracking, sparks everywhere.'], ['defeat_2', 2, 'DEFEAT 2 of 3: collapsing to one knee, smoking.'], ['defeat_3', 2, 'DEFEAT 3 of 3: head hangs down, visor goes dark, smoke rising.'],
    ],
    fx: [
      ['fx_stomp_shock', 2, 4, '4-frame ground shockwave ring with debris for "Robo Stomp".'],
      ['fx_laser_beam_start', 2, 4, '4-frame laser beam muzzle flash: twin red lenses opening.'],
      ['fx_laser_beam_loop', 2, 4, '4-frame looping repeating beam segment (seamless horizontally), hot red core with white centre.'],
      ['fx_laser_hit', 2, 4, '4-frame laser hit burst, red sparks and orange flash.'],
      ['fx_thruster', 2, 4, '4-frame looping rocket-thruster flame, orange to yellow.'],
    ],
  },
];

export const MINIONS = [
  {
    id: 'chatbot', name: 'Chatbot', priority: 1, tint: 'teal #14B8A6',
    look: 'a small chubby monitor-faced bot on stubby legs, a rounded square CRT-style head with a smiling pixel face (two dot eyes, curved smile) that can change expression, a tiny speech-bubble antenna, little round hands.',
    frames: [['idle_1', 1, 'IDLE 1 of 2: standing, smiling face, antenna bobbing.'], ['idle_2', 1, 'IDLE 2 of 2: squish down slightly.'],
      ['walk_1', 1, 'WALK 1 of 4: left foot forward.'], ['walk_2', 1, 'WALK 2 of 4: passing.'], ['walk_3', 1, 'WALK 3 of 4: right foot forward.'], ['walk_4', 1, 'WALK 4 of 4: passing, loops.'],
      ['attack_1', 1, 'ATTACK 1 of 3 "Hallucinate": face turns glitchy and angry, leans back.'], ['attack_2', 1, 'ATTACK 2 of 3: lunges, face shows ">:(" with static.'], ['attack_3', 1, 'ATTACK 3 of 3: recovery.'],
      ['hurt_1', 1, 'HURT: face shows "X(" , body squashed.'], ['launch_1', 1, 'LAUNCHED: spinning, screen showing static.'], ['death_1', 2, 'DEATH 1 of 3: screen flickers.'], ['death_2', 2, 'DEATH 2 of 3: cracks.'], ['death_3', 2, 'DEATH 3 of 3: pops into small parts (parts drawn in the pose).']],
  },
  {
    id: 'neurobot', name: 'Neuro-Bot', priority: 1, tint: 'pink #F472B6',
    look: 'a small floating-brain-in-a-jar style bot: a glass dome with a pink glowing brain, spidery little legs, a tiny blinking eyes strip, wires trailing; looks mischievous and sparky.',
    frames: [['idle_1', 1, 'IDLE 1 of 2: hovering, brain pulsing.'], ['idle_2', 1, 'IDLE 2 of 2: hovering lower, brain dim.'],
      ['walk_1', 1, 'MOVE 1 of 4: spider-legs forward.'], ['walk_2', 1, 'MOVE 2 of 4.'], ['walk_3', 1, 'MOVE 3 of 4.'], ['walk_4', 1, 'MOVE 4 of 4, loops.'],
      ['attack_1', 1, 'ATTACK 1 of 3 "Zap": brain flaring, arcs forming.'], ['attack_2', 1, 'ATTACK 2 of 3: lightning arc thrust forward.'], ['attack_3', 1, 'ATTACK 3 of 3: recovery.'],
      ['hurt_1', 1, 'HURT: brain flashing red, dome cracking.'], ['launch_1', 1, 'LAUNCHED: spinning with wires streaming.'], ['death_1', 2, 'DEATH 1 of 3: dome cracks.'], ['death_2', 2, 'DEATH 2 of 3: brain lights flicker out.'], ['death_3', 2, 'DEATH 3 of 3: shatters into pieces.']],
  },
];

export const GLOBAL_FX = [
  ['fx_hit_small', 1, 4, 'SMALL HIT SPARK, 4 frames, white-yellow burst, neutral colours (tinted in game).'],
  ['fx_hit_medium', 1, 5, 'MEDIUM HIT SPARK, 5 frames: bigger burst with a ring.'],
  ['fx_hit_heavy', 1, 6, 'HEAVY HIT SPARK, 6 frames: huge burst with shock lines and a ring.'],
  ['fx_dust_run', 1, 4, 'RUNNING DUST puff, 4 frames, small footstep dust.'],
  ['fx_dust_land', 1, 5, 'LANDING DUST, 5 frames: two puffs spreading left and right along the ground.'],
  ['fx_jump_ring', 1, 4, 'DOUBLE-JUMP RING, 4 frames: horizontal ellipse ring under the feet.'],
  ['fx_ko_blast', 1, 8, 'KNOCK-OUT BLAST, 8 frames: huge star-burst explosion at the edge of the screen, white-yellow-orange with a teal outer ring.'],
  ['fx_ko_star', 2, 6, 'KO STAR SPARKLE, 6 frames: a falling star with a trail that flies off.'],
  ['fx_respawn_pad', 2, 6, 'RESPAWN PAD, 6 frames: a glowing hexagonal teal pad materialising with rising particles.'],
  ['fx_shield_bubble', 2, 4, 'INVINCIBILITY BUBBLE, 4 frames loop: a translucent teal shield bubble.'],
  ['fx_speed_lines', 2, 3, 'SPEED LINES, 3 frames: horizontal motion streaks.'],
  ['fx_block_spark', 3, 3, '3 frames: small metallic spark for blocked hits.'],
  ['fx_pickup_glow', 2, 6, 'ITEM PICKUP, 6 frames: golden rising sparkle ring.'],
  ['fx_damage_flash', 3, 3, 'WHITE DAMAGE FLASH overlay, 3 frames, pure white silhouette-friendly flash.'],
  ['fx_smoke_puff', 3, 4, 'SMOKE PUFF, 4 frames, grey, small.'],
  ['fx_explosion_small', 3, 6, 'SMALL EXPLOSION, 6 frames, orange.'],
  ['fx_lightning_arc', 3, 4, 'LIGHTNING ARC, 4 frames, blue-white.'],
  ['fx_confetti', 3, 6, 'VICTORY CONFETTI, 6 frames, teal / amber / white.'],
];

export const STAGES = [
  {
    id: 'serverroom', name: 'Server Room (vs Chairman Altwave)', priority: 1,
    mood: 'a vast TranTech data centre: tall server racks with pulsing green and blue LEDs, thick bundles of teal and amber cables on overhead trays, warm window light bleeding in on the left, a cosy IT desk corner (plant, sticky notes, mug) in the far left, hazard-striped service bench. A touch of emerald green from the boss.',
    layers: [
      ['bg_far', 1, 'FAR LAYER, 3840x1080 (parallax, 2x width): big industrial windows with warm golden-hour sky, distant towers of racks in blue haze, soft low contrast. No characters, no platforms.'],
      ['bg_mid', 1, 'MID LAYER, 3840x1080 on magenta background where there is no object: rows of server racks, patch panels, cable trays and shelving, medium contrast. Keep the centre quiet so fighters stay readable.'],
      ['bg_near', 2, 'NEAR FOREGROUND, 3840x1080 on magenta: only sparse silhouettes (cables hanging, a rack edge, steam), dark navy, low detail, translucent look.'],
      ['plat_main', 1, 'MAIN PLATFORM, 1400x120 tileable-looking wide SERVICE BENCH: wooden-and-steel workbench with amber/black hazard stripes on the edge, bolts, drawers visible underneath, readable top surface, on magenta.'],
      ['plat_soft', 1, 'SOFT PLATFORM, 300x40: a suspended rack-unit slab with green LEDs, hangs from two cables, readable top surface, on magenta.'],
      ['plat_ledge', 2, 'MAINTENANCE LEDGE, 300x40: a steel grating ledge with hazard stripe edge, on magenta.'],
      ['prop_desk', 2, 'PROP: the IT desk corner (computer with a teal wrench logo, mug, sticky notes, small plant), 600x400 on magenta.'],
      ['prop_robot_helper', 3, 'PROP: a tiny friendly TranTech helper-bot sitting idly (monitor face smiling), 128x128 on magenta, 4 frames bobbing.'],
    ],
  },
  {
    id: 'rooftop', name: 'Rooftop Launch Pad (vs Mecha Musk-Bot)', priority: 1,
    mood: 'an industrial city rooftop at dusk, a rocket launch gantry, antenna masts, satellite dishes, vivid orange-to-purple sunset sky, scattered clouds, glowing city lights below, red warning beacons; a hot-red accent from the boss.',
    layers: [
      ['bg_far', 1, 'FAR LAYER, 3840x1080: sunset sky with big clouds, distant skyline, a rocket on a far launch pad.'],
      ['bg_mid', 1, 'MID LAYER, 3840x1080 on magenta: neighbouring rooftops with water tanks, billboards (generic, no real logos), antenna masts.'],
      ['bg_near', 2, 'NEAR FOREGROUND, 3840x1080 on magenta: cables, railing silhouettes, steam vents.'],
      ['plat_main', 1, 'MAIN PLATFORM, 1100x120: a steel rooftop deck with hazard stripes, rivets, rope ladders and a blinking red beacon, on magenta.'],
      ['plat_soft', 1, 'SOFT PLATFORM, 300x40: a floating scaffold plank hung from chains, on magenta.'],
      ['plat_ledge', 2, 'LEDGE, 300x40: a corrugated metal awning ledge, on magenta.'],
    ],
  },
  {
    id: 'promptfactory', name: 'Prompt Factory (NEW stage 3)', priority: 3,
    mood: 'a green-lit factory where chat-bubble prompts are assembled on conveyor belts, robotic arms, giant keyboard keys as platforms, emerald glow, steam pipes; slightly absurd and playful.',
    layers: [
      ['bg_far', 3, 'FAR LAYER, 3840x1080: huge factory hall, chimneys with green smoke, hazy.'],
      ['bg_mid', 3, 'MID LAYER, 3840x1080 on magenta: conveyor belts carrying glowing speech bubbles, robotic arms.'],
      ['bg_near', 3, 'NEAR FOREGROUND on magenta, sparse.'],
      ['plat_main', 3, 'MAIN PLATFORM 1300x120: a conveyor belt with arrows.'],
      ['plat_soft', 3, 'SOFT PLATFORM 300x40: a giant keyboard keycap.'],
      ['plat_ledge', 3, 'LEDGE 300x40: a pipe ledge.'],
    ],
  },
  {
    id: 'ramvault', name: 'RAM Vault (NEW stage 4)', priority: 3,
    mood: 'inside a giant computer: glowing memory modules like skyscrapers, circuit-board streets, floating chips, electric blue and magenta-violet energy. NOTE: do not use pure magenta #FF00FF in this stage art (the keying colour); use violet #9B5CFF instead.',
    layers: [
      ['bg_far', 3, 'FAR LAYER, 3840x1080: a vast circuit landscape with towers of memory sticks.'],
      ['bg_mid', 3, 'MID LAYER, 3840x1080 on a PURE GREEN #00FF00 background instead of magenta (keying exception): floating chips and traces.'],
      ['bg_near', 3, 'NEAR FOREGROUND on green #00FF00, sparse.'],
      ['plat_main', 3, 'MAIN PLATFORM 1200x120 on green #00FF00: a giant RAM stick.'],
      ['plat_soft', 3, 'SOFT PLATFORM 300x40 on green: a floating CPU chip.'],
      ['plat_ledge', 3, 'LEDGE 300x40 on green: a trace-line ledge.'],
    ],
  },
];

// Item icons: 512x512 each, flat magenta background, bold readable at 48px. Names match src/data/items.ts.
export const ITEMS = [
  ['weapon_default', 'Signature (a toolbox / generic tool badge)'], ['weapon_cable', 'Ethernet Cable (coiled teal cable with RJ45)'], ['weapon_screwdriver', 'Screwdriver (yellow/black handle)'],
  ['weapon_keyboard', 'Mech Keyboard (amber keycaps)'], ['weapon_server', 'Rack Server (1U server with LEDs)'], ['weapon_mallet', 'Rubber Mallet'], ['weapon_solder', 'Soldering Iron (glowing orange tip, smoke)'], ['weapon_fibre', 'Fibre Whip (glowing multicolour fibre strand)'],
  ['item_headset', 'Headset'], ['item_coffee', 'Coffee Mug (steam)'], ['item_boots', 'Steel Boots'], ['item_lanyard', 'Staff Lanyard with ID badge'], ['item_toolbelt', 'Toolbelt'], ['item_duck', 'Rubber Duck (debugging duck with tiny glasses)'], ['item_energy', 'Energy Drink Can'], ['item_watch', 'Smartwatch (teal screen)'],
  ['powerup_surge', 'Surge Protector (power strip with shield glow)'], ['powerup_ups', 'UPS Battery'], ['powerup_overclock', 'Overclock (CPU with a flame)'], ['powerup_turbo', 'Turbo Boost (rocket chip)'], ['powerup_phish', 'Phishing Lure (fish hook with an envelope)'], ['powerup_defrag', 'Defrag (broom sweeping blocks)'], ['powerup_zeroday', 'Zero Day (glowing skull chip, epic)'], ['powerup_root', 'Root Access (crown with a terminal prompt, epic)'],
];

export const UI = [
  ['logo_game', 1, 'GAME LOGO "TRANTECH BRAWL": chunky pixel-art title lettering, deep navy fill with a teal bevel and amber outline, tiny wrench-and-bolt accents, hazard stripes on the ends. 1920x600 on magenta. Spell it exactly: TRANTECH BRAWL.'],
  ['logo_badge', 2, 'TRANTECH BADGE: the wide rectangular teal-outlined badge with the word TRANTECH and the line "We make IT happen." (generic recreation, 600x200 on magenta).'],
  ['title_background', 1, 'TITLE SCREEN BACKGROUND 1920x1080: the whole TranTech crew silhouetted in a heroic lineup in front of a glowing server skyline, amber window light, no text.'],
  ['title_keyart_roster', 1, 'ROSTER KEY ART, 3840x1080: all 11 heroes (Zac, Chain, Aiden, David, Anne-Maree, Bec, Caleb, Cameron, Jared, Lachlan, Ryan; David and Anne-Maree stand together at the centre as the bosses) in one dynamic lineup in the same style; matches the individual character references exactly. (Generate ONLY after every hero sheet is approved.)'],
  ['menu_panel', 2, 'MENU PANEL 9-slice: a dark navy rounded-corner panel with a teal border and rivets, 256x256 on magenta.'],
  ['menu_button', 2, 'BUTTON, 3 states in 3 separate images (normal, hover, pressed): 320x80, navy with teal border, amber hover.'],
  ['hud_frame', 1, 'HUD FRAME for the damage-percent panel: a dark panel with a teal border, a slot for a 96x96 portrait on the left, a big number area, and 3 empty stock-pip slots, 480x160 on magenta.'],
  ['hud_stock_icon', 1, 'STOCK PIP icon (a small teal wrench-and-bolt heart), 64x64 on magenta.'],
  ['hud_boss_bar', 1, 'BOSS HEALTH BAR frame, 1200x120 on magenta: an industrial bar with hazard stripes, rivets, and a skull-chip icon.'],
  ['hud_ko_banner', 2, 'KO BANNER: "K.O.!" in huge pixel lettering, yellow with navy outline, 900x300 on magenta. Spell it exactly: K.O.!'],
  ['hud_victory_banner', 2, 'VICTORY BANNER: "SYSTEM RESTORED" in teal with amber outline, 1400x300 on magenta. Spell it exactly.'],
  ['hud_defeat_banner', 2, 'DEFEAT BANNER: "SYSTEM DOWN" in red with navy outline, 1400x300 on magenta. Spell it exactly.'],
  ['touch_buttons', 3, 'TOUCH OVERLAY: 5 separate round button icons (jump, attack, special, drop, pause), 192x192 each.'],
  ['cursor_select', 3, 'CHARACTER SELECT CURSOR: a teal pixel hand pointer, 128x128 on magenta.'],
];
