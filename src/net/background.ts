import type Phaser from 'phaser';
import { net } from './session';
import { NetHost } from './NetHost';

/** True while the background ticker (not the browser's own frame loop) is stepping the game. */
export const bg = { stepping: false };

/** Browsers stop animation frames in a hidden tab, which would freeze an online match for everyone if the HOST
 *  switches tabs or minimises. A Web Worker's timer keeps running there, so while this tab is hidden and hosting,
 *  the worker's ticks drive the game loop instead (the sim, the network and scene changes all keep going). */
export function installBackgroundTicker(game: Phaser.Game): void {
  if (typeof Worker === 'undefined' || typeof document === 'undefined') return;
  let worker: Worker;
  try {
    worker = new Worker(URL.createObjectURL(new Blob(['setInterval(function(){postMessage(0)},16)'], { type: 'text/javascript' })));
  } catch {
    return; // workers blocked: the host has to keep the tab visible
  }
  let last = 0;
  worker.onmessage = () => {
    if (!document.hidden || !(net instanceof NetHost)) {
      last = 0;
      return;
    }
    const t = performance.now();
    const dt = last ? Math.min(100, t - last) : 1000 / 60;
    last = t;
    bg.stepping = true;
    try {
      game.step(t, dt);
    } finally {
      bg.stepping = false;
    }
  };
}
