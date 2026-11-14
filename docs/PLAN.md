# Kingdom Chaos — Implementation Plan

The repository started as an empty IntelliJ/Maven skeleton (no Java sources), so the
project uses the recommended TypeScript stack.

## Architecture

```
src/engine/    Pure, deterministic rules engine (no DOM, no network, no timers)
  config.ts      Central balance values + deck composition
  board.ts       Data-driven 15×15 board ("Isle of Embers")
  rulesText.ts   Single source of truth for rule/card/ability text
  abilities.ts   Character ability registry (hooks consumed by movement engine)
  cards.ts       Card definitions: targets, validation, effects
  movement.ts    Path enumeration + move simulation (capture, shield, traps...)
  engine.ts      createGame / applyAction / handleTimeouts / scoring
  view.ts        Redacted per-player views (hidden hands)
  ai.ts          Practice AI (operates only on a player's redacted view)
src/runner/    GameRunner: wraps the engine with timers and AI scheduling.
               Used by the server (multiplayer) and the browser (practice / hot-seat).
src/server/    Socket.IO room store, protocol validation, reconnection, host transfer
server.ts      Custom Node server: Next.js + Socket.IO on one HTTP port
src/app, src/components, src/lib   Next.js UI (SVG board, Framer Motion)
tests/         Vitest unit tests (engine, cards, AI, rooms)
e2e/           Playwright end-to-end tests
```

## Order of work

1. Data models, board, config, deterministic engine.
2. Vitest suite covering rules and the edge cases in the brief.
3. Practice mode UI + AI.
4. Socket.IO rooms, authoritative server, reconnection.
5. Tutorial (scripted states on the same engine) + rules panel.
6. Visual polish, responsiveness, accessibility.
7. Playwright E2E, lint, build, README.

## Key decisions (ambiguities resolved)

- Card-space draws (and the King's bonus draw) are queued and resolved when the turn ends,
  after the optional card play, matching the turn order in the brief.
- Match timer expiry ends the game immediately, even mid-turn.
- Practice, hot-seat and tutorial run the same engine inside the browser (nobody to
  cheat against). Online rooms are fully server-authoritative.
- Movement paths are simple paths (no revisiting a space in one move).
- A capturer that is not carrying treasure picks up the dropped treasure immediately,
  even if a Knight then continues moving.
- Attack Boost cannot target a Knight (it already has the ability; no stacking).
- Map cards (Block Path, Break Bridge) are rejected if any castle would lose every
  route to every treasure spawn.
- The tutorial runs scripted states (`src/tutorial/steps.ts`) on the real engine with
  timers disabled and forced dice rolls; every step is completed in a unit test.
- Hot-seat shows a "pass the device" curtain between turns; the turn timer keeps running.
