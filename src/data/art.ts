/**
 * Art manifest. A character with an entry here uses real Aseprite art
 * (public/assets/sprites/<id>.png + <id>.json); everyone else keeps the generated
 * placeholder sprite. See ART_GUIDE.md for the export rules.
 *
 * Add an entry once the sheet exists, e.g.
 *   zac: { frame: 160, smooth: true, body: { w: 38, h: 92 } },
 */
export interface ArtDef {
  frame: number; // square frame size in px (feet must touch the bottom edge)
  smooth?: boolean; // fine-detail art: use linear filtering instead of crisp pixels
  body: { w: number; h: number }; // physics body in art pixels, centred, bottom-aligned
}

export const ART: Record<string, ArtDef> = {
  // Hero sheets: 160px frames drawn at 0.15 of the 1024 source canvas (standing height about 96 px); FighterDef.scale shrinks them in the world.
  zac: { frame: 160, smooth: true, body: { w: 38, h: 92 } },
  chain: { frame: 160, smooth: true, body: { w: 42, h: 88 } },
  altwave: { frame: 128, body: { w: 64, h: 92 } },
  muskbot: { frame: 192, body: { w: 72, h: 104 } },
  chatbot: { frame: 64, body: { w: 30, h: 38 } },
  neurobot: { frame: 64, body: { w: 30, h: 38 } },
};

/** Effect spritesheets in public/assets/fx/<name>.png (plain equal-cell strips). */
export const FX: Record<string, { w: number; h: number }> = {
  burst: { w: 41, h: 35 },
  dust: { w: 42, h: 22 },
  ring: { w: 75, h: 41 },
  swoosh: { w: 46, h: 34 },
};

/** Stage pieces in public/assets/stages/<name>.png */
export const STAGE_IMAGES = ['sky', 'server', 'bench', 'hang', 'ledge'];

/** Menu portraits in public/assets/portraits/<id>.png (96x96), made with tools/art/import.mjs. */
export const PORTRAITS = ['zac', 'chain', 'sysadmin'];

/** Animation tags every sheet should provide, named `<id>:<state>` in Aseprite. */
export const ART_STATES = ['idle', 'run', 'jump', 'fall', 'melee', 'special', 'hurt', 'launch'] as const;
export type ArtState = (typeof ART_STATES)[number];

export const textureKey = (id: string): string => (ART[id] ? id : `fighter_${id}`);
