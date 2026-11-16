import type { StageDef } from './types';
import { BLAST, generateStage } from './procgen';

// Worlds are 1920x1080 (the camera zooms out to show ~1370x770 and follows the player),
// sized so 10 fighters (5 vs 5) have room to brawl.
const blast = BLAST;

export const stages: Record<string, StageDef> = {
  serverroom: {
    id: 'serverroom',
    name: 'Server Room',
    width: 1920,
    height: 1080,
    bg: 0x443d71,
    rack: 0x131d33,
    platforms: [
      { x: 960, y: 860, w: 1400, h: 40, solid: true },
      { x: 420, y: 700, w: 240, h: 12, solid: false },
      { x: 960, y: 700, w: 240, h: 12, solid: false },
      { x: 1500, y: 700, w: 240, h: 12, solid: false },
      { x: 690, y: 555, w: 220, h: 12, solid: false },
      { x: 1230, y: 555, w: 220, h: 12, solid: false },
      { x: 960, y: 415, w: 240, h: 12, solid: false },
    ],
    spawns: [{ x: 480, y: 560 }, { x: 1440, y: 560 }],
    blast,
    ground: { left: 260, right: 1660, top: 840 },
    // Codex stage art (2026-11-12): far + mid parallax layers, platform pieces
    art: { solid: 'serverroom_main', soft: 'serverroom_soft', backdrop: ['serverroom_far', 'serverroom_mid'] },
  },
  rooftop: {
    id: 'rooftop',
    name: 'Rooftop Launch Pad',
    width: 1920,
    height: 1080,
    bg: 0x443d71,
    rack: 0x2a1530,
    platforms: [
      { x: 960, y: 860, w: 1100, h: 40, solid: true },
      { x: 560, y: 700, w: 220, h: 12, solid: false },
      { x: 1360, y: 700, w: 220, h: 12, solid: false },
      { x: 760, y: 550, w: 200, h: 12, solid: false },
      { x: 1160, y: 550, w: 200, h: 12, solid: false },
      { x: 960, y: 400, w: 220, h: 12, solid: false },
    ],
    spawns: [{ x: 640, y: 560 }, { x: 1280, y: 560 }],
    blast,
    ground: { left: 410, right: 1510, top: 840 },
    art: { solid: 'rooftop_main', soft: 'rooftop_soft', backdrop: ['rooftop_far', 'rooftop_mid'] },
  },
  // Boss arenas built by the procedural generator with fixed seeds (so they are the same every time).
  printer: { ...generateStage(7001, { theme: 'printer', layout: 'islands' }), id: 'printer', name: 'Printer Incident' },
  cloud: { ...generateStage(7002, { theme: 'cloud', layout: 'tower' }), id: 'cloud', name: 'The Cloud' },
};
