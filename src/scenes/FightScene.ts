import Phaser from 'phaser';
import { heroes } from '../data/heroes';
import { bosses } from '../data/bosses';
import { stages } from '../data/stages';
import type { BossDef, BotSkill, FighterDef, StageDef } from '../data/types';
import { Fighter } from '../entities/Fighter';
import { Player } from '../entities/Player';
import { Bot, type ThinkCtx } from '../entities/Bot';
import { BossBrain } from '../ai/BossBrain';
import { Combat, type Shot } from '../systems/Combat';
import { Spawner } from '../systems/Spawner';
import type { HUDData } from './HUDScene';
import { applyLoadout } from '../data/items';
import { allyLoadout, getLoadout } from '../systems/Loadout';

/** 1 player + 4 AI allies vs. boss + up to 4 minions = 10 fighters on the map. */
const ALLY_COUNT = 4;
const ALLY_SKILL: BotSkill = { reactionMs: 200, specialChance: 0.3, dodgeChance: 0.25 };
const ZOOM = 0.7;

export class FightScene extends Phaser.Scene {
  private heroDef!: FighterDef;
  private bossDef!: BossDef;
  private stage!: StageDef;
  private bossIndex = 0;

  private fighters: Fighter[] = [];
  private platforms!: Phaser.Physics.Arcade.StaticGroup;
  private combat!: Combat;
  private spawner!: Spawner;
  private player!: Player;
  private boss!: Bot;
  private markers: { f: Fighter; m: Phaser.GameObjects.Text }[] = [];
  private colliders = new Map<Fighter, Phaser.Physics.Arcade.Collider>();
  private ended = false;
  private ring!: Phaser.GameObjects.Ellipse;
  private escHandler = (): void => {
    this.scene.start('Menu');
  };
  private spectating: Fighter | null = null;

  // per-frame scratch (reused, never reallocated)
  private heroes: Fighter[] = [];
  private enemies: Fighter[] = [];
  private heroShots: Shot[] = [];
  private enemyShots: Shot[] = [];
  private ctx: ThinkCtx = { foes: [], stage: undefined as unknown as StageDef, shots: [] };

  constructor() {
    super('Fight');
  }

  init(data: { heroId?: string; bossIndex?: number }): void {
    const base = heroes.find((h) => h.id === data.heroId) ?? heroes[0];
    this.heroDef = applyLoadout(base, getLoadout(base.id)); // gear picked in the Character Manager
    this.bossIndex = data.bossIndex ?? 0;
    this.bossDef = bosses[this.bossIndex] ?? bosses[0];
    this.stage = stages[this.bossDef.stageId];
  }

  create(): void {
    this.fighters = [];
    this.markers.length = 0;
    this.colliders.clear();
    this.heroes.length = this.enemies.length = this.heroShots.length = this.enemyShots.length = 0;
    this.spectating = null;
    this.ended = false;
    this.ctx.stage = this.stage;
    const st = this.stage;
    this.cameras.main.setBackgroundColor(st.bg);
    this.drawBackdrop();
    this.buildStage();

    this.combat = new Combat(this, () => this.fighters);
    const [heroSpawn, bossSpawn] = st.spawns;
    this.player = new Player(this, heroSpawn.x, heroSpawn.y, this.heroDef);
    this.addFighter(this.player, '#ffffff');
    this.boss = new Bot(this, bossSpawn.x, bossSpawn.y, this.bossDef.fighter, 'enemy', this.bossDef.skill, new BossBrain(this.bossDef.pattern));
    this.addFighter(this.boss);

    // AI allies fill out the hero team, spread either side of the player
    for (let i = 0; i < ALLY_COUNT; i++) {
      const pool = heroes.filter((h) => h.id !== this.heroDef.id);
      const base = pool[i % pool.length];
      const def = applyLoadout(base, allyLoadout(base.id, i)); // themed gear so allies feel varied
      const x = heroSpawn.x + (i % 2 ? 1 : -1) * (80 + Math.floor(i / 2) * 90);
      const ally = new Bot(this, x, heroSpawn.y, def, 'hero', ALLY_SKILL);
      ally.spawn.set(x, heroSpawn.y);
      this.addFighter(ally, '#67e8f9');
    }

    const g = st.ground;
    this.spawner = new Spawner(
      this.bossDef.waves,
      (x) => this.spawnMinion(x),
      () => this.count('enemy', true),
      [g.left + 60, g.right - 60],
    );

    // ground ring under the local player so they stay findable in a crowd
    this.ring = this.add.ellipse(0, 0, 54, 14).setStrokeStyle(2, 0xffffff, 0.75).setDepth(3);

    // camera: follow the player, zoomed out so the crowd fits
    const cam = this.cameras.main;
    cam.setBounds(0, 0, st.width, st.height);
    cam.setZoom(ZOOM);
    cam.startFollow(this.player, true, 0.08, 0.08);

    // HUD lives in its own scene so the zoom doesn't touch it
    const hudData: HUDData = {
      player: this.player,
      boss: this.boss,
      stats: () => ({ minions: this.count('enemy', true), wave: this.spawner.wave, allies: this.count('hero') - (this.player.alive ? 1 : 0) }),
    };
    this.scene.stop('HUD');
    this.scene.launch('HUD', hudData);
    const kb = this.input.keyboard!;
    kb.once('keydown-ESC', this.escHandler);
    this.events.once('shutdown', () => {
      kb.off('keydown-ESC', this.escHandler);
      this.scene.stop('HUD');
      this.combat.destroy();
      this.fighters = [];
      this.markers.length = 0;
      this.colliders.clear();
      this.spectating = null;
    });
  }

  update(_time: number, delta: number): void {
    const dt = Math.min(delta, 50);
    this.player.readInput();

    // bucket fighters and shots by team (reused arrays, no per-frame allocation)
    const heroes = this.heroes;
    const enemies = this.enemies;
    heroes.length = enemies.length = 0;
    for (const f of this.fighters) (f.team === 'hero' ? heroes : enemies).push(f);
    const heroShots = this.heroShots;
    const enemyShots = this.enemyShots;
    heroShots.length = enemyShots.length = 0;
    for (const s of this.combat.shots) (s.team === 'hero' ? heroShots : enemyShots).push(s);

    const ctx = this.ctx;
    for (const f of this.fighters) {
      if (f instanceof Bot) {
        const hero = f.team === 'hero';
        ctx.foes = hero ? enemies : heroes;
        ctx.shots = hero ? enemyShots : heroShots;
        f.think(dt, ctx);
      }
      f.tick(dt);
      this.checkBlast(f);
    }
    this.combat.update(dt);
    if (!this.ended) this.spawner.update(dt);

    // sweep out KO'd fighters in place (player and boss stay for the HUD)
    let w = 0;
    for (let i = 0; i < this.fighters.length; i++) {
      const f = this.fighters[i];
      if (f.alive || f === this.player || f === this.boss) {
        this.fighters[w++] = f;
        continue;
      }
      this.removeFighter(f);
    }
    this.fighters.length = w;

    for (const { f, m } of this.markers) {
      m.setVisible(f.alive);
      if (f.alive) m.setPosition(f.x, f.y - f.displayHeight / 2 - 14);
    }

    this.ring.setVisible(this.player.alive).setPosition(this.player.x, this.player.body.bottom);

    // spectate an ally if the player is out
    if (!this.player.alive && !this.ended) {
      if (!this.spectating || !this.spectating.alive) {
        this.spectating = null;
        for (const f of this.fighters) {
          if (f.alive && f.team === 'hero') {
            this.spectating = f;
            break;
          }
        }
        if (this.spectating) this.cameras.main.startFollow(this.spectating, true, 0.08, 0.08);
      }
    }

    if (!this.ended) {
      if (!this.boss.alive) this.finish(true);
      else if (this.count('hero') === 0) this.finish(false);
    }
  }

  private count(team: 'hero' | 'enemy', minionsOnly = false): number {
    let n = 0;
    for (const f of this.fighters) if (f.alive && f.team === team && !(minionsOnly && f === this.boss)) n++;
    return n;
  }

  private removeFighter(f: Fighter): void {
    const i = this.markers.findIndex((e) => e.f === f);
    if (i >= 0) {
      this.markers[i].m.destroy();
      this.markers.splice(i, 1);
    }
    this.colliders.get(f)?.destroy();
    this.colliders.delete(f);
    f.destroy();
  }

  private finish(won: boolean): void {
    this.ended = true;
    if (won) {
      // boss down: the remaining minions power off
      for (const f of this.fighters) {
        if (f.team !== 'enemy' || !f.alive) continue;
        f.stocks = 1;
        f.ko();
      }
    }
    this.time.delayedCall(1200, () => this.scene.start('Result', { won, heroId: this.heroDef.id, bossIndex: this.bossIndex }));
  }

  private checkBlast(f: Fighter): void {
    if (!f.alive || this.ended) return;
    const b = this.stage.blast;
    if (f.x > b.left && f.x < b.right && f.y > b.top && f.y < b.bottom) return;
    // burst at the world edge where they left
    this.combat.spark(Phaser.Math.Clamp(f.x, 10, this.stage.width - 10), Phaser.Math.Clamp(f.y, 10, this.stage.height - 10), 24);
    this.combat.ring(Phaser.Math.Clamp(f.x, 10, this.stage.width - 10), Phaser.Math.Clamp(f.y, 10, this.stage.height - 10));
    if (f === this.player) this.cameras.main.shake(180, 0.01);
    this.events.emit('sfx:ko');
    f.ko();
  }

  private addFighter(f: Fighter, markerColor?: string): void {
    f.combat = this.combat;
    this.fighters.push(f);
    this.colliders.set(f, this.physics.add.collider(f, this.platforms, undefined, (a, b) => this.platformCheck(a as Fighter, b as Phaser.GameObjects.Rectangle)));
    if (markerColor) {
      this.markers.push({ f, m: this.add.text(0, 0, '▼', { fontSize: '24px', color: markerColor }).setOrigin(0.5).setDepth(15) });
    }
  }

  /** Soft platforms: only land on them when falling from above and not dropping through. */
  private platformCheck(f: Fighter, p: Phaser.GameObjects.Rectangle): boolean {
    if (p.getData('solid')) return true;
    if (f.dropTimer > 0) return false;
    const top = (p.body as Phaser.Physics.Arcade.StaticBody).top;
    return f.body.velocity.y >= 0 && f.body.prev.y + f.body.height <= top + 8;
  }

  private spawnMinion(x: number): void {
    const bot = new Bot(this, x, -30, this.bossDef.minion, 'enemy', this.bossDef.minionSkill);
    bot.spawn.set(x, -30);
    this.addFighter(bot);
  }

  private buildStage(): void {
    this.platforms = this.physics.add.staticGroup();
    const art = this.stage.art;
    const PIX = 0.49; // same world-pixels-per-source-pixel as the character sprites
    for (const p of this.stage.platforms) {
      const key = art ? `stage_${p.solid ? art.solid : art.soft}` : '';
      const textured = !!key && this.textures.exists(key);
      const r = this.add.rectangle(p.x, p.y, p.w, p.h, p.solid ? 0x334155 : 0x64748b).setDepth(2);
      if (textured) {
        r.setAlpha(0);
        const h = this.textures.get(key).getSourceImage().height * PIX;
        this.add.tileSprite(p.x, p.y - p.h / 2 + h / 2, p.w, h, key).setTileScale(PIX).setDepth(2);
      } else {
        r.setStrokeStyle(2, p.solid ? 0x64748b : 0x94a3b8);
      }
      r.setData('solid', p.solid);
      this.platforms.add(r);
    }
  }

  private drawBackdrop(): void {
    const layers = (this.stage.art?.backdrop ?? []).map((k) => `stage_${k}`).filter((k) => this.textures.exists(k));
    if (layers.length) {
      // stack the layers upward from just under the main platform; dark floor below
      let y = this.stage.ground.top + 20;
      this.add.rectangle(this.stage.width / 2, (y + this.stage.height + 400) / 2, this.stage.width + 400, this.stage.height + 400 - y, 0x0e1224).setDepth(0);
      for (const k of layers) {
        const img = this.add.image(this.stage.width / 2, y, k).setOrigin(0.5, 1).setDepth(0);
        img.setScale(this.stage.width / img.width);
        y -= img.displayHeight;
      }
      return;
    }
    const { width, ground } = this.stage;
    const g = this.add.graphics().setDepth(0);
    g.fillStyle(this.stage.rack);
    const top = ground.top - 620;
    const cols = Math.floor(width / 160);
    for (let i = 0; i < cols; i++) g.fillRect(25 + i * 160, top, 110, 600);
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < 13; j++) {
        const led = this.add.rectangle(41 + i * 160, top + 24 + j * 44, 6, 6, j % 3 === 0 ? 0x22c55e : 0x38bdf8).setDepth(1);
        this.tweens.add({ targets: led, alpha: 0.15, duration: 400 + ((i * 7 + j * 13) % 9) * 120, yoyo: true, repeat: -1 });
      }
    }
  }
}
