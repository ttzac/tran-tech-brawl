import type Phaser from 'phaser';
import type { Loadout } from '../data/items';
import { hostLocal, joinLocal } from './local';
import { hostRtc, joinRtc } from './rtc';
import { NetHost } from './NetHost';
import { NetClient } from './NetClient';

/** The one online game this tab is part of (if any). It outlives scenes: lobby -> fight -> results -> lobby. */
export let net: NetHost | NetClient | null = null;

let game: Phaser.Game | null = null;

export function bindNetGame(g: Phaser.Game): void {
  game = g;
}

/** `?net=local` uses BroadcastChannel between tabs on this PC (dev); otherwise WebRTC. */
export const transportKind = (): 'rtc' | 'local' => (new URLSearchParams(location.search).get('net') === 'local' ? 'local' : 'rtc');

const NAME_KEY = 'ttb.name';
export function playerName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export async function startHosting(hero: string, loadout: Loadout): Promise<NetHost> {
  leaveNet();
  const session = transportKind() === 'local' ? hostLocal() : await hostRtc();
  const h = new NetHost(session, hero, loadout, playerName() || 'Host');
  net = h;
  return h;
}

/** `token` = the seat token from an earlier connection to this game: rejoin as the same player. */
export async function joinGame(code: string, token = ''): Promise<NetClient> {
  leaveNet();
  const session = transportKind() === 'local' ? await joinLocal(code) : await joinRtc(code);
  const c = new NetClient(session, playerName(), token);
  c.onStart = (match, humanIndex) => goto('Fight', { net: 'client', match, humanIndex });
  c.onBackToLobby = () => goto('Lobby', { mode: 'resume' });
  c.onClosed = (reason, lost) => {
    if (net !== c) return; // we left on purpose: whoever called leaveNet() navigates
    net = null;
    // the connection died on its own: try to get our seat (and fighter) back before giving up
    if (lost && c.token) goto('Lobby', { mode: 'rejoin', code: c.code, token: c.token });
    else goto('Menu', { notice: reason });
  };
  net = c;
  return c;
}

/** Leave (or, for the host, end) the online game. */
export function leaveNet(): void {
  const n = net;
  net = null;
  n?.close();
}

const ROUTED = ['Title', 'Menu', 'Manager', 'Lobby', 'Fight', 'HUD', 'Result', 'Map', 'Loot'];

/** Switch to a scene from outside a scene (network messages): stops whatever menu/fight scenes are running first. */
export function goto(key: string, data?: object): void {
  if (!game) return;
  const sm = game.scene;
  for (const k of ROUTED) if (k !== key && (sm.isActive(k) || sm.isPaused(k) || sm.isSleeping(k))) sm.stop(k);
  sm.start(key, data);
}
