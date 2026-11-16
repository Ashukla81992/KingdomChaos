'use client';

import { DEFAULT_CONFIG, PHYSICAL_ROUNDS, type MatchPace } from '@/engine';

const LABEL: Record<MatchPace, string> = { untimed: 'No limit', clock: 'Timed', rounds: `${PHYSICAL_ROUNDS} rounds` };
const TEXT: Record<MatchPace, string> = {
  untimed: 'Take as long as you like. The match ends only at the Crown Temple.',
  clock: `${DEFAULT_CONFIG.turnDurationMs / 1000} seconds each turn, and the match ends after ${DEFAULT_CONFIG.matchDurationMs / 60000} minutes (a design target, not yet playtested). Most gems wins, then a cut, then shared.`,
  rounds: `No clock. After round ${PHYSICAL_ROUNDS}, most gems wins, then a cut, then shared — the same option as the physical game.`,
};

/** Pick before a match: no limit, the match and turn clocks, or a fixed round limit. */
export function TimerChoice({ value, onChange }: { value: MatchPace; onChange: (p: MatchPace) => void }) {
  return (
    <fieldset>
      <legend className="font-display mb-2 font-semibold">Match length</legend>
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Match length">
        {(Object.keys(LABEL) as MatchPace[]).map((p) => (
          <button key={p} type="button" role="radio" aria-checked={value === p} onClick={() => onChange(p)} className={`btn ${value === p ? 'btn-primary' : 'btn-ghost'}`}>
            {LABEL[p]}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-sm text-[#4a5374]">{TEXT[value]}</p>
    </fieldset>
  );
}
