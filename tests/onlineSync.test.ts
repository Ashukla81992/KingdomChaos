import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hashPassword } from '@/server/auth';
import { applyRoomAction, createRoom, getRoomForAccount, joinRoom, resetSweepThrottle, startRoom } from '@/server/rooms';
import { MemoryStore, setStore } from '@/server/store';
import type { GameAction, GameState, PlayerView } from '@/engine';

let store: MemoryStore;
beforeEach(() => {
  store = new MemoryStore();
  setStore(store);
  resetSweepThrottle();
});
afterEach(() => setStore(null));

async function room() {
  const host = await store.createAccount('SyncHost', hashPassword('password1'));
  const guest = await store.createAccount('SyncGuest', hashPassword('password1'));
  const r = await createRoom({ accountId: host.id, username: host.username, seatCount: 2 });
  await joinRoom({ code: r.code, accountId: guest.id, username: guest.username });
  await startRoom({ code: r.code, accountId: host.id, pace: 'untimed' });
  return { code: r.code, host, guest };
}

/** Edit the stored state (constructed positions), as a saved match would hold them. */
async function edit(code: string, fn: (s: GameState) => void) {
  const raw = (await store.getRoom(code))!;
  fn(raw.state!);
  await store.saveRoom(raw);
}

async function views(code: string, a: string, b: string): Promise<[PlayerView, PlayerView]> {
  const x = await getRoomForAccount(code, a);
  const y = await getRoomForAccount(code, b);
  if (!x.ok || !y.ok || !x.data.view || !y.data.view) throw new Error('no view');
  return [x.data.view, y.data.view];
}

let n = 0;
async function send(code: string, accountId: string, action: GameAction) {
  const v = (await store.getRoom(code))!.version;
  return applyRoomAction({ code, accountId, action, version: v, clientActionId: `c${++n}` });
}

describe('online clients see the same resolved outcomes', () => {
  it('Dragon Fire resolves once on the server; both clients get the same event batch; a retry does not fire twice', async () => {
    const { code, host, guest } = await room();
    let actorPid = '';
    await edit(code, (s) => {
      actorPid = s.turn.playerId;
      const rival = s.players.find((p) => p.id !== actorPid)!.id;
      for (const id of Object.keys(s.hands)) s.hands[id] = [];
      s.characters[`${actorPid}-king`].node = 'c1';
      s.dragon = { state: 'companion', node: 'c1', companion: `${actorPid}-king`, recoverUntilTurn: 0, releasedBy: null };
      s.characters[`${rival}-queen`].node = 'c4';
      s.forcedRolls = [6];
    });
    const actor = actorPid === 'p1' ? host : guest;
    const rival = actorPid === 'p1' ? 'p2' : 'p1';
    const v = (await store.getRoom(code))!.version;
    const first = await applyRoomAction({ code, accountId: actor.id, action: { type: 'dragonFire', targetId: `${rival}-queen` }, version: v, clientActionId: 'fire-1' });
    expect(first.status).toBe(200);
    // The same tap retried (same client action id) returns the stored result; a fresh duplicate is refused.
    const retry = await applyRoomAction({ code, accountId: actor.id, action: { type: 'dragonFire', targetId: `${rival}-queen` }, version: v, clientActionId: 'fire-1' });
    expect(retry).toEqual(first);
    const dup = await applyRoomAction({ code, accountId: actor.id, action: { type: 'dragonFire', targetId: `${rival}-queen` }, version: v, clientActionId: 'fire-2' });
    expect(dup.status).not.toBe(200);
    const [h, g] = await views(code, host.id, guest.id);
    expect(h.lastEvents).toEqual(g.lastEvents);
    expect(h.eventSeq).toBe(g.eventSeq);
    expect(h.lastEvents.filter((e) => e.type === 'dragonFire')).toHaveLength(1);
    expect(h.characters[`${rival}-queen`].node).toBe(g.characters[`${rival}-queen`].node);
  });

  it('protection countdown and the Golem battle survive reconnects and match on both clients', async () => {
    const { code, host, guest } = await room();
    let actorPid = '';
    await edit(code, (s) => {
      actorPid = s.turn.playerId;
      const rival = s.players.find((p) => p.id !== actorPid)!.id;
      for (const id of Object.keys(s.hands)) s.hands[id] = [];
      s.characters[`${rival}-king`].node = 'c6';
      s.characters[`${rival}-king`].shield = true;
      s.characters[`${rival}-king`].wards = { shield: 2 };
      s.characters[`${actorPid}-king`].node = 'd-c2';
      s.forcedRolls = [1, 5];
    });
    const actor = actorPid === 'p1' ? host : guest;
    const rival = actorPid === 'p1' ? 'p2' : 'p1';
    expect((await send(code, actor.id, { type: 'roll' })).status).toBe(200);
    expect((await send(code, actor.id, { type: 'move', characterId: `${actorPid}-king`, path: ['d-c2', 'd-golem'] })).status).toBe(200);
    let [h, g] = await views(code, host.id, guest.id);
    expect(h.characters[`${rival}-king`].wards).toEqual({ shield: 1 });
    expect(g.characters[`${rival}-king`].wards).toEqual({ shield: 1 });
    expect(h.battle).toEqual(g.battle);
    expect(h.battle).toMatchObject({ monster: 'golem', intent: 'light' });
    expect((await send(code, actor.id, { type: 'battle', choice: 'strike' })).status).toBe(200);
    [h, g] = await views(code, host.id, guest.id);
    expect(h.battle).toEqual(g.battle);
    expect(h.battle).toMatchObject({ monsterHp: 2, stamina: 2, intent: 'heavy' });
    expect(h.lastEvents).toEqual(g.lastEvents);
  });
});
