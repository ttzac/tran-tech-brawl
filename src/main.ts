import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { FightScene } from './scenes/FightScene';
import { ResultScene } from './scenes/ResultScene';
import { HUDScene } from './scenes/HUDScene';
import { ManagerScene } from './scenes/ManagerScene';
import { TouchControls } from './input/TouchControls';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 960,
  height: 540,
  backgroundColor: '#0b0f1a',
  pixelArt: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  input: {
    gamepad: true,
    keyboard: { capture: [32, 37, 38, 39, 40, 9] },
    touch: { capture: true },
  },
  physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 1400 }, debug: false } },
  scene: [BootScene, MenuScene, ManagerScene, FightScene, HUDScene, ResultScene, TouchControls],
});

// dev-only handle for poking at scenes from the browser console
if (import.meta.env.DEV) (window as unknown as { __game: Phaser.Game }).__game = game;
