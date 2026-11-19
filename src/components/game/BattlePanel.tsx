'use client';

import { useRef } from 'react';
import { BATTLE_DAMAGE, charLabel, intentText, odds, type GameAction, type PlayerView } from '@/engine';
import { GolemArt, type CreatureState } from '../art/monsters';

interface Props {
  view: PlayerView;
  me: string | null;
  busy: boolean;
  reduced: boolean;
  onChoose: (action: GameAction) => Promise<unknown> | void;
}

function Marks({ n, max, color, label }: { n: number; max: number; color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1" aria-label={`${label}: ${n} of ${max}`} data-marks={label}>
      <span className="text-[10px] font-bold tracking-wide text-[#4a5374] uppercase">{label}</span>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className="inline-block h-3 w-3 rounded-sm border border-white shadow" style={{ background: i < n ? color : '#5b4a3a' }} />
      ))}
    </span>
  );
}

/** [Prototype] The Stone Golem battle: shown to everyone; only the fighting kingdom can choose. */
export function BattlePanel({ view, me, busy, reduced, onChoose }: Props) {
  const b = view.battle;
  const sending = useRef(false);
  if (!b) return null;
  const mine = b.playerId === me;
  const ch = view.characters[b.characterId];
  const last = [...view.lastEvents].reverse().find((e) => e.type === 'battleExchange' && e.battleId === b.id);
  const ex = last && last.type === 'battleExchange' ? last : null;
  const pose: CreatureState = ex && ex.taken > 0 ? 'attack' : b.intent === 'heavy' ? 'alert' : 'idle';
  const need = Math.max(1, view.config.encounterThreshold - (ch?.kind === 'knight' ? view.config.knightBonus : 0));
  const choose = (choice: 'strike' | 'guard' | 'retreat') => {
    if (sending.current || busy) return;
    sending.current = true;
    void Promise.resolve(onChoose({ type: 'battle', choice })).finally(() => {
      sending.current = false;
    });
  };
  const result = ex
    ? `${ex.choice === 'strike' ? (ex.hit ? `Strike hit for ${ex.damage} (rolled ${ex.roll}${ex.total !== ex.roll ? `, ${ex.total} with the Knight` : ''})` : `Strike deflected (rolled ${ex.roll})`) : 'Guard up'}. ${ex.monsterAttack ? (ex.blocked ? `Its ${ex.monsterAttack === 'heavy' ? 'heavy slam' : 'swipe'} was blocked${ex.exposed ? ': it staggers, exposed' : ''}.` : `Its ${ex.monsterAttack === 'heavy' ? 'heavy slam' : 'swipe'} hit for ${ex.taken}.`) : ''}`
    : 'The Golem blocks the way. Choose your first move.';
  return (
    <div className="mt-2.5 rounded-2xl border-2 border-[#8a5a2b] bg-[#fbf3e6] p-2.5" role="region" aria-label="Stone Golem battle" data-battle={b.id} data-battle-intent={b.intent}>
      <div className="flex items-start gap-2">
        <svg width={76} height={76} viewBox="-42 -42 84 84" className="shrink-0" aria-hidden>
          <GolemArt state={pose} size={80} reduced={reduced} />
        </svg>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-bold text-[#5b3d20]">
            Prototype battle · Stone Golem vs {ch ? charLabel(view, ch.id) : 'a piece'} · exchange {b.exchange + 1}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
            <Marks n={b.monsterHp} max={view.config.battleMonsterHp ?? 3} color="#d63a4a" label="Golem" />
            <Marks n={b.stamina} max={view.config.battleStamina ?? 3} color="#2e9e62" label="Stamina" />
          </div>
          <div className={`mt-1.5 inline-block rounded-full px-2 py-0.5 text-xs font-extrabold ${b.intent === 'heavy' ? 'bg-[#c8281e] text-white' : 'bg-[#ffe7b3] text-[#5b3d20]'}`} data-intent-text>
            {intentText('golem', b.intent)}
          </div>
          {b.exposed && <div className="mt-1 text-xs font-bold text-[#155c36]">Exposed: your next hit deals 2.</div>}
          <p className="mt-1 text-xs text-[#4a5374]" aria-live="polite">
            {result}
          </p>
        </div>
      </div>
      {mine ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button className="btn btn-danger min-h-11 text-sm" disabled={busy} onClick={() => choose('strike')} data-battle-choice="strike" title={`Roll ${need}+ (${odds(view.config.dieSides, need)}) to deal ${b.exposed ? 2 : 1}. Then it ${b.intent === 'heavy' ? 'slams' : 'swipes'} for ${BATTLE_DAMAGE[b.intent]} if still standing.`}>
            ⚔ Strike ({odds(view.config.dieSides, need)})
          </button>
          <button className="btn btn-blue min-h-11 text-sm" disabled={busy} onClick={() => choose('guard')} data-battle-choice="guard" title={b.intent === 'heavy' ? 'Block the heavy slam and expose it: your next hit deals 2.' : 'Block the swipe.'}>
            🛡 Guard{b.intent === 'heavy' ? ' + counter' : ''}
          </button>
          <button className="btn btn-ghost min-h-11 text-sm" disabled={busy} onClick={() => choose('retreat')} data-battle-choice="retreat" title="Go back to the Dungeon Entrance. No reward.">
            Retreat
          </button>
        </div>
      ) : (
        <p className="mt-1.5 text-xs font-semibold text-[#4a5374]">Waiting for {view.players.find((p) => p.id === b.playerId)?.name ?? 'the fighter'} to choose.</p>
      )}
    </div>
  );
}
