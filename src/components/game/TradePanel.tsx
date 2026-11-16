'use client';

import { Handshake, Shield, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  CARD_INFO,
  CHARACTER_INFO,
  GEM_KINDS,
  GEM_NAMES,
  charLabel,
  powerOptions,
  spareGems,
  type CardType,
  type GameAction,
  type GemKind,
  type PlayerView,
  type TradeWant,
} from '@/engine';
import { seatTheme } from '@/lib/seats';
import { GemIcon } from '../art/gems';

interface Props {
  view: PlayerView;
  me: string | null;
  busy?: boolean;
  open: boolean;
  onClose: () => void;
  onSend: (action: GameAction) => void;
  rivalId?: string | null;
}

/** Diplomacy offers, Royal Guard and Witch Alchemy controls. */
export function TradePanel({ view, me, busy, open, onClose, onSend, rivalId }: Props) {
  const [give, setGive] = useState<GemKind | null>(null);
  const [wantMode, setWantMode] = useState<'gem' | 'card'>('gem');
  const [wantGem, setWantGem] = useState<GemKind | null>(null);
  const [wantCard, setWantCard] = useState<CardType | null>(null);
  const [pickedRival, setPickedRival] = useState<string | null>(null);

  const powers = useMemo(() => (me ? powerOptions(view, me) : []), [view, me]);
  const guard = powers.find((p) => p.type === 'royalGuard');
  const alchemy = powers.find((p) => p.type === 'alchemy');
  const trade = powers.find((p) => p.type === 'offerTrade');

  const rivals = view.players.filter((p) => p.id !== me);
  const selectedRival = pickedRival ?? rivalId ?? rivals[0]?.id ?? null;
  const mySpares = trade?.trade?.give ?? (me ? spareGems(view.players.find((p) => p.id === me)!) : []);
  const theirSpares = selectedRival ? spareGems(view.players.find((p) => p.id === selectedRival)!) : [];
  const powerCards = useMemo(() => (Object.keys(CARD_INFO) as CardType[]).filter((t) => CARD_INFO[t].category === 'power' || CARD_INFO[t].category === 'special'), []);

  const mineIncoming = (view.trades ?? []).filter((t) => t.to === me && t.give != null);
  const mineOutgoing = (view.trades ?? []).filter((t) => t.from === me);
  const others = (view.trades ?? []).filter((t) => t.from !== me && t.to !== me);
  const canOffer = !!trade?.usable;

  if (!open) return null;

  const submitOffer = () => {
    if (!selectedRival || !give) return;
    const want: TradeWant | null = wantMode === 'gem' && wantGem ? { kind: 'gem', gem: wantGem } : wantMode === 'card' && wantCard ? { kind: 'card', cardType: wantCard } : null;
    if (!want) return;
    onSend({ type: 'offerTrade', to: selectedRival, give, want });
    onClose();
  };

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 flex max-h-[85dvh] flex-col rounded-t-3xl bg-[#fffaf0] shadow-[0_-8px_30px_rgba(29,36,64,0.25)] sm:inset-auto sm:right-4 sm:bottom-4 sm:max-h-[min(32rem,80dvh)] sm:w-[min(24rem,calc(100vw-2rem))] sm:rounded-3xl"
      role="dialog"
      aria-label="Diplomacy"
      data-trade-panel
    >
      <div className="flex items-center gap-2 border-b border-[#e6dcc6] px-4 py-3">
        <Handshake size={18} className="text-[#6a3fd0]" aria-hidden="true" />
        <h2 className="font-display text-lg font-bold">Diplomacy</h2>
        <button type="button" className="btn btn-ghost ml-auto min-h-11 min-w-11 px-3!" onClick={onClose} data-trade-close>
          Close
        </button>
      </div>
      <div className="scrollbar-thin flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {others.map((t) => {
          const a = view.players.find((p) => p.id === t.from)?.name ?? 'Someone';
          const b = view.players.find((p) => p.id === t.to)?.name ?? 'Someone';
          return (
            <p key={t.id} className="rounded-xl bg-[#f6efdf] px-3 py-2 text-sm font-semibold" data-trade-third={t.id}>
              {a} and {b} are trading
            </p>
          );
        })}

        {mineIncoming.map((t) => (
          <div key={t.id} className="rounded-2xl border border-[#d8cdb4] bg-white p-3" data-trade-incoming={t.id}>
            <p className="text-sm font-bold">
              {view.players.find((p) => p.id === t.from)?.name} offers {t.give ? GEM_NAMES[t.give] : 'a gem'}
              {t.want?.kind === 'gem' ? ` for ${GEM_NAMES[t.want.gem]}` : t.want?.kind === 'card' ? ` for a ${CARD_INFO[t.want.cardType].name}` : ''}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" className="btn btn-green min-h-11 flex-1" disabled={busy} data-trade-accept={t.id} onClick={() => onSend({ type: 'respondTrade', offerId: t.id, accept: true })}>
                Accept
              </button>
              <button type="button" className="btn btn-ghost min-h-11 flex-1" disabled={busy} data-trade-decline={t.id} onClick={() => onSend({ type: 'respondTrade', offerId: t.id, accept: false })}>
                Decline
              </button>
            </div>
          </div>
        ))}

        {mineOutgoing.map((t) => (
          <div key={t.id} className="flex items-center gap-2 rounded-2xl bg-[#eef3ff] px-3 py-2 text-sm" data-trade-outgoing={t.id}>
            <span className="flex-1 font-semibold">Waiting on {view.players.find((p) => p.id === t.to)?.name}</span>
            <button type="button" className="btn btn-ghost min-h-11 text-sm" disabled={busy} data-trade-cancel={t.id} onClick={() => onSend({ type: 'cancelTrade', offerId: t.id })}>
              Cancel
            </button>
          </div>
        ))}

        {canOffer && (
          <div className="space-y-2 rounded-2xl border border-[#ffcf33] bg-[#fffbe8] p-3" data-trade-offer>
            <p className="text-xs font-extrabold tracking-wide text-[#6b4a00] uppercase">Offer a spare gem</p>
            <label className="block text-sm font-semibold">
              Rival
              <select className="mt-1 min-h-11 w-full rounded-xl border border-[#d8cdb4] bg-white px-3" value={selectedRival ?? ''} onChange={(e) => setPickedRival(e.target.value)} data-trade-rival>
                {(trade?.trade?.recipients ?? rivals.map((p) => p.id)).map((id) => {
                  const p = view.players.find((x) => x.id === id)!;
                  return (
                    <option key={id} value={id}>
                      {p.name} ({seatTheme(p.seat).kingdom})
                    </option>
                  );
                })}
              </select>
            </label>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Gem to give">
              {mySpares.map((k) => (
                <button key={k} type="button" className={`btn min-h-11 min-w-11 px-2! ${give === k ? 'btn-primary' : 'btn-ghost'}`} aria-pressed={give === k} data-trade-give={k} onClick={() => setGive(k)}>
                  <GemIcon kind={k} size={18} /> {GEM_NAMES[k]}
                </button>
              ))}
              {!mySpares.length && <p className="text-sm text-[#6b7086]">Bank a duplicate gem to offer a spare.</p>}
            </div>
            <div className="flex gap-2">
              <button type="button" className={`btn min-h-11 flex-1 text-sm ${wantMode === 'gem' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setWantMode('gem')}>
                Want gem
              </button>
              <button type="button" className={`btn min-h-11 flex-1 text-sm ${wantMode === 'card' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setWantMode('card')}>
                Want card
              </button>
            </div>
            {wantMode === 'gem' ? (
              <div className="flex flex-wrap gap-1.5">
                {theirSpares.map((k) => (
                  <button key={k} type="button" className={`btn min-h-11 px-2! text-sm ${wantGem === k ? 'btn-primary' : 'btn-ghost'}`} data-trade-want-gem={k} onClick={() => setWantGem(k)}>
                    <GemIcon kind={k} size={16} /> {GEM_NAMES[k]}
                  </button>
                ))}
                {!theirSpares.length && <p className="text-sm text-[#6b7086]">They have no spare gems right now.</p>}
              </div>
            ) : (
              <select className="min-h-11 w-full rounded-xl border border-[#d8cdb4] bg-white px-3 text-sm" value={wantCard ?? ''} onChange={(e) => setWantCard((e.target.value || null) as CardType | null)} data-trade-want-card>
                <option value="">Choose a card type</option>
                {powerCards.map((t) => (
                  <option key={t} value={t}>
                    {CARD_INFO[t].name}
                  </option>
                ))}
              </select>
            )}
            <button type="button" className="btn btn-green min-h-11 w-full" disabled={busy || !give || (wantMode === 'gem' ? !wantGem : !wantCard)} data-trade-submit onClick={submitOffer}>
              Send offer
            </button>
          </div>
        )}

        {guard && (
          <div className="rounded-2xl bg-white p-3" data-royal-guard>
            <p className="mb-2 flex items-center gap-1.5 text-sm font-extrabold">
              <Shield size={16} aria-hidden="true" /> Royal Guard
            </p>
            {guard.usable ? (
              <div className="flex flex-wrap gap-1.5">
                {(guard.targets ?? []).map((id) => {
                  const c = view.characters[id];
                  return (
                    <button key={id} type="button" className="btn btn-blue min-h-11 text-sm" disabled={busy} data-power="royalGuard" data-guard-target={id} onClick={() => onSend({ type: 'royalGuard', targetId: id })}>
                      Guard {c?.owner === me ? `your ${CHARACTER_INFO[c.kind].name}` : charLabel(view, id)}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-[#6b7086]">{guard.reason}</p>
            )}
          </div>
        )}

        {alchemy && (
          <div className="rounded-2xl bg-white p-3" data-alchemy>
            <p className="mb-2 flex items-center gap-1.5 text-sm font-extrabold">
              <Sparkles size={16} aria-hidden="true" /> Witch Alchemy
            </p>
            {alchemy.usable ? (
              <div className="flex flex-wrap gap-1.5">
                {(alchemy.alchemy ?? []).flatMap((row) =>
                  row.to.map((toKind) => (
                    <button
                      key={`${row.gemId}-${toKind}`}
                      type="button"
                      className="btn btn-green min-h-11 text-sm"
                      disabled={busy}
                      data-power="alchemy"
                      data-alchemy-from={row.from}
                      data-alchemy-to={toKind}
                      onClick={() => onSend({ type: 'alchemy', characterId: row.characterId, gemId: row.gemId, to: toKind })}
                    >
                      {GEM_NAMES[row.from]} → {GEM_NAMES[toKind]}
                    </button>
                  )),
                )}
              </div>
            ) : (
              <p className="text-sm text-[#6b7086]">{alchemy.reason}</p>
            )}
          </div>
        )}

        {!canOffer && !mineIncoming.length && !mineOutgoing.length && !others.length && (
          <p className="text-sm text-[#6b7086]">
            Move your Queen this turn to offer a spare gem, or wait for an incoming offer.
            {GEM_KINDS.length ? '' : ''}
          </p>
        )}
      </div>
    </div>
  );
}
