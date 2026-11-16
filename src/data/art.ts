/**
 * Art manifest. A character with an entry here uses real art
 * (public/assets/sprites/<id>.webp + <id>.json, Aseprite-style trimmed atlas); everyone else keeps the generated
 * placeholder sprite. See ART_GUIDE.md for the export rules.
 *
 * Add an entry once the sheet exists, e.g.
 *   zac: { frame: 512, smooth: true, res: 16 / 5, body: { w: 122, h: 294 } },
 */
export interface ArtDef {
  frame: number; // square frame size in px (feet must touch the bottom edge)
  smooth?: boolean; // fine-detail art: use linear filtering instead of crisp pixels
  body: { w: number; h: number }; // physics body in art pixels, centred, bottom-aligned
  res?: number; // art pixels per game pixel (default 1)
}

export const ART: Record<string, ArtDef> = {
  // Every sheet: 512px logical frames = the 1024 raw canvas at 0.5, trimmed and packed into <id>.webp by tools/art/import-all.mjs
  // (each frame resized so the character is the same size in every pose, see tools/art/rescale.json). `res` = art px per world px
  // before FighterDef.scale, picked so world size and hitboxes are what they were with the first art (heroes 16/5).
  zac: { frame: 512, smooth: true, res: 16 / 5, body: { w: 122, h: 294 } },
  chain: { frame: 512, smooth: true, res: 16 / 5, body: { w: 134, h: 282 } },
  david: { frame: 512, smooth: true, res: 16 / 5, body: { w: 140, h: 294 } },
  aiden: { frame: 512, smooth: true, res: 16 / 5, body: { w: 148, h: 314 } },
  annemaree: { frame: 512, smooth: true, res: 16 / 5, body: { w: 122, h: 288 } },
  bec: { frame: 512, smooth: true, res: 16 / 5, body: { w: 122, h: 282 } },
  caleb: { frame: 512, smooth: true, res: 16 / 5, body: { w: 116, h: 294 } },
  cameron: { frame: 512, smooth: true, res: 16 / 5, body: { w: 116, h: 294 } },
  jared: { frame: 512, smooth: true, res: 16 / 5, body: { w: 122, h: 300 } },
  lachlan: { frame: 512, smooth: true, res: 16 / 5, body: { w: 116, h: 294 } },
  ryan: { frame: 512, smooth: true, res: 16 / 5, body: { w: 116, h: 300 } },
  // Bosses and minions (tags run=walk, melee=attack). World-size boxes: altwave ~68x91, muskbot ~65x102, chatbot ~27x40, neurobot ~30x34.
  // Altwave fills the raw canvas, so his whole sheet is stored at 0.85 ("_all" in rescale.json) to leave room for his bigger poses.
  altwave: { frame: 512, smooth: true, res: 3.74, body: { w: 255, h: 340 } },
  muskbot: { frame: 512, smooth: true, res: 4, body: { w: 260, h: 410 } },
  chatbot: { frame: 512, smooth: true, res: 4.8, body: { w: 128, h: 192 } },
  neurobot: { frame: 512, smooth: true, res: 4, body: { w: 120, h: 136 } },
};

/** Effect spritesheets in public/assets/fx/<name>.png (plain equal-cell strips). */
export const FX: Record<string, { w: number; h: number; rate?: number; loop?: boolean }> = {
  burst: { w: 41, h: 35 },
  dust: { w: 42, h: 22 },
  ring: { w: 75, h: 41 },
  swoosh: { w: 46, h: 34 },
  // Codex per-frame hit sparks (tools/art/fxframes.mjs), 96px cells
  hit_small: { w: 96, h: 96 },
  hit_medium: { w: 96, h: 96 },
  // Codex global effects (tools/art/fxframes.mjs)
  hit_heavy: { w: 128, h: 128, rate: 14 },
  ko_blast: { w: 192, h: 192, rate: 14 },
  dust_land: { w: 96, h: 96, rate: 14 },
  dust_run: { w: 64, h: 64, rate: 14 },
  jump_ring: { w: 96, h: 96, rate: 14 },
  // Codex global effects imported 2026-11-13
  confetti: { w: 192, h: 192, rate: 10 },
  pickup_glow: { w: 128, h: 128, rate: 14 },
  ko_star: { w: 128, h: 128, rate: 14 },
  respawn_pad: { w: 160, h: 160, rate: 10 },
  smoke_puff: { w: 96, h: 96, rate: 12 },
  // Boss effects: Altwave's prompt projectile + its impact, Musk-Bot's laser impact and stomp shockwave
  altwave_proj: { w: 96, h: 96, rate: 12, loop: true },
  altwave_shit: { w: 128, h: 128, rate: 14 },
  muskbot_shit: { w: 128, h: 128, rate: 14 },
  muskbot_shock: { w: 256, h: 256, rate: 12 },
  // under a boss while it is in the air: Musk-Bot's thrusters, Altwave's chair glow
  altwave_thrust: { w: 192, h: 192, rate: 12, loop: true },
  muskbot_thrust: { w: 192, h: 192, rate: 14, loop: true },
};

/** Heroes that have per-hero effect strips: melee trail, melee hit, special projectile, special hit, special cast flash, ultimate wind-up / blast, aura. */
export const HERO_FX: Record<string, { special: boolean }> = {
  zac: { special: true }, chain: { special: true }, aiden: { special: true }, david: { special: true }, annemaree: { special: true }, bec: { special: true },
  caleb: { special: true }, cameron: { special: true }, jared: { special: true }, lachlan: { special: true }, ryan: { special: true },
};
function heroFx(): Record<string, { w: number; h: number; rate?: number; loop?: boolean }> {
  const out: Record<string, { w: number; h: number; rate?: number; loop?: boolean }> = {};
  for (const [id, f] of Object.entries(HERO_FX)) {
    out[`${id}_trail`] = { w: 160, h: 160, rate: 20 };
    out[`${id}_hit`] = { w: 96, h: 96, rate: 16 };
    if (f.special) {
      out[`${id}_proj`] = { w: 96, h: 96, rate: 12, loop: true };
      out[`${id}_shit`] = { w: 128, h: 128, rate: 14 };
      out[`${id}_charge`] = { w: 128, h: 128, rate: 16 }; // flash at the hands as the special leaves
    }
    // ultimate: `ulta` + `aura` play on the wind-up, `ultb` on the blast
    out[`${id}_ulta`] = { w: 192, h: 192, rate: 10 };
    out[`${id}_ultb`] = { w: 256, h: 256, rate: 14 };
    out[`${id}_aura`] = { w: 192, h: 192, rate: 10 };
  }
  return out;
}
Object.assign(FX, heroFx());

/** Stage pieces in public/assets/stages/<name>.png */
export const STAGE_IMAGES = ['sky', 'server', 'bench', 'hang', 'ledge', 'serverroom_far', 'serverroom_mid', 'serverroom_main', 'serverroom_soft', 'rooftop_far', 'rooftop_mid', 'rooftop_main', 'rooftop_soft'];

/** Row (source px from the top of the image) of each platform piece that fighters stand on: the art above it is railings, props or empty margin. */
export const STAGE_SURFACE: Record<string, number> = { rooftop_main: 90, serverroom_main: 11, rooftop_soft: 28, serverroom_soft: 14 };

/** Item / weapon / power-up icons in public/assets/items/<slot>_<id>.png (64x64), texture key `icon_<slot>_<id>`. 'none' has no icon. */
export const ITEM_ICONS = [
  'weapon_default', 'weapon_cable', 'weapon_screwdriver', 'weapon_keyboard', 'weapon_server', 'weapon_mallet', 'weapon_solder', 'weapon_fibre',
  'item_headset', 'item_coffee', 'item_boots', 'item_lanyard', 'item_toolbelt', 'item_duck', 'item_energy', 'item_watch',
  'powerup_surge', 'powerup_ups', 'powerup_overclock', 'powerup_turbo', 'powerup_phish', 'powerup_defrag', 'powerup_zeroday', 'powerup_root',
];
export const itemIconKey = (slot: string, id: string): string => `icon_${slot}_${id}`;

/** UI art in public/assets/ui/<name>.png, texture key `ui_<name>`. */
export const UI_IMAGES = ['hud_frame', 'hud_boss_bar', 'hud_stock_icon', 'logo_badge', 'logo_game', 'title_background', 'title_keyart_roster', 'hud_victory_banner', 'hud_defeat_banner', 'hud_ko_banner'];

/** Extra portrait moods in public/assets/portraits/<id>_<mood>.png (384px), texture key `portrait_<id>_<mood>`; select-screen key art in assets/keyart/<id>.png (`keyart_<id>`). */
export const PORTRAIT_MOODS = ['angry', 'hurt', 'win'] as const;

/** Menu portraits in public/assets/portraits/<id>.png (384px), made with tools/art/import.mjs. */
export const PORTRAITS = ['zac', 'chain', 'david', 'aiden', 'annemaree', 'bec', 'caleb', 'cameron', 'jared', 'lachlan', 'ryan'];

/** Animation tags every sheet should provide, named `<id>:<state>` in Aseprite. */
export const ART_STATES = ['idle', 'run', 'jump', 'fall', 'melee', 'special', 'hurt', 'launch', 'duck', 'hang', 'climb', 'land', 'melee2', 'ultimate', 'respawn', 'ko', 'taunt', 'victory', 'apex', 'aspecial', 'scharge', 'intro', 'defeat'] as const;
export type ArtState = (typeof ART_STATES)[number];

/** Display scale of a sprite: the fighter's world scale corrected for the sheet's resolution. */
export const artScale = (id: string, scale: number): number => scale / (ART[id]?.res ?? 1);

export const textureKey = (id: string): string => (ART[id] ? id : `fighter_${id}`);

/** Size of the generated placeholder fighter texture (BootScene) for characters without art. */
export const TEX_W = 28;
export const TEX_H = 44;

/** World-space collision box of a fighter, and how far its feet sit below the sprite centre.
 *  Feet are on the bottom edge of the frame; the box is centred horizontally. */
export function fighterBox(id: string, scale: number): { w: number; h: number; foot: number } {
  const art = ART[id];
  if (art) {
    const r = art.res ?? 1;
    return { w: (art.body.w * scale) / r, h: (art.body.h * scale) / r, foot: (art.frame * scale) / r / 2 };
  }
  return { w: TEX_W * scale, h: TEX_H * scale, foot: (TEX_H * scale) / 2 };
}

/** Sprite origin Y that puts the soles on the sprite's position (the importer stands feet 1/128 of a frame above the bottom edge). */
export const FEET_ORIGIN_Y = 127 / 128;
