// Throwaway balance model. Run:  node tools/balance/sim.mts   (Node 22.6+/24 strips the types)
//  Part 1: Monte Carlo of the real launch maths (Knockback.ts), gravity 1400, blast zones, a simple
//          recover-AI -> hits needed to KO each fighter with each move.
//  Part 2: abstract (non spatial) 5v5 fight: attack timers + hit probabilities + the KO table -> win rate and duration.
// The behaviour constants (HIT_P, UPTIME...) are guesses; tune them if playtests disagree.
import { launch } from '../../src/systems/Knockback.ts';
import { heroes } from '../../src/data/heroes.ts';
import { bosses } from '../../src/data/bosses.ts';
import { stages } from '../../src/data/stages.ts';
import type { FighterDef, MoveDef } from '../../src/data/types.ts';

const G = 1400, DT = 1 / 60;
const BODY_H: Record<string, number> = { zac: 66, chain: 63, altwave: 92, muskbot: 104, chatbot: 38, neurobot: 38 };
const rnd = Math.random;
const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)];

// ---------------- part 1: single launch -> KO? -----------------
function koAfterHit(stageId: string, v: FighterDef, move: MoveDef, dmgAfter: number): boolean {
  const st = stages[stageId], g = st.ground, b = st.blast;
  const span = g.right - g.left;
  const x0 = g.left + span * (0.15 + 0.7 * rnd());
  let x = x0;
  let y = g.top - pick([0, 0, 140, 285]); // bottom of body; standing on ground or a platform
  const dir = rnd() < 0.5 ? 1 : -1;
  const l = launch(dmgAfter, move, v.weight, dir as 1 | -1);
  let vx = Math.max(-1100, Math.min(1100, l.vx)), vy = Math.max(-1300, Math.min(1300, l.vy));
  let stun = l.stun / 1000, jumps = v.jumps, jcd = 0;
  const h = BODY_H[v.id] ?? 44;
  for (let t = 0; t < 8; t += DT) {
    stun -= DT; jcd -= DT;
    vy = Math.min(1300, vy + G * DT);
    const onGround = vy >= 0 && y >= g.top && y - vy * DT <= g.top + 4 && x > g.left && x < g.right;
    if (onGround) { y = g.top; vy = 0; if (stun > 0) vx *= 0.9; jumps = v.jumps; }
    const grounded = onGround;
    if (stun <= 0) {
      const out = x < g.left - 20 || x > g.right + 20 || y > g.top + 40;
      let want = 0;
      if (out) {
        const below = y > g.top + 10 && x > g.left && x < g.right;
        want = below ? (x < (g.left + g.right) / 2 ? -1 : 1) : x < (g.left + g.right) / 2 ? 1 : -1;
        if (vy > 0 && jumps > 0 && jcd <= 0) { vy = -v.jumpVelocity * 0.92; jumps--; jcd = 0.38; }
      } else if (grounded) return false; // landed and in control
      vx += (want * v.speed - vx) * (grounded ? 0.3 : 0.12);
    }
    x += vx * DT; y += vy * DT;
    if (x < b.left || x > b.right || y - h / 2 > b.bottom || y < b.top) return true;
  }
  return false;
}
function koProb(stageId: string, v: FighterDef, move: MoveDef, dmg: number, n: number): number {
  let k = 0;
  for (let i = 0; i < n; i++) if (koAfterHit(stageId, v, move, dmg)) k++;
  return k / n;
}
/** table[d/10] = P(KO | hit lands bringing the victim to d%). */
function koTable(stageId: string, v: FighterDef, m: MoveDef): number[] {
  const t: number[] = [];
  for (let d = 0; d <= 500; d += 10) t.push(koProb(stageId, v, m, d, 250));
  return t;
}
const tableP = (t: number[], d: number) => t[Math.min(t.length - 1, Math.floor(d / 10))];
function hitsToKO(t: number[], dmgPer: number): number {
  let d = 0, n = 0;
  while (n < 400) { n++; d += dmgPer; if (rnd() < tableP(t, d)) return n; }
  return n;
}
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;

// ---------------- part 2: abstract fight -----------------
const HIT_P = 0.35; // chance a swing/shot actually connects when the bot attempts it
const UPTIME = 0.4; // fraction of time a bot is in position to attack (not walking, stunned, recovering)
const REACT_EXTRA = 0.15; // s of bot decision latency between swings
interface Fgt { def: FighterDef; team: 0 | 1; boss: boolean; dmg: number; stocks: number; atkT: number; spT: number; invuln: number; stunT: number; alive: boolean; reaction: number }
const tables = new Map<string, number[]>();

function runFight(bi: number, heroIdx: number, allyCount = 4) {
  const bd = bosses[bi];
  const mk = (def: FighterDef, team: 0 | 1, boss: boolean, reaction: number): Fgt => ({ def, team, boss, dmg: 0, stocks: def.stocks, atkT: rnd(), spT: 1 + rnd() * 2, invuln: 0, stunT: 0, alive: true, reaction });
  const hero = heroes[heroIdx];
  const team: Fgt[] = [mk(hero, 0, false, 0.18)];
  const pool = heroes.filter((h) => h !== hero);
  for (let i = 0; i < allyCount; i++) team.push(mk(pool[i % pool.length], 0, false, 0.2));
  const boss = mk(bd.fighter, 1, true, bd.skill.reactionMs / 1000);
  const fs: Fgt[] = [...team, boss];
  let t = 0, waveT = bd.waves.firstDelay / 1000, bossPat = bd.pattern.every / 1000, mHits = 0;
  const tbl = (a: FighterDef, v: FighterDef, sp: boolean, mv: MoveDef) => {
    const k = `${a.id}>${v.id}>${sp ? 's' : 'm'}`;
    let x = tables.get(k);
    if (!x) { x = koTable(bd.stageId, v, mv); tables.set(k, x); }
    return x;
  };
  const strike = (a: Fgt, v: Fgt, sp: boolean) => {
    if (!v.alive || v.invuln > 0) return;
    const mv = sp ? a.def.special : a.def.melee;
    v.dmg += mv.damage;
    v.stunT = 0.3;
    if (a.boss && v.team === 0) mHits++;
    if (rnd() < tableP(tbl(a.def, v.def, sp, mv), v.dmg)) {
      v.stocks--; v.dmg = 0;
      if (v.stocks <= 0) v.alive = false; else v.invuln = 2;
    }
  };
  for (; t < 600; t += 0.05) {
    waveT -= 0.05;
    if (waveT <= 0) {
      waveT = bd.waves.interval / 1000;
      const alive = fs.filter((f) => f.team === 1 && !f.boss && f.alive).length;
      const n = Math.min(bd.waves.count, bd.waves.max - alive);
      for (let i = 0; i < n; i++) fs.push(mk(bd.minion, 1, false, bd.minionSkill.reactionMs / 1000));
    }
    bossPat -= 0.05;
    let patternOn = false;
    if (bossPat <= 0) { patternOn = true; if (bossPat < -bd.pattern.duration / 1000) bossPat = bd.pattern.every / 1000; }
    for (const f of fs) {
      if (!f.alive) continue;
      f.invuln = Math.max(0, f.invuln - 0.05); f.stunT = Math.max(0, f.stunT - 0.05);
      f.atkT -= 0.05; f.spT -= 0.05;
      if (f.stunT > 0) continue;
      const foes = fs.filter((o) => o.team !== f.team && o.alive);
      if (!foes.length) continue;
      const bossFoe = foes.find((o) => o.boss);
      const tgt = f.team === 0 ? (bossFoe && (foes.length === 1 || rnd() < 0.6) ? bossFoe : pick(foes)) : pick(foes);
      const lim = f.boss ? 0.85 : UPTIME;
      if (f.atkT <= 0) {
        f.atkT = Math.max(f.def.melee.cooldown / 1000, f.reaction + REACT_EXTRA) / lim;
        const rangeBonus = Math.min(1.3, 0.75 + (f.def.melee.range * f.def.scale) / 120);
        if (rnd() < HIT_P * (tgt.boss ? 1.1 : 1) * (f.boss ? 1.4 : 1) * rangeBonus) strike(f, tgt, false);
      }
      if (f.spT <= 0 && !f.boss) {
        f.spT = f.def.special.cooldown / 1000 / 0.5;
        if (rnd() < HIT_P * 0.55) strike(f, tgt, true);
      }
      if (f.boss && patternOn && f.spT <= 0) {
        f.spT = f.def.special.cooldown / 1000;
        const tg = pick(foes);
        if (bd.pattern.kind === 'barrage') { if (rnd() < 0.45) strike(f, tg, true); }
        else if (rnd() < 0.5) strike(f, tg, false);
      } else if (f.boss && f.spT <= 0) {
        f.spT = f.def.special.cooldown / 1000 / 0.45;
        if (rnd() < HIT_P * 0.4) strike(f, tgt, true);
      }
    }
    if (!boss.alive) return { win: true, t, mHits, hs: team.reduce((a, f) => a + f.stocks, 0), bossLeft: 0 };
    if (!team.some((f) => f.alive)) return { win: false, t, mHits, hs: 0, bossLeft: boss.stocks };
  }
  return { win: false, t, mHits, hs: team.reduce((a, f) => a + f.stocks, 0), bossLeft: boss.stocks };
}

// ---------------- report -----------------
const FIGHT_ONLY = process.argv.includes("fight");
if (!FIGHT_ONLY) console.log("=== hits to KO from 0% (mean [p10..p90]); * = special ===");
for (const b of FIGHT_ONLY ? [] : bosses) {
  console.log(`\n-- stage ${b.stageId}`);
  const fighters = [...heroes, b.fighter, b.minion];
  for (const v of fighters) {
    const row: string[] = [];
    for (const a of fighters) {
      if (a === v) continue;
      const aHero = heroes.includes(a), vHero = heroes.includes(v);
      if (aHero === vHero) continue; // only hero <-> enemy matchups
      if (!(a === b.fighter || v === b.fighter) && false) continue;
      for (const sp of [false, true]) {
        const mv = sp ? a.special : a.melee;
        const t = koTable(b.stageId, v, mv);
        tables.set(`${a.id}>${v.id}>${sp ? 's' : 'm'}`, t);
        const hs: number[] = [];
        for (let i = 0; i < 400; i++) hs.push(hitsToKO(t, mv.damage));
        hs.sort((x, y) => x - y);
        row.push(`${a.id}${sp ? '*' : ''}:${mean(hs).toFixed(0)}[${hs[40]}..${hs[360]}]`);
      }
    }
    console.log(`${v.id.padEnd(9)} w=${v.weight} <- ${row.join('  ')}`);
  }
}
console.log('\n=== abstract 5v5 fight (200 runs each) ===');
for (let bi = 0; bi < bosses.length; bi++) {
  for (let hi = 0; hi < heroes.length; hi++) {
    let w = 0, hs = 0, bl = 0, mh = 0;
    const ts: number[] = [];
    const N = 200;
    for (let i = 0; i < N; i++) {
      const r = runFight(bi, hi);
      if (r.win) { w++; ts.push(r.t); hs += r.hs; } else bl += r.bossLeft;
      mh += r.mHits;
    }
    ts.sort((a, b) => a - b);
    const q = (p: number) => (ts.length ? ts[Math.floor(ts.length * p)].toFixed(0) : '-');
    console.log(`${bosses[bi].id.padEnd(8)} hero=${heroes[hi].id.padEnd(9)} win ${((100 * w) / N).toFixed(0)}%  win-time med ${q(0.5)}s [${q(0.1)}..${q(0.9)}]  hero stocks left on win ${w ? (hs / w).toFixed(1) : '-'}/15  boss stocks left on loss ${N - w ? (bl / (N - w)).toFixed(1) : '-'}  boss hits landed/fight ${(mh / N).toFixed(0)}`);
  }
}
