import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { TitleScene } from './scenes/TitleScene';
import { MenuScene } from './scenes/MenuScene';
import { FightScene } from './scenes/FightScene';
import { ResultScene } from './scenes/ResultScene';
import { HUDScene } from './scenes/HUDScene';
import { ManagerScene } from './scenes/ManagerScene';
import { TouchControls } from './input/TouchControls';
import { LobbyScene } from './scenes/LobbyScene';
import { LootScene } from './scenes/LootScene';
import { MapScene } from './scenes/MapScene';
import { bindNetGame } from './net/session';
import { installBackgroundTicker } from './net/background';
import { installCrispText, RES } from './ui/hires';

installCrispText();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 960 * RES,
  height: 540 * RES,
  backgroundColor: '#0b0f1a',
  pixelArt: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  input: {
    gamepad: true,
    keyboard: { capture: [32, 37, 38, 39, 40, 9] },
    touch: { capture: true },
  },
  scene: [BootScene, TitleScene, MenuScene, ManagerScene, LobbyScene, FightScene, HUDScene, MapScene, LootScene, ResultScene, TouchControls],
});

installBackgroundTicker(game); // a hidden host tab keeps the match running
bindNetGame(game); // lets network messages switch scenes (match start, back to lobby, disconnects)

// dev-only handle for poking at scenes from the browser console
if (import.meta.env.DEV) {
  (window as unknown as { __game: Phaser.Game }).__game = game;
  // __net: network-layer console helpers (see src/net/devConsole.ts); not included in production builds
  void import('./net/devConsole').then((m) => m.installNetConsole(game));
}
