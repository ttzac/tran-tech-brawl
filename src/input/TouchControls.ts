import Phaser from 'phaser';
import { touchState, resetTouchState } from './touchState';

interface Btn {
  key: 'jump' | 'attack' | 'special' | 'drop';
  x: number;
  y: number;
  r: number;
  label: string;
  color: number;
  gfx?: Phaser.GameObjects.Arc;
}

/** Overlay scene with a virtual stick (left) and action buttons (right). Multitouch. */
export class TouchControls extends Phaser.Scene {
  private stickId = -1;
  private stickBase = new Phaser.Math.Vector2(130, 410);
  private btnPointers = new Map<number, Btn>();
  private btns: Btn[] = [];
  private knob!: Phaser.GameObjects.Arc;
  private ring!: Phaser.GameObjects.Arc;
  private stickDown = false;

  constructor() {
    super('Touch');
  }

  create(): void {
    this.input.addPointer(3);
    this.stickId = -1;
    this.stickDown = false;
    this.btnPointers.clear();
    touchState.active = true;
    resetTouchState();
    this.scene.bringToTop();

    this.ring = this.add.circle(this.stickBase.x, this.stickBase.y, 62, 0xffffff, 0.12).setStrokeStyle(2, 0xffffff, 0.35);
    this.knob = this.add.circle(this.stickBase.x, this.stickBase.y, 28, 0xffffff, 0.3);
    this.btns = [
      { key: 'jump', x: 880, y: 400, r: 38, label: 'JUMP', color: 0x4caf50 },
      { key: 'attack', x: 790, y: 460, r: 38, label: 'HIT', color: 0xef5350 },
      { key: 'special', x: 800, y: 350, r: 32, label: 'SPEC', color: 0x42a5f5 },
      { key: 'drop', x: 250, y: 490, r: 28, label: 'DROP', color: 0xffca28 },
    ];
    for (const b of this.btns) {
      b.gfx = this.add.circle(b.x, b.y, b.r, b.color, 0.25).setStrokeStyle(2, 0xffffff, 0.4);
      this.add.text(b.x, b.y, b.label, { fontFamily: 'monospace', fontSize: '13px', color: '#ffffff' }).setOrigin(0.5).setAlpha(0.7);
    }

    this.input.on('pointerdown', this.down, this);
    this.input.on('pointermove', this.move, this);
    this.input.on('pointerup', this.up, this);
    this.input.on('pointerupoutside', this.up, this);
    this.events.once('shutdown', this.cleanup, this);
    this.events.once('destroy', this.cleanup, this);
  }

  private cleanup(): void {
    this.input.off('pointerdown', this.down, this);
    this.input.off('pointermove', this.move, this);
    this.input.off('pointerup', this.up, this);
    this.input.off('pointerupoutside', this.up, this);
    touchState.active = false;
    resetTouchState();
  }

  private dropHeldByButton(): boolean {
    for (const b of this.btnPointers.values()) if (b.key === 'drop') return true;
    return false;
  }

  private hit(p: Phaser.Input.Pointer): Btn | undefined {
    return this.btns.find((b) => Phaser.Math.Distance.Between(p.x, p.y, b.x, b.y) <= b.r + 14);
  }

  private down(p: Phaser.Input.Pointer): void {
    const b = this.hit(p);
    if (b) {
      this.btnPointers.set(p.id, b);
      if (b.key === 'drop') touchState.drop = true;
      else touchState[b.key] = true;
      b.gfx?.setFillStyle(b.color, 0.55);
      return;
    }
    if (p.x < 480 && this.stickId < 0) {
      this.stickId = p.id;
      this.stickDown = false;
      this.stickBase.set(Phaser.Math.Clamp(p.x, 70, 400), Phaser.Math.Clamp(p.y, 200, 480));
      this.ring.setPosition(this.stickBase.x, this.stickBase.y);
      this.move(p);
    }
  }

  private move(p: Phaser.Input.Pointer): void {
    if (p.id !== this.stickId) return;
    const dx = p.x - this.stickBase.x;
    const dy = p.y - this.stickBase.y;
    const len = Math.hypot(dx, dy) || 1;
    const k = Math.min(len, 62) / len;
    this.knob.setPosition(this.stickBase.x + dx * k, this.stickBase.y + dy * k);
    touchState.dir = dx > 22 ? 1 : dx < -22 ? -1 : 0;
    this.stickDown = dy > 45;
    touchState.drop = this.stickDown || this.dropHeldByButton();
  }

  private up(p: Phaser.Input.Pointer): void {
    const b = this.btnPointers.get(p.id);
    if (b) {
      this.btnPointers.delete(p.id);
      b.gfx?.setFillStyle(b.color, 0.25);
    }
    if (p.id === this.stickId) {
      this.stickId = -1;
      this.stickDown = false;
      touchState.dir = 0;
      this.knob.setPosition(this.stickBase.x, this.stickBase.y);
    }
    touchState.drop = this.stickDown || this.dropHeldByButton();
  }
}
