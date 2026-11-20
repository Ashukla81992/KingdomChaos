import type { Metadata } from 'next';
import { MenuShell } from '@/components/MenuShell';
import { VOICE_MIN_AGE, VoicePrivacyPoints } from '@/lib/voicePolicy';

export const metadata: Metadata = {
  title: 'Privacy',
  description: 'What Kingdom of Four Gems keeps about you, and how in-game chat and voice work.',
};

export default function PrivacyPage() {
  return (
    <MenuShell title="Privacy">
      <div className="panel space-y-5 p-5 text-[#1d2440]">
        <section className="space-y-2">
          <h3 className="text-lg font-semibold">Your account</h3>
          <p className="text-sm">
            Playing online needs a username and password (or Google sign-in). We keep your username, a scrambled copy of your password, and the online rooms you are playing in. Practice, the tutorial and hot-seat games stay in your own browser.
          </p>
        </section>
        <section className="space-y-2">
          <h3 className="text-lg font-semibold">Text chat</h3>
          <p className="text-sm">Only the players in a room can read its chat. Messages last for that session only: they are deleted when the match ends, and with the room if it closes first.</p>
        </section>
        <section className="space-y-2">
          <h3 className="text-lg font-semibold">Voice chat</h3>
          <p className="text-sm">Voice is optional and only for players aged {VOICE_MIN_AGE} or older.</p>
          <VoicePrivacyPoints />
          <p className="text-sm">
            To connect, the game server passes a short technical message between the players&apos; browsers. It holds no audio and is deleted within a minute. On some strict networks voice may go through a relay server instead, which forwards the audio without recording it.
          </p>
        </section>
        <section className="space-y-2">
          <h3 className="text-lg font-semibold">Reports</h3>
          <p className="text-sm">
            You can report a player from the chat panel. We keep the report (who reported whom, the room, the reason and the time) so complaints can be looked into. A report never includes any audio, because none is recorded.
          </p>
        </section>
      </div>
    </MenuShell>
  );
}
