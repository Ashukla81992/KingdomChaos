'use client';

import { BookOpen, Bot, GraduationCap, Monitor, Settings, Users } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { HeroCast, Logo } from '@/components/MenuShell';
import { RulesPanel } from '@/components/RulesPanel';
import { SettingsPanel } from '@/components/SettingsPanel';
import { QUICK_GOAL } from '@/engine';
import { tutorialDone } from '@/lib/storage';

export default function MainMenu() {
  const [rules, setRules] = useState(false);
  const [settings, setSettings] = useState(false);
  const [firstTime, setFirstTime] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFirstTime(!tutorialDone());
  }, []);

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-3xl flex-col items-center justify-center px-4 py-10">
      <Logo />
      <p className="font-display mt-2 text-center text-lg text-[#2c3558] sm:text-xl">{QUICK_GOAL}</p>
      <div className="mt-4">
        <HeroCast />
      </div>
      <nav className="mt-6 grid w-full max-w-md gap-3" aria-label="Main menu">
        <Link href="/online" className="btn btn-primary text-xl">
          <Users size={24} aria-hidden="true" /> Play Online
        </Link>
        <Link href="/hotseat" className="btn btn-blue text-xl">
          <Monitor size={24} aria-hidden="true" /> Play on This Device
        </Link>
        <Link href="/practice" className="btn btn-green text-xl">
          <Bot size={24} aria-hidden="true" /> Practice vs AI
        </Link>
        <Link href="/tutorial" className="btn btn-ghost relative text-xl">
          <GraduationCap size={24} aria-hidden="true" /> Learn to Play
          {firstTime && <span className="absolute -top-2 -right-2 rounded-full bg-[#e0532d] px-2 py-0.5 text-xs font-bold text-white shadow">New here? Start here!</span>}
        </Link>
        <div className="grid grid-cols-2 gap-3">
          <button className="btn btn-ghost" onClick={() => setRules(true)}>
            <BookOpen size={20} aria-hidden="true" /> Rules
          </button>
          <button className="btn btn-ghost" onClick={() => setSettings(true)}>
            <Settings size={20} aria-hidden="true" /> Settings
          </button>
        </div>
      </nav>
      <p className="mt-8 max-w-md text-center text-sm text-[#4a5374]">2–4 players · online accounts optional for same-device play</p>
      <RulesPanel open={rules} onClose={() => setRules(false)} />
      <SettingsPanel open={settings} onClose={() => setSettings(false)} />
    </main>
  );
}
