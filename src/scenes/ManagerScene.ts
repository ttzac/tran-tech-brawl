import Phaser from 'phaser';
import { heroes } from '../data/heroes';
import { ART, textureKey } from '../data/art';
import {
  DEFAULT_LOADOUT,
  RARITIES,
  RARITY_COLOR,
  RARITY_LABEL,
  SLOTS,
  applyLoadout,
  findItem,
  itemsFor,
  type ItemDef,
  type Loadout,
  type Slot,
} from '../data/items';
import type { FighterDef } from '../data/types';
import { PRESET_COUNT, getLoadout, getPresets, resetAllLoadouts, resetLoadout, savePreset, setLoadout } from '../systems/Loadout';

const FONT = 'Consolas, "Segoe UI Emoji", "Courier New", monospace';
const SLOT_LABEL: Record<Slot, string> = { weapon: 'WEAPON', item: 'ITEM', powerup: 'POWERUP' };
const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;

interface StatRow {
  label: string;
  tip: string;
  get: (d: FighterDef) => number;
  fmt: (n: number) => string;
  lowerIsBetter?: boolean;
}
const STATS: StatRow[] = [
  { label: 'SPEED', tip: 'Run speed on the ground and in the air.', get: (d) => d.speed, fmt: (n) => `${Math.round(n)}` },
  { label: 'JUMP', tip: 'Jump launch speed: higher = taller jumps.', get: (d) => d.jumpVelocity, fmt: (n) => `${Math.round(n)}` },
  { label: 'JUMPS', tip: 'Total jumps before landing (2 = double jump).', get: (d) => d.jumps, fmt: (n) => `${n}` },
  { label: 'WEIGHT', tip: 'Heavier fighters are launched less by hits.', get: (d) => d.weight, fmt: (n) => n.toFixed(2) },
  { label: 'MELEE DMG', tip: 'Damage % added to the victim per melee hit.', get: (d) => d.melee.damage, fmt: (n) => n.toFixed(1) },
  { label: 'MELEE KB', tip: 'Base launch power of your melee hit.', get: (d) => d.melee.knockback, fmt: (n) => `${Math.round(n)}` },
  { label: 'MELEE RANGE', tip: 'How far in front of you the melee reaches (px).', get: (d) => d.melee.range, fmt: (n) => `${Math.round(n)}` },
  { label: 'ATTACK MS', tip: 'Time between melee swings. Lower is faster.', get: (d) => d.melee.cooldown, fmt: (n) => `${Math.round(n)}`, lowerIsBetter: true },
  { label: 'SPECIAL DMG', tip: 'Damage % added by your projectile special.', get: (d) => d.special.damage, fmt: (n) => n.toFixed(1) },
  { label: 'SPECIAL KB', tip: 'Base launch power of your special.', get: (d) => d.special.knockback, fmt: (n) => `${Math.round(n)}` },
  { label: 'SPECIAL MS', tip: 'Special recharge time. Lower is faster.', get: (d) => d.special.cooldown, fmt: (n) => `${Math.round(n)}`, lowerIsBetter: true },
  { label: 'SPECIAL SIZE', tip: 'Projectile size: bigger is easier to land.', get: (d) => d.special.size, fmt: (n) => n.toFixed(2) },
];
// stats shown in the always-visible block (the compare panel can show all of them)
const SHOWN = [0, 1, 2, 3, 4, 6, 7, 8, 10];

/**
 * Character Manager: pick a hero, then swap their weapon, item and powerup.
 * Loadouts are stored per hero (src/systems/Loadout.ts) and applied when the fight starts.
 * Keys: W/S = hero · A/D = cycle option · 1/2/3 or Tab = slot · R = reset hero · Shift+R = reset all
 *       4/5/6 = load preset · Shift+4/5/6 = save preset · Esc = back.
 */
export class ManagerScene extends Phaser.Scene {
  private heroIdx = 0;
  private slotIdx = 0;
  private loadout!: Loadout;
  private hover: ItemDef | null = null;
  private dyn: Phaser.GameObjects.GameObject[] = [];
  private cmp: Phaser.GameObjects.GameObject[] = [];
  private tipText?: Phaser.GameObjects.Text;
  private statusText?: Phaser.GameObjects.Text;
  private resetArmedAt = 0;

  constructor() {
    super('Manager');
  }

  create(data?: { heroId?: string }): void {
    this.heroIdx = Math.max(0, heroes.findIndex((h) => h.id === data?.heroId));
    this.slotIdx = 0;
    this.hover = null;
    this.resetArmedAt = 0;
    this.cameras.main.setBackgroundColor(0x0b0f1a);

    this.add.text(30, 22, 'CHARACTER MANAGER', { fontFamily: FONT, fontSize: '28px', fontStyle: 'bold', color: '#60a5fa' });
    this.add.text(30, 54, 'swap weapons, items and powerups for each fighter', { fontFamily: FONT, fontSize: '13px', color: '#64748b' });
    this.add
      .text(930, 22, '[ ESC ] BACK', { fontFamily: FONT, fontSize: '16px', color: '#facc15' })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.back());
    this.add
      .text(930, 46, '[ SHIFT+R ] RESET ALL FIGHTERS', { fontFamily: FONT, fontSize: '12px', color: '#f87171' })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.resetAll());
    // rarity legend
    RARITIES.forEach((r, i) => {
      const x = 600 + i * 92;
      this.add.rectangle(x + 5, 74, 10, 10, 0x131a2b).setStrokeStyle(2, RARITY_COLOR[r]);
      this.add.text(x + 14, 67, RARITY_LABEL[r], { fontFamily: FONT, fontSize: '11px', color: hex(RARITY_COLOR[r]) });
    });
    this.add.text(30, 520, 'W/S hero · A/D option · 1/2/3 slot · R reset · Shift+R all · 4/5/6 load preset · Shift+4/5/6 save · ESC back', {
      fontFamily: FONT,
      fontSize: '11px',
      color: '#64748b',
    });
    this.statusText = this.add.text(480, 500, '', { fontFamily: FONT, fontSize: '12px', color: '#facc15' }).setOrigin(0.5, 0).setDepth(5);

    const kb = this.input.keyboard!;
    kb.on('keydown-ESC', () => this.back());
    kb.on('keydown-W', () => this.pickHero(this.heroIdx - 1));
    kb.on('keydown-UP', () => this.pickHero(this.heroIdx - 1));
    kb.on('keydown-S', () => this.pickHero(this.heroIdx + 1));
    kb.on('keydown-DOWN', () => this.pickHero(this.heroIdx + 1));
    kb.on('keydown-A', () => this.cycle(-1));
    kb.on('keydown-LEFT', () => this.cycle(-1));
    kb.on('keydown-D', () => this.cycle(1));
    kb.on('keydown-RIGHT', () => this.cycle(1));
    kb.on('keydown-ONE', () => this.pickSlot(0));
    kb.on('keydown-TWO', () => this.pickSlot(1));
    kb.on('keydown-THREE', () => this.pickSlot(2));
    kb.on('keydown-FOUR', (e: KeyboardEvent) => this.preset(0, e.shiftKey));
    kb.on('keydown-FIVE', (e: KeyboardEvent) => this.preset(1, e.shiftKey));
    kb.on('keydown-SIX', (e: KeyboardEvent) => this.preset(2, e.shiftKey));
    kb.on('keydown-TAB', (e: KeyboardEvent) => {
      e.preventDefault();
      this.pickSlot((this.slotIdx + 1) % SLOTS.length);
    });
    kb.on('keydown-R', (e: KeyboardEvent) => (e.shiftKey ? this.resetAll() : this.reset()));

    this.refresh();
  }

  private hero(): FighterDef {
    return heroes[this.heroIdx];
  }

  private say(msg: string): void {
    this.statusText?.setText(msg);
    this.time.delayedCall(1800, () => {
      if (this.statusText?.text === msg) this.statusText.setText('');
    });
  }

  private back(): void {
    this.scene.start('Menu', { heroId: this.hero().id });
  }

  private pickHero(i: number): void {
    this.heroIdx = Phaser.Math.Wrap(i, 0, heroes.length);
    this.hover = null;
    this.refresh();
  }

  private pickSlot(i: number): void {
    this.slotIdx = i;
    this.hover = null;
    this.refresh();
  }

  private equip(slot: Slot, id: string): void {
    this.loadout = { ...this.loadout, [slot]: id };
    setLoadout(this.hero().id, this.loadout);
    this.hover = null;
    this.refresh();
  }

  private cycle(dir: number): void {
    const slot = SLOTS[this.slotIdx];
    const opts = itemsFor(slot);
    const cur = opts.findIndex((o) => o.id === this.loadout[slot]);
    this.equip(slot, opts[Phaser.Math.Wrap(cur + dir, 0, opts.length)].id);
  }

  private reset(): void {
    resetLoadout(this.hero().id);
    this.say(`${this.hero().name} reset to default gear`);
    this.refresh();
  }

  /** Needs a second press within 3s so it can't be hit by accident. */
  private resetAll(): void {
    const now = this.time.now;
    if (now - this.resetArmedAt > 3000 || this.resetArmedAt === 0) {
      this.resetArmedAt = now;
      this.say('Press Shift+R again to reset ALL fighters');
      return;
    }
    this.resetArmedAt = 0;
    resetAllLoadouts(heroes.map((h) => h.id));
    this.say('All fighters reset');
    this.refresh();
  }

  private preset(i: number, save: boolean): void {
    if (i >= PRESET_COUNT) return;
    const id = this.hero().id;
    if (save) {
      savePreset(id, i, this.loadout);
      this.say(`Saved preset ${i + 4 - 3}`);
    } else {
      const p = getPresets(id)[i];
      if (!p) return this.say(`Preset ${i + 1} is empty (Shift+${i + 4} to save)`);
      setLoadout(id, p);
      this.say(`Loaded preset ${i + 1}`);
    }
    this.refresh();
  }

  private put<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.dyn.push(o);
    return o;
  }

  private text(x: number, y: number, s: string, size: number, color: string, bold = false, bag: Phaser.GameObjects.GameObject[] = this.dyn): Phaser.GameObjects.Text {
    const t = this.add.text(x, y, s, { fontFamily: FONT, fontSize: `${size}px`, color, fontStyle: bold ? 'bold' : 'normal' });
    bag.push(t);
    return t;
  }

  private portrait(h: FighterDef, x: number, y: number, scale: number): void {
    const key = `portrait_${h.id}`;
    if (this.textures.exists(key)) {
      const im = this.add.image(x, y, key);
      this.put(im.setScale((scale * 96) / im.height));
    }
    else {
      const sp = this.put(this.add.sprite(x, y, textureKey(h.id)).setScale(scale * 0.9));
      if (ART[h.id] && this.anims.exists(`${h.id}:idle`)) sp.play(`${h.id}:idle`);
    }
  }

  private refresh(): void {
    for (const o of this.dyn) o.destroy();
    for (const o of this.cmp) o.destroy();
    this.dyn = [];
    this.cmp = [];
    const hero = this.hero();
    this.loadout = getLoadout(hero.id);

    // ---- left: hero list ----
    this.text(30, 84, 'FIGHTERS', 12, '#64748b');
    heroes.forEach((h, i) => {
      const y = 126 + i * 104;
      const sel = i === this.heroIdx;
      const card = this.put(this.add.rectangle(130, y, 200, 94, 0x131a2b).setStrokeStyle(3, sel ? 0x60a5fa : 0x334155).setInteractive({ useHandCursor: true }));
      card.on('pointerdown', () => this.pickHero(i));
      this.portrait(h, 66, y, 0.72);
      this.text(112, y - 32, h.name, 15, sel ? '#ffffff' : '#cbd5e1', true);
      this.text(112, y - 12, h.role, 11, '#64748b');
      const l = getLoadout(h.id);
      const icons = SLOTS.map((s) => findItem(s, l[s])?.icon ?? '➖').join(' ');
      this.text(112, y + 12, icons, 16, '#ffffff');
    });

    // ---- centre: big portrait + stats ----
    this.portrait(hero, 400, 178, 2.1);
    this.text(262, 290, hero.name, 20, '#ffffff', true);
    this.text(262 + 8 + hero.name.length * 12, 297, hero.role, 12, '#64748b');
    const eff = applyLoadout(hero, this.loadout);
    SHOWN.forEach((si, i) => {
      const s = STATS[si];
      const col = i < 5 ? 0 : 1;
      const row = i < 5 ? i : i - 5;
      const x = 262 + col * 160;
      const y = 322 + row * 22;
      const base = s.get(hero);
      const now = s.get(eff);
      const diff = now - base;
      const better = s.lowerIsBetter ? diff < 0 : diff > 0;
      const color = Math.abs(diff) < 1e-6 ? '#e2e8f0' : better ? '#4ade80' : '#f87171';
      this.text(x, y, s.label, 11, '#64748b');
      this.text(x + 88, y - 2, s.fmt(now), 14, color, true);
      const zone = this.put(this.add.rectangle(x + 65, y + 7, 140, 20, 0xffffff, 0).setInteractive());
      zone.on('pointerover', () => this.tipText?.setText(`${s.label}: ${s.tip} Base ${s.fmt(base)}.`));
      zone.on('pointerout', () => this.tipText?.setText(''));
    });
    this.tipText = this.text(262, 436, '', 11, '#94a3b8');
    this.tipText.setWordWrapWidth(300);

    // ---- centre bottom: presets ----
    this.text(262, 458, 'PRESETS  (4/5/6 load · Shift+4/5/6 save)', 10, '#64748b');
    const presets = getPresets(hero.id);
    presets.forEach((p, i) => {
      const x = 262 + i * 102;
      const box = this.put(this.add.rectangle(x + 47, 487, 94, 30, 0x131a2b).setStrokeStyle(2, p ? 0x60a5fa : 0x334155).setInteractive({ useHandCursor: true }));
      box.on('pointerdown', (ptr: Phaser.Input.Pointer) => this.preset(i, ptr.event.shiftKey || ptr.rightButtonDown()));
      this.text(x + 4, 474, `${i + 4}`, 10, '#facc15');
      const label = p ? SLOTS.map((s) => findItem(s, p[s])?.icon ?? '➖').join('') : 'empty';
      this.text(x + 18, p ? 476 : 479, label, p ? 14 : 11, p ? '#ffffff' : '#475569');
    });

    // ---- right: slots ----
    SLOTS.forEach((slot, i) => {
      const y = 112 + i * 52;
      const sel = i === this.slotIdx;
      const it = findItem(slot, this.loadout[slot]);
      const row = this.put(this.add.rectangle(765, y, 330, 46, 0x131a2b).setStrokeStyle(3, sel ? 0xfacc15 : 0x334155).setInteractive({ useHandCursor: true }));
      row.on('pointerdown', () => this.pickSlot(i));
      this.text(612, y - 19, `${i + 1}  ${SLOT_LABEL[slot]}`, 10, sel ? '#facc15' : '#64748b');
      this.text(612, y - 4, it?.icon ?? '➖', 20, '#ffffff');
      this.text(646, y - 8, it?.name ?? 'Empty', 15, '#ffffff', true);
      if (it) this.text(870, y - 19, RARITY_LABEL[it.rarity], 9, hex(RARITY_COLOR[it.rarity]));
    });

    // ---- right: options for the selected slot ----
    const slot = SLOTS[this.slotIdx];
    this.text(600, 244, `CHOOSE ${SLOT_LABEL[slot]}  (hover to compare)`, 11, '#64748b');
    const opts = itemsFor(slot);
    opts.forEach((o, i) => {
      const x = 654 + (i % 3) * 113;
      const y = 285 + Math.floor(i / 3) * 52;
      const equipped = this.loadout[slot] === o.id;
      const rc = RARITY_COLOR[o.rarity];
      const chip = this.put(
        this.add
          .rectangle(x, y, 108, 46, equipped ? 0x2a2410 : 0x131a2b)
          .setStrokeStyle(equipped ? 3 : 2, rc)
          .setInteractive({ useHandCursor: true }),
      );
      if (!equipped) chip.setStrokeStyle(2, rc, 0.75);
      chip.on('pointerdown', () => this.equip(slot, o.id));
      chip.on('pointerover', () => {
        this.hover = o;
        this.renderCompare();
      });
      chip.on('pointerout', () => {
        this.hover = null;
        this.renderCompare();
      });
      this.text(x - 50, y - 12, o.icon, 20, '#ffffff');
      const nm = this.text(x - 22, y - 14, o.name, 10, equipped ? '#facc15' : '#e2e8f0', equipped);
      nm.setWordWrapWidth(70);
    });
    this.renderCompare();
  }

  /** Compare panel: hovered option vs equipped, or the equipped option's own effect vs an empty slot. */
  private renderCompare(): void {
    for (const o of this.cmp) o.destroy();
    this.cmp = [];
    const hero = this.hero();
    const slot = SLOTS[this.slotIdx];
    const equipped = findItem(slot, this.loadout[slot]);
    const target = this.hover ?? equipped;
    const bag = this.cmp;
    bag.push(this.add.rectangle(765, 462, 340, 108, 0x0f1626).setStrokeStyle(2, target ? RARITY_COLOR[target.rarity] : 0x334155));
    if (!target) return;
    const against = this.hover ? this.loadout : { ...this.loadout, [slot]: DEFAULT_LOADOUT[slot] };
    const after = this.hover ? { ...this.loadout, [slot]: target.id } : this.loadout;
    const a = applyLoadout(hero, against);
    const b = applyLoadout(hero, after);
    const title = this.hover ? (this.hover.id === this.loadout[slot] ? 'EQUIPPED' : 'VS EQUIPPED') : 'EQUIPPED VS EMPTY';
    this.text(602, 414, `${target.icon} ${target.name}`, 13, '#ffffff', true, bag);
    this.text(930, 416, `${RARITY_LABEL[target.rarity]} · ${title}`, 9, hex(RARITY_COLOR[target.rarity]), false, bag).setOrigin(1, 0);
    this.text(602, 431, target.desc, 10, '#94a3b8', false, bag).setWordWrapWidth(320);
    let n = 0;
    for (const s of STATS) {
      const from = s.get(a);
      const to = s.get(b);
      const diff = to - from;
      if (Math.abs(diff) < 1e-6 || n >= 8) continue;
      const better = s.lowerIsBetter ? diff < 0 : diff > 0;
      const x = 602 + (n % 2) * 166;
      const y = 458 + Math.floor(n / 2) * 13;
      const sign = diff > 0 ? '+' : '';
      const pct = Math.abs(from) > 1e-6 ? `${sign}${Math.round((diff / from) * 100)}%` : `${sign}${s.fmt(diff)}`;
      const t = this.text(x, y, `${s.label.padEnd(11)} ${pct}`, 10, better ? '#4ade80' : '#f87171', false, bag);
      t.setInteractive().on('pointerover', () => this.tipText?.setText(`${s.label}: ${s.tip} ${s.fmt(from)} > ${s.fmt(to)}`));
      n++;
    }
    if (n === 0) this.text(602, 458, 'No stat changes', 10, '#64748b', false, bag);
  }
}
