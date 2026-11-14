'use client';

/** Pick before a match: play with no clock, or with the normal turn and match timers. */
export function TimerChoice({ value, onChange }: { value: boolean; onChange: (on: boolean) => void }) {
  return (
    <fieldset>
      <legend className="font-display mb-2 font-semibold">Timer</legend>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Timer">
        <button type="button" role="radio" aria-checked={!value} onClick={() => onChange(false)} className={`btn ${!value ? 'btn-primary' : 'btn-ghost'}`}>
          No timer
        </button>
        <button type="button" role="radio" aria-checked={value} onClick={() => onChange(true)} className={`btn ${value ? 'btn-primary' : 'btn-ghost'}`}>
          Timed
        </button>
      </div>
      <p className="mt-1.5 text-sm text-[#4a5374]">{value ? '30 seconds each turn, and the match ends after 12 minutes.' : 'Take as long as you like. Nothing ends on the clock.'}</p>
    </fieldset>
  );
}
