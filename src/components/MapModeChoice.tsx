'use client';

import { DEFAULT_MAP_MODE, MAP_MODES, type MapMode } from '@/lib/mapMode';
import { useSettings } from '@/lib/settings';

const THUMB: Record<MapMode, string> = { simple: '/board/thumb-simple.jpg', complex: '/board/thumb-complex.jpg' };

/**
 * Pick the map painting before a match (also in Settings, and switchable mid-game from the board).
 * Only the look changes: the spaces, roads and rules are the same, so each player picks for their own screen.
 */
export function MapModeChoice({ compact = false }: { compact?: boolean }) {
  const { settings, update } = useSettings();
  const current = settings.mapMode ?? DEFAULT_MAP_MODE;
  return (
    <fieldset data-map-mode-choice>
      <legend className="font-display mb-2 font-semibold">Map style</legend>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Map style">
        {MAP_MODES.map((m) => {
          const on = current === m.id;
          return (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => update({ mapMode: m.id })}
              className={`btn ${on ? "btn-primary" : "btn-ghost"} flex-col gap-1! rounded-2xl! p-2! text-sm`}
              data-map-mode={m.id}
            >
              {!compact && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={THUMB[m.id]} alt="" width={180} height={149} className={`aspect-[180/149] w-full rounded-xl object-cover ${on ? '' : 'opacity-80'}`} />
              )}
              <span>
                {m.name}
                {m.id === DEFAULT_MAP_MODE && <span className="font-normal opacity-80"> (recommended)</span>}
              </span>
              <span className="text-[11px] font-normal opacity-80">{m.hint}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-sm text-[#4a5374]">Same board and rules either way. You can switch any time during a match from the map.</p>
    </fieldset>
  );
}
