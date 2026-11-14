# Kingdom Chaos

A fast, friendly browser board game for 2–4 players. Race your King, Queen, Witch and
Knight across a changing island, grab treasure, and be the first kingdom to bring
**3 treasures** home — or lead when the **12-minute** clock runs out.

Modes: **Play with Friends** (private online rooms), **Practice vs AI**, a 10-step
**guided tutorial**, and **hot-seat** on one device.

> Status: a complete, playable local/self-hosted game. It is **not production-ready** —
> see [Deployment](#deployment) and [Known issues](#known-issues--limitations).

---

## Quick start

Requires **Node.js ≥ 20.19** (Node 22 recommended; `.nvmrc` is included).

```bash
nvm use            # or install Node 22
npm install
npm run dev        # http://localhost:3000  (Next.js + Socket.IO on one port)
```

To play online locally, open the site in two browsers (or a normal and a private
window), create a room in one, and join with the 5-character code in the other. Other
devices on your network can join via `http://<your-ip>:3000`.

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server (hot reload for UI; server restarts on engine/server changes) |
| `npm test` | Vitest: rules engine, cards, AI, tutorial, socket server (73 tests) |
| `npm run test:e2e` | Playwright: menu → practice, tutorial, rules mid-game, two-browser room, phone layout. Set `E2E_PROD=1` to test the production build. |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm run build` then `npm start` | Production build, served by the same custom server (`PORT`, default 3000) |
| `npm run check` | typecheck + lint + unit tests + build |

Playwright needs its browser once: `npx playwright install chromium`.

## Controls

- **Mouse / touch:** tap *Roll the die*, tap a glowing character, then a glowing space.
  If several routes reach the same space you'll be asked to pick one. Then optionally
  tap a card and follow its prompts, and tap *End turn*.
- **Keyboard:** `R` roll, `E` end turn, `Esc` cancel the current selection. All
  highlighted spaces, pieces and cards are focusable with `Tab` and activate with
  `Enter`/`Space`.
- **Rules** (top bar) open anywhere, including mid-match (the server timer keeps
  running). **Settings** cover volume, mute and reduced motion (defaults to your OS
  setting).

## Rules summary

The full rules text lives in one place — `src/engine/rulesText.ts` — and is used by the
in-game Rules panel, tutorial and card tooltips.

- **Goal:** first to bank 3 treasures wins instantly. When the 12-minute timer ends:
  most banked → most treasure currently carried → shared victory.
- **Turn:** roll a d6 → move **one** character up to that many steps (stop early, pick
  your route) → optionally play **one** card → end turn. Card-space draws happen at
  the end of the turn. A 6 gives no extra turn. 30-second turn timer; on timeout the
  game rolls/moves for you but never plays a card.
- **Movement:** no two of your own pieces may end on one space (you can pass them);
  opponents' castles are off limits; ending on an opponent captures it.
- **Treasure:** end on a treasure space to pick it up (max one per character). End in
  your castle to bank it; it respawns at its home space. Captured carriers drop their
  treasure where they fell (the capturer grabs it if free-handed).
- **Capture:** the victim goes home and *recovers* — it can't move on its owner's next
  turn. Nobody is ever eliminated.
- **Abilities:** King draws a card when banking · Queen moves through opponents · Witch
  can jump between the two fixed portals (1 step) · Knight keeps moving after a capture
  (max one capture per move).
- **Defense:** Shield blocks one capture and breaks; the attacker stops on the last free
  space before the target (or stays put). Immunity blocks captures, traps and opponent
  cards such as Swap until its owner's next turn.

### Deck (40 cards, configurable in `src/engine/config.ts`)

Each player starts with one card of each category; hand limit 4. Drawing with a full
hand lets you discard one or decline. The discard pile is reshuffled when the deck runs
out.

| Map (15) | # | Character Power (15) | # | Special Move (10) | # |
| --- | --- | --- | --- | --- | --- |
| Build Bridge | 4 | Speed Boost | 5 | Swap | 2 |
| Break Bridge | 3 | Shield | 3 | Immunity | 2 |
| Block Path | 3 | Attack Boost | 2 | Slow Down | 2 |
| Portal | 3 | Teleport | 3 | Castle Attack | 2 |
| Trap | 2 | Royal Guard | 2 | Repair | 2 |

A character holds at most one power at a time. Map cards that would cut any castle off
from every treasure are rejected, so the board can never be permanently disconnected.

## Architecture

```
src/engine/   Pure, deterministic rules engine — no DOM, network or timers.
              board.ts (data-driven board), config.ts (balance + deck), movement.ts,
              cards.ts, abilities.ts (registry), engine.ts (createGame/applyAction/tick),
              view.ts (per-player redaction), ai.ts, rulesText.ts
src/runner/   GameRunner: engine + turn/match timers + AI scheduling.
              Used by the server AND the browser (practice/hot-seat).
src/server/   Socket.IO rooms (gameServer.ts) and zod-validated protocol.ts
server.ts     Custom Node server: Next.js + Socket.IO + /healthz on one port
src/tutorial/ Scripted tutorial steps (states built with the real engine)
src/app, src/components, src/lib   Next.js App Router UI, SVG board, Framer Motion
tests/        Vitest      e2e/  Playwright      docs/PLAN.md  design decisions
```

- **Server-authoritative online play.** Clients send intents (`roll`, `move` with a
  path, `playCard` with a target, `endTurn`, `resolveDraw`) plus the state version they
  saw. The server re-enumerates legal moves/targets and rejects anything else, stale or
  duplicate actions, out-of-turn actions and malformed payloads. Each client receives a
  redacted view: other hands, the deck order, the discard contents and the RNG state are
  never sent.
- **Determinism.** The RNG state is stored inside the game state, so a seed + action
  log replays exactly (used heavily by tests).
- **AI** receives only its own redacted `PlayerView` (tested), plays with a short delay,
  and also auto-plays seats whose player disconnected or left (shortened turn timer).
- **Rooms:** 5-character codes (no ambiguous letters), 2–4 players, host starts at ≥ 2.
  Reconnecting with the same browser session restores the same seat; the host role
  transfers if the host is gone for 10 s; empty rooms expire after 5 minutes; per-socket
  action rate limiting. Finished matches append a telemetry line to `logs/matches.jsonl`.
- **Local modes** (practice, hot-seat, tutorial) run the same engine in the browser and
  never touch the network.

## Deployment

**Vercel** can host this Next.js app. Import the GitHub repo and use the default Next.js
settings (`npm run build`). Practice, the tutorial, and hot-seat work there, because they
run in the browser. **Play with Friends does not.** Vercel does not keep a Socket.IO
process running, so private rooms have nowhere to live. The hosted site says so instead
of pretending to connect.

Online rooms need a long-running Node process: `npm run build && npm start` on a VM or
container host (Fly.io, Render, Railway, a VPS, Docker…).

The room store is **in memory, in one process**. Before a real public deployment you
would still need:

- persistence/shared state (e.g. Redis + the Socket.IO Redis adapter) and sticky
  sessions to run more than one instance or survive restarts;
- abuse controls beyond the per-socket rate limit: IP limits, room-creation quotas,
  name filtering, monitoring/alerting;
- HTTPS/WSS termination, a restricted CORS origin, and security review.

## Known issues & limitations

- Restarting the server drops all rooms and matches in progress.
- Seat recovery relies on `sessionStorage`: closing the tab (not just reloading) or
  switching browsers forfeits the seat (the AI then plays it).
- Hot-seat hides hands behind a "pass the device" curtain; it can't stop someone from
  peeking. Local modes are not cheat-proof (nothing to cheat against).
- One board, the 15×15 Isle of Embers. The engine supports registering more boards, but no UI
  picks between them yet.
- Accessibility: keyboard play, focus management, labels and reduced motion are
  implemented and checked with automated tests, but not yet with real screen-reader
  users. Board play by keyboard means tabbing through highlighted spaces (no
  arrow-key navigation).
- Sound effects are small synthesized tones (WebAudio); there is no music.
- Match history and tutorial completion are stored only in `localStorage`.
- AI balance is heuristic; simulated 2-player AI games finish in roughly 3–5 minutes at
  a 3-second pace per action, 4-player games in 7–10 minutes.

## Assets & licences

All board art, characters, castles and icons are original SVG drawn in code
(`src/components/art`). UI icons: [Lucide](https://lucide.dev) (ISC). Fonts: Fredoka
and Nunito via Fontsource (SIL Open Font License), bundled locally — no external
requests or API keys.

## Repository notes

The repository started as an empty IntelliJ/Maven skeleton (`pom.xml`, `.mvn`, `.idea`)
with no Java sources. Those files are left untouched so the original IDE setup keeps
working; the game itself is entirely the Node/TypeScript project described above.
