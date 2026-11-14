import { Bot, GraduationCap } from 'lucide-react';
import Link from 'next/link';

/** Shown on the Vercel deploy, where private rooms have no server to connect to. */
export function RealtimeNotice() {
  return (
    <div className="panel space-y-4 p-5">
      <p>
        Private rooms need the Kingdom Chaos game server, which stays running and holds a live connection for each player. Vercel runs the site as short-lived pages, so it cannot host those rooms.
      </p>
      <p>Practice, the tutorial, and hot-seat run entirely in your browser. They work on this site.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Link href="/practice" className="btn btn-blue">
          <Bot size={18} aria-hidden="true" /> Practice vs AI
        </Link>
        <Link href="/tutorial" className="btn btn-green">
          <GraduationCap size={18} aria-hidden="true" /> Learn to Play
        </Link>
      </div>
    </div>
  );
}
