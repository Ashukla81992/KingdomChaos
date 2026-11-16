# Kingdom Chaos: Crown Quest

A Ludo-inspired browser board game for 2–4 players. Each house — **Red, Blue, Purple, Green** —
moves a King, Queen, Witch and Knight around a painted island on two-way roads and side routes.

**To win:**

1. Bank four different gems (Ruby, Sapphire, Emerald, Diamond) at your house gate.
2. Make at least one cut.
3. Complete a **lap** with one character: touch all four house plates (one at each gate), in any
   order, by passing or landing.
4. Walk that character up your own Royal Path and land exactly on the Crown Temple.

Every player has the same goal, but can choose different routes and tactics to reach it.

Modes: **Play with Friends** (private online rooms), **Practice vs AI**, an 11-step
interactive **tutorial**, and **hot-seat** on one device.

> Status: playable locally or self-hosted. It is **not production-ready**. The 15-minute match
> length is a **design target that has not been validated** — see [Match length](#match-length).

---

## Quick start

Requires **Node.js ≥ 20.19** (Node 22 recommended; `.nvmrc` is included). No API keys or paid
services are needed.

```bash
nvm use            # or install Node 22
npm install
npm run dev        # http://localhost:3000  (Next.js + Socket.IO on one port)
```

To play online locally, open the site in two browsers (or a normal and a private window),
create a room in one, and join with the 5-character code in the other.

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm test` | Vitest, 149 tests: board and routes, turns and extra turns, movement and cuts, gems/plates/temple, special spaces, digging and every card, dragon, move preview, tutorial script, Socket.IO server |
| `npm run test:e2e` | Playwright on port 3210, 21 tests (desktop and phone). `E2E_PROD=1` tests the production build (run `npm run build` first). |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm run build` then `npm start` | Production build, served by the same custom server (`PORT`, default 3000) |
| `npm run check` | typecheck + lint + unit tests + build |
| `npm run sim -- --games 200 --players 4 [--carry 1]` | AI-vs-AI simulator (developer telemetry: turns, laps, cuts, gems, dungeon, cards). `--carry` overrides the carry limit. |

Playwright needs its browser once: `npx playwright install chromium`. The e2e server cannot
start while a dev server holds the `.next` lock; stop `npm run dev` first or use `E2E_PROD=1`.

## How a turn works

Turns go **clockwise**. Each turn has **one move** and **one optional adventure action**, in
either order. The action panel always shows the next step ("YOUR TURN — Roll the die",
"You rolled 4 — choose a piece", "Move your Witch to Mountain Road?", "Adventure action (optional)").

1. **Roll** the single die (tap it or press `R`).
2. Pieces that can use the roll get a dashed gold ring. **Tap one** (on the board or in the
   piece list). Several pieces on one space get a **×N badge** that opens a picker.
3. Every legal **end space glows**. The **whole roll is compulsory** on the island (after the
   dragon penalty), and a move may not step on the same space twice. Roads run both ways and
   branch, so usually several ends glow. With only one possible end, the preview opens straight away.
4. **Tap a glowing space to preview.** The route is drawn in your colour. A summary lists what will
   happen: gem pickups, banking, plates touched, cuts, an extra turn, the route's perk and risk
   ("Trap risk" without revealing the outcome), traps and shortcuts, the Royal Path, a win.
   Tapping an illegal space explains why: wrong distance, blocked by an opponent or the dragon,
   a shielded piece, your own piece, a locked Royal Path, an opponent's castle or path.
5. **Confirm** with "Move here", by tapping the space again, by dragging the piece onto it, or
   with `M`. The server re-validates the route.
6. Use an **adventure action** if one is offered (play a card, dig, enter or leave the dungeon,
   fight the monster, tame, Dragon Fire, sail, fly), or press **End turn**.

If no piece can use the whole roll, the game names the reason for each piece and skips the move.

**Extra turns:** a natural 6, or a move that cuts an opponent (including the Knight's pass-through
cut), earns **one** extra turn. A 6 and a cut together still earn one. Chains are allowed. A cut
blocked by a Shield or Immune earns nothing. The current turn finishes first (adventure, End turn).

**Rules & Guide panel:** on desktop a panel on the right shows player progress (gems, cut, plates
per piece, what is still needed), the selected piece (ability, location, carried gems, plate
checklist), the current turn, searchable expandable rules and recent events. On phones it opens
from the **Rules & Guide** button as a drawer. Opening it never pauses a multiplayer match.

**Keyboard:** `R` roll · `Tab` to a piece or glowing space · `Enter` select / preview / confirm ·
`M` move here · `E` end turn · `Esc` cancel · `+` / `-` / `0` zoom. Announcements use a live
region. **Reduced motion** (system setting or in-game toggle) turns off piece animation.

## Rules summary

The full rules live in `src/engine/rulesText.ts`. The in-game Rules panel (which never pauses
the clock), the tutorial and card faces all read from it.

- **Board:** a 40-space two-way ring through all four plates. It crosses Dragon Mountain in one
  tunnel step (the painted tunnel between the north road and the Crystal Mine), and cards cannot
  close the main road. Inner routes: Temple Roads, Lakeside Roads, Camp and Glade Roads, River
  Crossings (the Stone Bridge starts open, the Rope Bridge starts broken), East Ruins Roads and
  Sapphire Falls Roads. Closed until a card or a dig: the Rope Bridge, the Camp Road, the Ruins
  Road and the Crystal Mine Tunnel. Each route lists a perk and a risk in the legend and preview.
  Each house has a castle, a gate with its public **house plate**
  (where pieces enter and gems are banked), a fork just after the gate, and a 5-space Royal Path
  to the central temple. Every house can always reach every plate, even with every bridge closed.
  Safe spaces (gold stars, gates, castles, Royal Paths, dungeon safe rooms) can hold several pieces,
  and nobody is cut there.
- **Leaving home:** any roll moves a piece out. The first step lands on its gate.
- **Passing:** you cannot pass an opponent on an unsafe space. The **Queen** passes freely; the
  **Knight** cuts the first unprotected opponent he passes and keeps going. A wild or guarding
  dragon blocks the road.
- **Cuts:** end a move on an opponent on an unsafe space. It goes home, its plates reset (its house
  keeps banked gems and its cut), and the
  attacker takes its gems while the attacker's hands are free; the rest drop on the space. You cannot land on a **Shield**ed
  or **Immune** piece — the preview refuses it.
- **Gems:** four stations (Ruby Mine, Sapphire Falls, Diamond Hill, Emerald Grove) never run
  out. A piece with free hands picks up a gem its house still needs when **passing or landing**.
  A piece carries up to **two gems** (`carryLimit` in `src/engine/config.ts`; set it to 1 for the
  original one-at-a-time rule), and passing or landing on your own gate banks them all. The
  dungeon's Crystal Shrine offers any gem you still need.
- **Laps (house plates):** each piece tracks which of the four plates it has touched, in any
  order, by passing or landing ("Queen: Red ✓ · Blue ✓ · Green ○ · Purple ○"). Teleports, swaps,
  portals, boats, planes and shortcuts do not count plates on the way, but a plate you arrive on
  counts. A trap keeps plates unless it sends the piece home; being cut or sent home resets them.
- **Royal Path:** opens for a piece once your house has four gems banked and one cut and that
  piece has touched all four plates; it turns in at your fork. Royal Paths stay hidden until
  unlocked. **Exact landing** on the temple wins.
- **Traps and shortcuts** fire only when a move ends on them:
  - Landslide (space 5) sweeps the piece to Willow Valley (space 37). Hidden Pit (space 17) drops it under Dragon Mountain (space 4). River Current (space 25) carries it to the west beach (space 29).
  - Magic Lift (space 13) carries it down the east coast (space 18). Secret Passage (space 33) leads north along the west coast (space 38).
  - The East Moonstone Arch (space 14) and the West Moonstone Arch (space 34) are a pair.
- **Hazards:** Trap risk on the Bramble Snare, the Spray Snare and the Crag Snare (orange triangles). Landing there with a
  hidden roll of 1–2 drops the piece on the nearest main-road space; gems and plates are kept.
- **Routes change for everyone:** map cards build or break bridges, open tunnels and roads, or
  block passes. A change that would strand a piece or cut a house off from a plate is refused.
- **Digging** draws from a 17-tile discovery deck: 3 route finds (open the nearest closed route,
  or a map card if none is closed), 4 gems, 6 cards, 2 keys and 2 buried traps (step back a few
  spaces; plates kept). A gem the piece cannot use is reburied.
- **Dragon:** guarding, wild, companion or recovering.
  - **Tame:** roll 5–6 while on its space.
  - **With a companion**, a piece moves max(1, roll − 2), shown as "Roll 5 − Dragon 2 = Move 3".
  - **Dragon Fire** sends an opponent within 3 spaces home. It is not a cut.
  - **Dragon Slayer** is Queen-only: roll 4–6.
  - **Release** is free, at the start of your turn.
- **Dungeon** (optional):
  - Enter from the Dragon Gate on the east coast (space 16) as an adventure action.
  - Moves there may stop early.
  - Rooms: a monster guarding the Vault Door, a vault dig site, the Crystal Shrine, the dragon's
    lair and a Spike Pit trap.
  - Pieces underground are shown in a badge at the Dragon Gate.
- **Vehicles:** the boat (Harbour ↔ East Landing) and the plane (two airfields) are adventure
  actions. They count only the plate they arrive on, if any.
- **Cards:** 18 types, 35 cards, in three colour-coded categories (map, power, special).
  - Everyone starts with one card of each category.
  - Hands hold 4. When you would draw into a full hand, a selector in your hand chooses which card
    to discard; the default declines the new card.
  - Map cards only change marked sites and can never cut anyone off.
  - All 18 card types have working targets and effects (a unit test plays each one). Create
    River closes a terrain site; it does not create a boat route.
- **Timers and ties:** pick a match length before starting:
  - **No limit.**
  - **Timed:** 15-minute match and 45-second turns.
  - **12 rounds:** the physical-game option.

  When time or rounds run out, the most banked gems wins, then having made a cut, then a shared
  victory. A turn timeout rolls if needed, makes an automatic move and skips the adventure action.

## Board model

Both maps are supplied paintings (`public/board/island.jpg`, `public/board/dungeon.jpg`) drawn as the
board in a 1024×1024 SVG `viewBox`. Every overlay sits in that same space inside one zoom layer,
so spaces stay on the painted roads at any window size or zoom (checked by an e2e test).

- `src/engine/crownLayout.ts`: hand-placed anchors (castles, gates, stations, traps, side routes,
  dungeon rooms) in image pixels.
- `scripts/trace-island.ts`: snaps the circuit between anchors onto the painted road and writes
  `src/engine/crownRoutes.ts`.
- `src/engine/crownquest.ts`: spaces the 40 circuit nodes evenly along the traced road and builds
  the final paths, side routes, the dungeon graph and every edge.
- `scripts/preview-island.ts`: renders the overlay onto both paintings in `/tmp` for a visual check.
- `scripts/crop-art.ts`: cut the supplied character, gem and icon sheets into `public/art/`.
- `scripts/crop-cards.ts`: cut the supplied card sheets into `public/art/cards/` and the dragon miniature into `public/art/dragon.png`.

## Architecture

```
src/engine/   Pure, deterministic rules engine (no DOM, network or timers)
              crownLayout / crownRoutes / crownquest / board / graph   board data and connectivity
              rules.ts (movement, plates, gems, cuts, extra turns, teleports), cards.ts, queries.ts (legal options),
              engine.ts (createGame / applyAction / tick), view.ts (redaction), ai.ts, rulesText.ts
src/lib/movePlan.ts   Destination-based move preview built on the engine's legalMoves
src/components/board/GameBoard.tsx   SVG board: art, spaces, icons, tokens, preview, drag, zoom
src/components/game/GameScreen.tsx   Turn flow, prompts, piece picker, adventure, cards, log
src/components/game/GuidePanel.tsx   Rules & Guide side panel / phone drawer
src/runner/   GameRunner: engine + clocks + AI scheduling (server and browser)
src/server/   Socket.IO rooms (authoritative), zod-validated protocol, match telemetry
server.ts     Custom Node server: Next.js + Socket.IO + /healthz on one port
src/tutorial/ Scripted 11-step tutorial on the real engine (Alex's turns use the local AI)
tests/  Vitest     e2e/  Playwright     docs/  plan and physical prototype notes
```

- **Server-authoritative online play.** Clients send intents (`roll`, `move` with the full route,
  `playCard` with a target) plus the state version they saw. The server re-validates everything.
  It rejects:
  - stale, duplicate and malformed actions;
  - out-of-turn actions;
  - moves of another player's pieces.

  Each client gets a redacted view. Other hands, the deck order, the discovery deck and the RNG
  state are never sent.
- **Determinism:** the RNG lives in the game state, so a seed plus the action log replays exactly.
- **AI** uses only its own redacted view. It plays practice opponents and disconnected seats.
- **Configuration:** every balance number, the deck and the discovery deck are in
  `src/engine/config.ts` (`GameConfig`), and room limits are in `ROOM_CONFIG`.
- **Developer telemetry:**
  - The server appends finished online matches to `logs/matches.jsonl`: duration, turns, rounds,
    winners and per-player stats.
  - The browser keeps a local match history in `localStorage`.
  - `npm run sim` reports simulated stats.

## Match length

The 15-minute timer is a **target, not a validated result**. No human playtests have been run.

AI-vs-AI simulation with the plate laps, two-way roads, compulsory full roll and extra turns,
default carry limit 2, 100 games per row (`npm run sim -- --games 100 --players N`):

| Players | Games ending at the temple | Mean turns to win | Median | p90 | At an *assumed* 20 s per turn |
| --- | --- | --- | --- | --- | --- |
| 2 | 100 | 104 | 98 | 152 | ≈ 35 min |
| 3 | 100 | 186 | 166 | 301 | ≈ 62 min |
| 4 | 100 | 293 | 278 | 531 | ≈ 98 min |

The previous rules (one-way circuit, ordered laps) took 113 / 240 / 332 mean turns. Matches are
shorter, but still far beyond 15 minutes: a house must bank four gems at its own gate and one
piece must touch all four plates before its Royal Path opens. With the 15-minute
clock on, most timed games will therefore end on the tie-break (most gems, then a cut, then
shared), not at the temple. The simulator AI is also not a human, so these numbers are only an
indication.

## Deployment

Practice, the tutorial and hot-seat run entirely in the browser. **Play with Friends needs a
long-running Node process** (`npm run build && npm start` on a VM or container host); serverless
hosting cannot keep Socket.IO rooms alive.

Rooms are kept **in memory in one process** and are lost on restart. A public deployment would
still need:

- shared state (for example Redis with the Socket.IO adapter) and sticky sessions;
- stronger abuse controls;
- HTTPS/WSS and a restricted CORS origin;
- a security review.

## Known issues & limitations

- **Match length and balance are unvalidated** (see above).
  - **Seat imbalance:** simulated wins over 100 games per row were: 4 players Red 32, Blue 29,
    Purple 15, Green 24; 3 players Red 47, Blue 27, Purple 26; 2 players Red 68, Purple 32.
    Red always moves first, so part of this is first-move advantage; Purple looks weakest.
    This needs fixing before any competitive play.
- **The AI never tames the dragon, uses Dragon Slayer, or takes the boat or plane** (0 attempts in
  simulation). It does dig, use the dungeon, side routes, shortcuts and cards, cut, bank and race
  for the temple.
- **Create River** closes a terrain site but does not create a boat connection.
- **Full hands:** you choose which card to discard (or decline) before an action that might draw.
  There is no pop-up at the moment of the draw. The AI always discards its oldest card.
- **The tutorial plays Alex's turns with the AI** so the dungeon lesson can span two turns. Only the
  dungeon step depends on it.
- **Phones:** the board, die and turn panel fit without sideways scrolling. Pieces in a castle are
  small; zoom or the ×N picker helps. Touch dragging shares the mouse code but is only automated
  with a mouse.
- **Accessibility:** keyboard play works by tabbing through pieces and glowing spaces (no arrow-key
  board navigation). Not tested with real screen-reader users.
- **Seat recovery:** online seats are recovered through `sessionStorage`. Closing the tab forfeits
  the seat, and the AI then plays it.
- **Hot-seat:** hides hands behind a pass-the-device curtain, but can't stop peeking.
- **Not done:** one board only, no music, and match history is local only.
- **Unused file:** `public/board/island-dragonfall-old.jpg` is the previous painting, kept but no
  longer used.
- **Card art:** Raise Mountain's painting is a mountain valley with an upward arrow (it was the
  remaining map card on the sheet). Two other paintings, linked portals and a spike chest, are not
  cards in the deck, so they are not shown.

## Assets & licences

- **Supplied by the project owner:**
  - island and dungeon paintings (`public/board/`);
  - character portraits, gem icons and feature icons (`public/art/`, cropped from the supplied
    sheets by `scripts/crop-art.ts`);
  - the 18 card faces (`public/art/cards/`) and the dragon miniature (`public/art/dragon.png`),
    cropped by `scripts/crop-cards.ts`.
- **Original SVG drawn in code:** board tokens, crests and overlays. The card name is drawn on the
  painting's blank banner.
- **UI icons:** [Lucide](https://lucide.dev) (ISC).
- **Fonts:** Fredoka and Nunito via Fontsource (SIL Open Font License), bundled locally.
- No external requests or API keys.

## Repository notes

The repository started as an empty IntelliJ/Maven skeleton (`pom.xml`, `.mvn`, `.idea`). Those files
are left untouched; the game is entirely the Node/TypeScript project above.
