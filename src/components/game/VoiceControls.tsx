'use client';

import { Flag, Headphones, Mic, MicOff, PhoneOff, Volume2, VolumeX } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { PlayerView } from '@/engine';
import { seatTheme } from '@/lib/seats';
import { voiceSupported, type VoiceApi } from '@/lib/voice';
import { REPORT_REASONS } from '@/server/protocol';
import { VOICE_MIN_AGE, VoicePrivacyPoints } from '@/lib/voicePolicy';
import { Modal } from '../ui/Modal';

const CONSENT_KEY = 'kc:voiceConsent:v1';

function hasConsent() {
  try {
    return window.localStorage.getItem(CONSENT_KEY) === String(VOICE_MIN_AGE);
  } catch {
    return false;
  }
}

function saveConsent() {
  try {
    window.localStorage.setItem(CONSENT_KEY, String(VOICE_MIN_AGE));
  } catch {
    // Private mode: they'll be asked again next time.
  }
}

export interface TablePlayer {
  playerId: string;
  username: string;
  seat?: number;
}

function ConsentModal({ open, onClose, onAgree }: { open: boolean; onClose: () => void; onAgree: () => void }) {
  const [adult, setAdult] = useState(false);
  // A portal, so the dialog covers the screen even though the chat panel it opens from has its own layer.
  if (typeof document === 'undefined') return null;
  return createPortal(
    <Modal open={open} onClose={onClose} title="Before you join voice">
      <div className="space-y-3" data-voice-consent>
        <VoicePrivacyPoints />
        <label className="flex items-start gap-2 rounded-xl bg-[#fff1b8] p-2.5 text-sm font-semibold">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#f4a81d]" checked={adult} onChange={(e) => setAdult(e.target.checked)} data-voice-age />
          I am {VOICE_MIN_AGE} or older.
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="btn btn-primary"
            disabled={!adult}
            onClick={() => {
              saveConsent();
              onAgree();
            }}
            data-voice-agree
          >
            <Headphones size={18} aria-hidden="true" /> Join voice
          </button>
          <button className="btn btn-ghost" onClick={onClose}>
            Not now
          </button>
          <Link href="/privacy" target="_blank" className="ml-auto text-sm font-semibold text-[#2f5fb3] underline">
            Privacy
          </Link>
        </div>
      </div>
    </Modal>,
    document.body,
  );
}

/** Join/leave voice and the microphone switch. */
export function VoiceBar({ voice }: { voice: VoiceApi }) {
  const [asking, setAsking] = useState(false);
  if (!voiceSupported()) return null;
  const start = () => (hasConsent() ? void voice.join() : setAsking(true));
  const connected = voice.peers.filter((p) => p.state === 'connected').length;
  return (
    <div className="rounded-2xl bg-white/80 p-2" data-voice-bar={voice.joined ? 'joined' : 'off'}>
      {!voice.joined ? (
        <div className="flex items-center gap-2">
          <button className="btn btn-blue px-3! py-1.5! text-sm" onClick={start} disabled={voice.joining} data-voice-join>
            <Headphones size={16} aria-hidden="true" /> {voice.joining ? 'Joining…' : 'Join voice'}
          </button>
          <span className="text-xs text-[#4a5374]">Live only, never recorded. Your mic stays off until you turn it on.</span>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <MicButton voice={voice} />
          <span className="flex-1 text-xs text-[#4a5374]" role="status">
            {connected ? `Talking with ${connected} player${connected === 1 ? '' : 's'}` : 'In voice. Waiting for others to join…'}
          </span>
          <button className="btn btn-ghost px-2.5! py-1! text-sm" onClick={voice.leave} data-voice-leave>
            <PhoneOff size={16} aria-hidden="true" /> Leave
          </button>
        </div>
      )}
      {voice.micError && (
        <p role="alert" className="mt-1 text-xs font-semibold text-[#8c2a10]">
          {voice.micError}
        </p>
      )}
      <ConsentModal
        open={asking}
        onClose={() => setAsking(false)}
        onAgree={() => {
          setAsking(false);
          void voice.join();
        }}
      />
    </div>
  );
}

export function MicButton({ voice, compact }: { voice: VoiceApi; compact?: boolean }) {
  return (
    <button
      className={`btn ${voice.micOn ? 'btn-green' : 'btn-ghost'} ${compact ? 'icon-btn' : 'px-3! py-1.5! text-sm'}`}
      onClick={() => void voice.toggleMic()}
      aria-pressed={voice.micOn}
      aria-label={voice.micOn ? 'Turn your microphone off' : 'Turn your microphone on'}
      title={voice.micOn ? 'Mic on' : 'Mic off'}
      data-voice-mic={voice.micOn ? 'on' : 'off'}
    >
      {voice.micOn ? <Mic size={compact ? 18 : 16} aria-hidden="true" /> : <MicOff size={compact ? 18 : 16} aria-hidden="true" />}
      {!compact && (voice.micOn ? 'Mic on' : 'Mic off')}
    </button>
  );
}

/** Everyone else at the table: who is in voice or talking, mute, and report. */
export function TablePeople({ players, voice, report }: { players: TablePlayer[]; voice?: VoiceApi; report?: (playerId: string, reason: string) => Promise<{ ok: boolean; error?: string }> }) {
  const [reporting, setReporting] = useState<string | null>(null);
  const [reason, setReason] = useState<string>(REPORT_REASONS[0]);
  const [reported, setReported] = useState<Record<string, string>>({});
  if (!players.length) return null;
  return (
    <ul className="space-y-1" aria-label="Players at the table" data-table-people>
      {players.map((p) => {
        const peer = voice?.peers.find((x) => x.playerId === p.playerId);
        const theme = p.seat !== undefined ? seatTheme(p.seat) : null;
        const isMuted = !!voice?.muted[p.playerId];
        return (
          <li key={p.playerId} className="rounded-xl bg-white/70 px-2 py-1" data-person={p.playerId}>
            <div className="flex items-center gap-2 text-sm">
              <span
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${peer?.speaking ? 'ring-4 ring-[#2fd17a]/50' : ''}`}
                style={{ background: theme?.color ?? '#8a8370' }}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 truncate font-semibold">{p.username}</span>
              <span className="text-xs text-[#4a5374]" data-peer-state={peer?.state ?? 'none'}>
                {peer ? (peer.state === 'connected' ? (peer.speaking ? 'talking' : 'in voice') : peer.state === 'connecting' ? 'connecting…' : "couldn't connect") : ''}
              </span>
              {peer && voice && (
                <button
                  className="btn btn-ghost icon-btn"
                  onClick={() => voice.setMuted(p.playerId, !isMuted)}
                  aria-pressed={isMuted}
                  aria-label={isMuted ? `Unmute ${p.username}` : `Mute ${p.username}`}
                  title={isMuted ? 'Unmute' : 'Mute'}
                  data-voice-mute={p.playerId}
                >
                  {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                </button>
              )}
              {report && !reported[p.playerId] && (
                <button
                  className="btn btn-ghost icon-btn"
                  onClick={() => setReporting(reporting === p.playerId ? null : p.playerId)}
                  aria-label={`Report ${p.username}`}
                  title="Report"
                  data-report-open={p.playerId}
                >
                  <Flag size={15} />
                </button>
              )}
            </div>
            {reported[p.playerId] && <p className="pb-1 text-xs text-[#4a5374]">{reported[p.playerId]}</p>}
            {report && reporting === p.playerId && (
              <form
                className="flex flex-wrap items-center gap-1.5 pb-1"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const r = await report(p.playerId, reason);
                  setReporting(null);
                  if (r.ok) {
                    voice?.setMuted(p.playerId, true);
                    setReported((cur) => ({ ...cur, [p.playerId]: `Reported. ${voice ? 'We muted them for you.' : ''}`.trim() }));
                  } else setReported((cur) => ({ ...cur, [p.playerId]: r.error ?? 'Could not send the report.' }));
                }}
              >
                <select className="min-w-0 flex-1 rounded-lg border border-[#e3d6b6] bg-white px-2 py-1 text-xs" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason">
                  {REPORT_REASONS.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
                <button type="submit" className="btn btn-danger px-2.5! py-1! text-xs" data-report-send>
                  Report
                </button>
              </form>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function seatsFor(view: Pick<PlayerView, 'players'> | null, players: TablePlayer[]): TablePlayer[] {
  return players.map((p) => ({ ...p, seat: p.seat ?? view?.players.find((x) => x.id === p.playerId)?.seat }));
}
