/** Shared state written by TouchControls and read by Player.readInput. */
export const touchState = {
  /** true while the Touch overlay is live (touch device in a fight) */
  active: false,
  dir: 0 as -1 | 0 | 1,
  drop: false,
  /** one-frame pulses: set on press, cleared when consumed */
  jump: false,
  attack: false,
  special: false,
};

export function resetTouchState(): void {
  touchState.dir = 0;
  touchState.drop = false;
  touchState.jump = false;
  touchState.attack = false;
  touchState.special = false;
}

export function isTouchDevice(): boolean {
  return typeof window !== 'undefined' && (navigator.maxTouchPoints > 0 || 'ontouchstart' in window);
}
