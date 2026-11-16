'use client';

import { Bot, GraduationCap, Play } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { GameScreen } from '@/components/game/GameScreen';
import { TimerChoice } from '@/components/TimerChoice';
import { MenuShell } from '@/components/MenuShell';
import { ROOM_CONFIG } from '@/engine';
import { savedName, savedPace, saveName, savePace } from '@/lib/storage';
import { paceConfig, type MatchPace } from '@/engine';
import { useLocalGame, type LocalSetup } from '@/lib/useLocalGame';

const AI_NAMES = ['Sir Bumble', 'Lady Quill', 'Old Grimsby'];
const YOU = 'you';

export default function PracticePage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [opponents, setOpponents] = useState(1);
  const [timers, setTimers] = useState<MatchPace>('untimed');
  const [setup, setSetup] = useState<LocalSetup | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(savedName() || 'You');
    setTimers(savedPace());
  }, []);
  const viewer = useCallback(() => YOU, []);
  const { view, send, restart } = useLocalGame(setup, viewer);

  if (setup && view) {
    return (
      <GameScreen
        controller={{ view, send, mode: 'practice' }}
        onExit={() => router.push('/')}
        results={{ primary: { label: 'Play again', onClick: restart }, secondary: { label: 'Main menu', onClick: () => router.push('/') } }}
      />
    );
  }

  const start = (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim().slice(0, ROOM_CONFIG.maxNameLength) || 'You';
    saveName(n);
    savePace(timers);
    setSetup({
      mode: 'practice',
      players: [{ id: YOU, name: n }, ...AI_NAMES.slice(0, opponents).map((a, i) => ({ id: `ai${i + 1}`, name: a, isAI: true }))],
      config: paceConfig(timers),
    });
  };

  return (
    <MenuShell title="Practice vs AI">
      <form onSubmit={start} className="panel space-y-5 p-5">
        <label className="block">
          <span className="font-display mb-1 block font-semibold">Your name</span>
          <input className="field" value={name} maxLength={ROOM_CONFIG.maxNameLength} onChange={(e) => setName(e.target.value)} autoComplete="nickname" />
        </label>
        <fieldset>
          <legend className="font-display mb-2 font-semibold">AI opponents</legend>
          <div className="grid grid-cols-3 gap-2" role="radiogroup">
            {[1, 2, 3].map((n) => (
              <button type="button" key={n} role="radio" aria-checked={opponents === n} onClick={() => setOpponents(n)} className={`btn ${opponents === n ? 'btn-primary' : 'btn-ghost'}`}>
                <Bot size={18} aria-hidden="true" /> {n}
              </button>
            ))}
          </div>
        </fieldset>
        <TimerChoice value={timers} onChange={setTimers} />
        <button className="btn btn-blue w-full text-lg" type="submit">
          <Play size={20} aria-hidden="true" /> Start practice
        </button>
        <Link href="/tutorial" className="btn btn-green w-full">
          <GraduationCap size={20} aria-hidden="true" /> Play the guided tutorial first
        </Link>
        <p className="text-sm text-[#4a5374]">Practice runs entirely in your browser with the same rules engine as online play. The AI only sees its own cards.</p>
      </form>
    </MenuShell>
  );
}
