import Phaser from 'phaser';

/** The game renders at 2x its logical 960x540 so text and art stay sharp on big screens. */
export const RES = 2;
export const LOGICAL_W = 960;
export const LOGICAL_H = 540;

/** Make a scene's main camera show the logical 960x540 area on the 2x canvas. */
export function fitUi(scene: Phaser.Scene): void {
  scene.cameras.main.setZoom(RES).centerOn(LOGICAL_W / 2, LOGICAL_H / 2);
}

/** Every Text object renders at 2x so glyphs are not upscaled. Call once before creating the game. */
export function installCrispText(): void {
  const proto = Phaser.GameObjects.GameObjectFactory.prototype as unknown as { text: (...a: unknown[]) => Phaser.GameObjects.Text };
  const orig = proto.text;
  proto.text = function (this: unknown, ...a: unknown[]) {
    return orig.apply(this, a).setResolution(RES);
  };
}
