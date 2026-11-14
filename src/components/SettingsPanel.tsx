'use client';

import { Volume2, VolumeX } from 'lucide-react';
import { useSettings } from '@/lib/settings';
import { Modal } from './ui/Modal';

export function SettingsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { settings, update, play } = useSettings();
  return (
    <Modal open={open} onClose={onClose} title="Settings">
      <div className="space-y-5">
        <fieldset>
          <legend className="font-display mb-2 font-semibold">Sound</legend>
          <div className="flex items-center gap-3">
            <button
              className="btn btn-ghost icon-btn"
              onClick={() => update({ muted: !settings.muted })}
              aria-pressed={settings.muted}
              aria-label={settings.muted ? 'Unmute sound' : 'Mute sound'}
            >
              {settings.muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>
            <label className="flex flex-1 items-center gap-3">
              <span className="text-sm font-semibold">Volume</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={settings.volume}
                onChange={(e) => update({ volume: Number(e.target.value) })}
                onPointerUp={() => play('card')}
                className="flex-1 accent-[#f4a81d]"
                aria-valuetext={`${Math.round(settings.volume * 100)}%`}
              />
              <span className="w-10 text-right text-sm tabular-nums">{Math.round(settings.volume * 100)}%</span>
            </label>
          </div>
        </fieldset>
        <fieldset>
          <legend className="font-display mb-2 font-semibold">Motion</legend>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Animation level">
            {(
              [
                ['system', 'Match system'],
                ['full', 'Full'],
                ['reduced', 'Reduced'],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                role="radio"
                aria-checked={settings.motion === v}
                onClick={() => update({ motion: v })}
                className={`btn ${settings.motion === v ? 'btn-primary' : 'btn-ghost'} text-sm`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-sm text-[#4a5374]">Reduced motion removes piece walking, die tumbling and pulsing highlights.</p>
        </fieldset>
      </div>
    </Modal>
  );
}
