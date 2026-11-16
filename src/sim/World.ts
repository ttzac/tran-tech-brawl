import type { BossDef, BotSkill, FighterDef, GameMode, MoveDef, StageDef } from '../data/types';
import { Fighter } from '../entities/Fighter';
import { Bot, type ThinkCtx } from '../entities/Bot';
import { BossBrain } from '../ai/BossBrain';
import { Combat, type Shot } from '../systems/Combat';
import { Spawner } from '../systems/Spawner';
import { POWERS, POWER_IDS, isTimed, type PowerId } from '../data/powerups';
import { Rng } from './rng';
import { Body, TICK_MS, ledgesOf, platformsOf, stepBody, type Ledge, type Platform } from './kinematics';
import type { SimEvent } from './events';

/** Everything needed to start the same match anywhere (local, network host, test). */
export interface MatchConfig {
  stage: StageDef;
  /** boss mode: the boss. dungeon: the room's captain or boss. brawl: a stand-in whose `fighter` is the rival captain. */
  boss: BossDef;
  /** human-controlled heroes (loadouts already applied); the first one spawns in the middle of the hero group */
  humans: FighterDef[];
  /** AI heroes that fill out the team (loadouts already applied) */
  allies: FighterDef[];
  seed: number;
  /** 'boss' (default): co-op vs a boss. 'brawl': hero team vs a rival team, last team standing. 'dungeon': one room of a crawl, clear it by beating the captain. */
  mode?: GameMode;
  /** crates fall from the sky (default: on in brawl and dungeon, off in boss mode so online matches stay in sync) */
  items?: boolean;
  /** brawl: the rival team's fighters (the first is the captain = `boss`) */
  rivals?: FighterDef[];
  /** dungeon: extra guardians that start beside the captain */
  lieutenants?: FighterDef[];
  /** bot types the waves are drawn from (default: just boss.minion). Not replicated: network matches must leave it out. */
  minions?: FighterDef[];
  /** horde rooms: the captain waits off-stage until this many enemies have been KO'd */
  reserve?: number;
  /** ms between crate drops (default: 15 s, or the brawl ramp) */
  crateEvery?: number;
  /** ultimate meter (0-100) the humans start with */
  startUlt?: number;
}

const ALLY_SKILL: BotSkill = { reactionMs: 200, specialChance: 0.3, dodgeChance: 0.25 };
const RIVAL_SKILL: BotSkill = { reactionMs: 190, specialChance: 0.35, dodgeChance: 0.3 };

/** Ground-pound shockwave: launches grounded foes near the boss; jump to dodge it. */
const SHOCK: MoveDef = { name: 'Shockwave', damage: 9, knockback: 360, scaling: 10, cooldown: 0, angle: 72 };
const SHOCK_RADIUS = 280;
const ULT_MOVE: MoveDef = { name: 'Ultimate', damage: 20, knockback: 520, scaling: 13, cooldown: 0, angle: 50 };
const ULT_RADIUS = 300;
const FREEZE_RADIUS = 520;
const MAX_CRATES = 3;

/** A falling / resting power-up crate. */
export interface Crate {
  id: number;
  power: PowerId;
  body: Body;
  /** ms since it dropped */
  age: number;
}
const CRATE_SIZE = 30;
const CRATE_LIFE = 20000;

/** The whole fight as plain data + logic: fighters, AI, combat, waves, crates, KOs, win/lose. No Phaser.
 *  Advance it with step(TICK_MS); FightScene drains `events` after each step and draws the state. */
export class World {
  readonly rng: Rng;
  readonly stage: StageDef;
  readonly mode: GameMode;
  readonly platforms: Platform[];
  readonly ledges: Ledge[];
  readonly combat: Combat;
  readonly spawner: Spawner;
  readonly fighters: Fighter[] = [];
  /** human-controlled fighters, in config order (they stay in `fighters` after their last stock, for the HUD) */
  readonly humans: Fighter[] = [];
  readonly boss: Bot;
  readonly events: SimEvent[] = [];
  readonly crates: Crate[] = [];
  tick = 0;
  result: 'won' | 'lost' | null = null;
  /** enemies knocked out for good so far */
  enemyKos = 0;
  /** horde rooms: enemy KOs still needed before the captain arrives (0 = it is in the fight) */
  reserveLeft = 0;
  /** network client: this World only predicts the local player's own fighter, so moves have no hitboxes / shots here */
  predicting = false;
  /** drop events (network client re-simulating old inputs) */
  muted = false;

  private idSeq = 1;
  private crateSeq = 1;
  private crateTimer = 4500;
  private readonly items: boolean;
  // per-tick scratch (reused, never reallocated)
  private heroes: Fighter[] = [];
  private enemies: Fighter[] = [];
  private heroShots: Shot[] = [];
  private enemyShots: Shot[] = [];
  private ctx: ThinkCtx;

  constructor(private cfg: MatchConfig) {
    this.rng = new Rng(cfg.seed);
    this.stage = cfg.stage;
    this.mode = cfg.mode ?? 'boss';
    this.items = cfg.items ?? this.mode !== 'boss';
    this.platforms = platformsOf(cfg.stage);
    this.ledges = ledgesOf(this.platforms);
    this.combat = new Combat(this);
    this.ctx = { foes: [], stage: cfg.stage, shots: [] };

    const [heroSpawn, bossSpawn] = cfg.stage.spawns;
    const team = [...cfg.humans, ...cfg.allies];
    team.forEach((def, i) => {
      // first fighter in the middle, the rest alternate left/right of them
      const k = i - 1;
      const x = i === 0 ? heroSpawn.x : heroSpawn.x + (k % 2 ? 1 : -1) * (80 + Math.floor(k / 2) * 90);
      // humans are Bots with the AI switched off, so the AI can take over a player who drops out (setAutopilot)
      const human = i < cfg.humans.length;
      const f = new Bot(this, x, heroSpawn.y, def, 'hero', ALLY_SKILL, undefined, human);
      if (human) {
        f.ult = Math.max(0, Math.min(100, cfg.startUlt ?? 0));
        this.humans.push(f);
      }
      this.add(f);
    });
    if (this.mode === 'brawl') {
      // rival team: the captain is `boss` (no boss brain, plain fighter AI); the rest line up beside it
      const rivals = cfg.rivals && cfg.rivals.length ? cfg.rivals : [cfg.boss.fighter];
      this.boss = new Bot(this, bossSpawn.x, bossSpawn.y, rivals[0], 'enemy', RIVAL_SKILL);
      this.add(this.boss);
      rivals.slice(1).forEach((def, k) => {
        this.add(new Bot(this, bossSpawn.x + (k % 2 ? 1 : -1) * (80 + Math.floor(k / 2) * 90), bossSpawn.y, def, 'enemy', RIVAL_SKILL));
      });
    } else {
      this.boss = new Bot(this, bossSpawn.x, bossSpawn.y, cfg.boss.fighter, 'enemy', cfg.boss.skill, new BossBrain(cfg.boss.pattern));
      this.reserveLeft = Math.max(0, cfg.reserve ?? 0);
      if (this.reserveLeft === 0) this.add(this.boss);
      (cfg.lieutenants ?? []).forEach((def, k) => {
        this.add(new Bot(this, bossSpawn.x + (k % 2 ? 1 : -1) * (90 + Math.floor(k / 2) * 90), bossSpawn.y, def, 'enemy', cfg.boss.skill));
      });
    }

    const g = cfg.stage.ground;
    const waves = this.mode === 'brawl' ? { firstDelay: 1e12, interval: 1e12, count: 0, max: 0 } : cfg.boss.waves;
    this.spawner = new Spawner(waves, (x) => this.spawnMinion(x), () => this.count('enemy', true), [g.left + 60, g.right - 60], this.rng);
  }

  newId(): number {
    return this.idSeq++;
  }

  emit(e: SimEvent): void {
    if (this.muted) return;
    this.events.push(e);
  }

  /** Alive fighters on a team (minionsOnly: not counting the boss). */
  count(team: 'hero' | 'enemy', minionsOnly = false): number {
    let n = 0;
    for (const f of this.fighters) if (f.alive && f.team === team && !(minionsOnly && f === this.boss)) n++;
    return n;
  }

  /** One fixed simulation tick. Fill human intents before calling. */
  step(dt = TICK_MS): void {
    this.tick++;
    const fighters = this.fighters;

    // physics: move everyone, land on platforms
    for (const f of fighters) {
      if (!f.alive) continue;
      f.prevX = f.x;
      f.prevY = f.y;
      f.body.dropThrough = f.dropTimer > 0;
      stepBody(f.body, dt, this.platforms);
    }
    this.combat.move(dt);

    // bucket fighters and shots by team (reused arrays, no per-tick allocation)
    const heroes = this.heroes;
    const enemies = this.enemies;
    heroes.length = enemies.length = 0;
    for (const f of fighters) (f.team === 'hero' ? heroes : enemies).push(f);
    const heroShots = this.heroShots;
    const enemyShots = this.enemyShots;
    heroShots.length = enemyShots.length = 0;
    for (const s of this.combat.shots) (s.team === 'hero' ? heroShots : enemyShots).push(s);

    const ctx = this.ctx;
    for (const f of fighters) {
      if (f instanceof Bot && !f.manual) {
        const hero = f.team === 'hero';
        ctx.foes = hero ? enemies : heroes;
        ctx.shots = hero ? enemyShots : heroShots;
        f.think(dt, ctx);
      }
      f.tick(dt);
      this.checkBlast(f);
    }
    this.combat.update(dt);
    if (!this.result) this.spawner.update(dt);
    if (this.items) this.updateCrates(dt);

    // sweep out KO'd fighters in place (humans and boss stay for the HUD)
    let w = 0;
    for (let i = 0; i < fighters.length; i++) {
      const f = fighters[i];
      if (f.alive || f === this.boss || this.humans.includes(f)) {
        fighters[w++] = f;
        continue;
      }
      if (f.team === 'enemy') this.enemyKos++;
      this.emit({ k: 'despawn', f });
    }
    fighters.length = w;

    // horde room: enough of the pack is down, the leader drops in
    if (this.reserveLeft > 0 && !this.result) {
      this.reserveLeft = Math.max(0, (this.cfg.reserve ?? 0) - this.enemyKos);
      if (this.reserveLeft === 0) {
        this.boss.setPosition((this.stage.ground.left + this.stage.ground.right) / 2, -40);
        this.add(this.boss);
        this.emit({ k: 'arrive', f: this.boss });
      }
    }

    if (!this.result) {
      if (this.mode === 'brawl') {
        if (this.count('enemy') === 0) this.finish(true);
        else if (this.count('hero') === 0) this.finish(false);
      } else if (!this.boss.alive) this.finish(true);
      else if (this.count('hero') === 0) this.finish(false);
    }
  }

  /** Network client: advance one fighter by one tick on its own (same order as step(): move, then act). Used to predict
   *  the local player's fighter between the host's snapshots. */
  predictStep(f: Fighter, dt = TICK_MS): void {
    if (!f.alive) return;
    f.prevX = f.x;
    f.prevY = f.y;
    f.body.dropThrough = f.dropTimer > 0;
    stepBody(f.body, dt, this.platforms);
    f.tick(dt);
  }

  // ---- boss helpers ----------------------------------------------------------------------------

  /** Hero ultimate blast: every foe within ULT_RADIUS of the hero is hit hard. */
  ultimateBlast(from: Fighter): void {
    if (this.predicting) return; // the host's blast arrives as an event
    this.emit({ k: 'ultimate', f: from, phase: 'burst' });
    for (const t of this.fighters) {
      if (!t.alive || t.team === from.team) continue;
      const dx = t.x - from.x;
      const dy = t.y - from.y;
      if (dx * dx + dy * dy < (ULT_RADIUS + t.body.halfWidth) ** 2) t.takeHit(ULT_MOVE, from.x, from, from.meleeDamageMul);
    }
  }

  /** Ground-pound: every grounded foe near the boss's feet is launched. Jumping over it is the counterplay. */
  shockwave(from: Fighter): void {
    const x = from.x;
    const y = from.body.bottom;
    this.emit({ k: 'shock', x, y, r: SHOCK_RADIUS });
    for (const t of this.fighters) {
      if (!t.alive || t.team === from.team) continue;
      if (t.grounded && Math.abs(t.x - x) < SHOCK_RADIUS + t.body.halfWidth && Math.abs(t.body.bottom - y) < 90) t.takeHit(SHOCK, x, from);
    }
  }

  /** Boss calls reinforcements beside it (capped so it cannot flood the stage). */
  summon(from: Fighter, n: number): void {
    const b = this.cfg.boss;
    const cap = b.waves.max + 2;
    this.emit({ k: 'summon', f: from });
    for (let k = 0; k < n && this.count('enemy', true) < cap; k++) {
      const side = k % 2 ? 1 : -1;
      this.add(new Bot(this, from.x + side * (70 + k * 40), from.y - 80, this.minionDef(), 'enemy', b.minionSkill));
    }
  }

  // ---- crates and power-ups --------------------------------------------------------------------

  /** Drop a crate. `x` defaults to a random spot over the main stage; `power` to a weighted random pick. */
  dropCrate(x?: number, power?: PowerId): Crate {
    const g = this.stage.ground;
    const cx = Math.min(g.right - 30, Math.max(g.left + 30, x ?? g.left + 40 + this.rng.next() * (g.right - g.left - 80)));
    const id = power ?? this.pickPower();
    const body = new Body(CRATE_SIZE, CRATE_SIZE);
    body.x = body.prevX = cx - CRATE_SIZE / 2;
    body.y = body.prevY = -60;
    const crate: Crate = { id: this.crateSeq++, power: id, body, age: 0 };
    this.crates.push(crate);
    this.emit({ k: 'crate', x: cx, y: -60, power: id });
    return crate;
  }

  private pickPower(): PowerId {
    let total = 0;
    for (const id of POWER_IDS) total += POWERS[id].weight;
    let r = this.rng.next() * total;
    for (const id of POWER_IDS) {
      r -= POWERS[id].weight;
      if (r < 0) return id;
    }
    return POWER_IDS[0];
  }

  /** Closest crate that has landed (for bots that fancy a power-up). */
  nearestCrate(x: number, y: number): Crate | null {
    let best: Crate | null = null;
    let bd = Infinity;
    for (const c of this.crates) {
      const d = Math.hypot(c.body.centerX - x, c.body.centerY - y);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return best;
  }

  private updateCrates(dt: number): void {
    // brawl gets crazier the longer it goes: crates every 11 s early on, every 5 s after a couple of minutes
    const elapsed = (this.tick * TICK_MS) / 1000;
    const interval = this.cfg.crateEvery ?? (this.mode === 'brawl' ? Math.max(5000, 11000 - elapsed * 45) : 15000);
    this.crateTimer -= dt;
    if (this.crateTimer <= 0 && !this.result) {
      this.crateTimer = interval;
      if (this.crates.length < MAX_CRATES) this.dropCrate();
    }
    for (let n = this.crates.length - 1; n >= 0; n--) {
      const c = this.crates[n];
      c.age += dt;
      stepBody(c.body, dt, this.platforms);
      let taken = false;
      for (const f of this.fighters) {
        if (!f.alive || f.hanging || (f instanceof Bot && f.isBoss)) continue;
        const b = f.body;
        if (c.body.right > b.left && c.body.left < b.right && c.body.bottom > b.top && c.body.top < b.bottom) {
          this.collect(f, c.power);
          taken = true;
          break;
        }
      }
      if (taken || c.age > CRATE_LIFE || c.body.y > this.stage.height + 200) {
        this.crates[n] = this.crates[this.crates.length - 1];
        this.crates.pop();
      }
    }
  }

  private collect(f: Fighter, id: PowerId): void {
    const def = POWERS[id];
    f.score += 50;
    if (isTimed(id)) f.givePower(id);
    else if (id === 'patch') f.damage = Math.max(0, f.damage - 50);
    else if (id === 'ticket') f.stocks = Math.min(f.def.stocks + 1, f.stocks + 1);
    else if (id === 'reboot') {
      this.emit({ k: 'freeze', x: f.x, y: f.y, r: FREEZE_RADIUS });
      for (const t of this.fighters) {
        if (!t.alive || t.team === f.team) continue;
        if (Math.hypot(t.x - f.x, t.y - f.y) < FREEZE_RADIUS) {
          t.hitstun = Math.max(t.hitstun, t === this.boss ? 700 : 1800);
          t.body.vx = 0;
          if (t.body.vy < 0) t.body.vy = 0;
        }
      }
    }
    this.emit({ k: 'pickup', f, power: def.id });
  }

  // ---- network client / spawning ---------------------------------------------------------------

  /** Network client: mirror a minion the host spawned, keeping the host's id. */
  addMinionWithId(id: number, x: number, y: number): Fighter {
    this.idSeq = id;
    const b = this.cfg.boss;
    const bot = new Bot(this, x, y, b.minion, 'enemy', b.minionSkill);
    this.add(bot);
    return bot;
  }

  /** Network client: drop a fighter the host no longer has. */
  removeFighter(f: Fighter): void {
    const i = this.fighters.indexOf(f);
    if (i < 0) return;
    this.fighters.splice(i, 1);
    this.emit({ k: 'despawn', f });
  }

  private add(f: Fighter): void {
    this.fighters.push(f);
    this.emit({ k: 'spawn', f });
  }

  /** Hand a human's fighter to the AI (they dropped out or went quiet) or give it back. */
  setAutopilot(human: number, on: boolean): void {
    const f = this.humans[human];
    if (f instanceof Bot) f.manual = !on;
  }

  /** Which bot type the next minion is (one type unless the room mixes factions). */
  private minionDef(): FighterDef {
    const pool = this.cfg.minions;
    return pool && pool.length > 1 ? pool[this.rng.int(0, pool.length - 1)] : pool?.[0] ?? this.cfg.boss.minion;
  }

  private spawnMinion(x: number): void {
    const b = this.cfg.boss;
    const bot = new Bot(this, x, -30, this.minionDef(), 'enemy', b.minionSkill);
    this.add(bot);
  }

  private finish(won: boolean): void {
    this.result = won ? 'won' : 'lost';
    if (won && this.mode !== 'brawl') {
      // boss down: the remaining minions power off
      for (const f of this.fighters) {
        if (f.team !== 'enemy' || !f.alive) continue;
        f.stocks = 1;
        f.ko();
      }
    }
    this.emit({ k: 'end', won });
  }

  private checkBlast(f: Fighter): void {
    if (!f.alive || this.result) return;
    const b = this.stage.blast;
    if (f.x > b.left && f.x < b.right && f.y > b.top && f.y < b.bottom) return;
    // burst at the world edge where they left
    const x = Math.min(Math.max(f.x, 10), this.stage.width - 10);
    const y = Math.min(Math.max(f.y, 10), this.stage.height - 10);
    // kill credit: whoever hit them last (within 6 s), as long as they are still on the other team
    const killer = f.lastHitBy && f.lastHitBy.team !== f.team ? f.lastHitBy : null;
    if (killer) {
      killer.kos++;
      killer.streak++;
      killer.score += 100 * killer.streak;
      if (killer.streak >= 2) this.emit({ k: 'streak', f: killer, n: killer.streak });
    }
    this.emit({ k: 'blast', f, x, y, killer });
    const out = f.ko();
    // enemies sometimes drop a crate when they go down (loot in dungeons, chaos in brawls)
    if (out && this.items && f.team === 'enemy' && f !== this.boss && this.rng.next() < 0.22 && this.crates.length < MAX_CRATES) this.dropCrate(f.x);
  }
}
