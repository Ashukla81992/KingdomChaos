'use client';

import { MARKER_STYLES, useSettings } from '@/lib/settings';

/** Pick how landmarks are drawn on the map (Settings and the Legend). */
export function MarkerStylePicker() {
  const { settings, update } = useSettings();
  const current = settings.markers ?? 'minimal';
  return (
    <fieldset data-marker-style-picker>
      <legend className="font-display mb-2 font-semibold">Map markers</legend>
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Map marker style">
        {MARKER_STYLES.map((m) => (
          <button key={m.id} role="radio" aria-checked={current === m.id} onClick={() => update({ markers: m.id })} className={`btn ${current === m.id ? 'btn-primary' : 'btn-ghost'} flex-col text-sm`} data-marker-style={m.id}>
            <span>{m.name}</span>
            <span className="text-[11px] font-normal opacity-80">{m.hint}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}
