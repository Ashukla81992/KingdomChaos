/** Voice chat is only for adults: India's DPDP Act needs a parent's consent for anyone under 18. */
export const VOICE_MIN_AGE = 18;

/** What players agree to before voice starts. Also shown on the privacy page. */
export function VoicePrivacyPoints() {
  return (
    <ul className="list-disc space-y-1.5 pl-5 text-sm">
      <li>Voice goes straight between the players&apos; devices. It is never recorded or stored, and it ends when the match ends.</li>
      <li>Players connected by voice can see each other&apos;s IP address, which can show roughly where you are.</li>
      <li>Your microphone stays off until you turn it on. You can mute anyone, and report a player who is abusive.</li>
    </ul>
  );
}

