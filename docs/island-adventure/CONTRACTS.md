# Island Adventure: shared contracts

Baseline: `main` @ b887f26, 149 unit tests passing, typecheck clean. Integration branch: `island-adventure`.
Everything here is binding for all agents. Change it only through the Manager.

Node: always `source ~/.nvm/nvm.sh && nvm use 22` first. Unit tests: `npx vitest run`. Types: `npx tsc --noEmit -p .`.
Lint: `npm run lint`. E2E needs a production build and no dev server on ports 3000/3210:
`npm run build && E2E_PROD=1 npx playwright test`.

## 1. Rules (the single source of truth for engine, prompts and rulebook)

### Turn
1. Roll. The allowance is `stepsFor()`: the roll, then a dragon companion `max(1, roll - 2)`, then Slow Down.
   The `rolled` event carries `value`, `steps`, `penalty` and `bonus`.
2. Choose one character and a route that uses **exactly** the allowance (island and dungeon alike).
   No "Stop here", no split moves. Portal hops, trap and shortcut jumps happen *after* the steps.
3. If no piece of yours has a legal full-length move, movement is skipped (`noMove` event); any
   earned bonus still resolves.
4. Forced effects (traps, shortcuts, hazards, encounters) resolve where they trigger and always log
   a reason line.
5. **Bonus roll.** A natural 6 on the movement die, or at least one movement capture during the move
   (landing or Knight route attack), earns exactly **one** bonus roll (`turn.extra`). A 6 plus any
   number of captures is still one. Once the move resolves, the player rolls again *in the same turn*:
   `moveDone=false`, `move=null`, `bonus=true`, `extra=null`, `rolls++`. Each bonus roll is judged by
   the same rule, so chains are possible. The Adventure action stays once per turn. The turn ends
   when the move is done, no bonus is pending, and the Adventure action is used or skipped.
   Dragon Fire, encounters and card effects never earn a bonus roll.
6. On timeout, a pending bonus is lost and the turn passes.

### Captures
- **King and Witch** capture by landing on an eligible opponent.
- **Queen** passes through opponents, never captures, and must end on a space with **no other piece**
  (safe spaces included). The one exception: ending on the wild dragon's space while holding
  Dragon Slayer, which starts the slay duel (A3).
- **Knight** has two options:
  - A normal move: may not pass a rival on an unsafe space, and captures by landing.
  - A **route attack** (`move.attack`): choose 2–3 (`knightAttackMin`..`knightAttackMax`) eligible
    rivals among those he passes **or lands on**. An eligible rival on the final space must be
    included and counts toward the limit. Unchosen rivals are passed safely. With fewer than 2
    eligible rivals on the route, only the normal move exists.
  - Eligible means an opponent on an unsafe space, not protected (shield, immune, sanctuary,
    Royal Guard).
- A captured piece goes to its castle, keeps the markers it has touched, and follows the existing
  gem rules: gems carried by the victim go to the attacker if he can carry them, or drop on the space.
- `stats.cuts` counts movement captures only. It is the kingdom's temple capture credit.

### Gems, Royal Path, temple
- Banking at your castle adds a copy to `player.bank[kind]`. Duplicates are kept as spares;
  `player.gems` lists the distinct kinds.
- **The Royal Path opens** when the kingdom has banked one of each of the four kinds
  (`royalPathOpen(s, playerId)`, A1). It does not depend on captures or markers.
- A piece may enter its own open Royal Path at any time, and its edges run both ways, so it can
  walk back onto the island.
- **Temple gate** (edge `f-{key}-5 → temple`): the piece must have touched all four public
  markers (`plates.length === 4`), and the kingdom must have `stats.cuts >= cutsRequired`
  (default 1). Both are checked at the gate only.
- Entering the temple sets `ch.finished = true`, emits `finished`, removes the piece from play (it
  stays on `temple` and never moves or blocks), and banks any carried gem. The first kingdom with
  `finishersToWin` (4) finished pieces wins (`gameOver`, reason `temple`).
- `ch.lap` stays as a derived count (`plates.length`) for old UI; no lap resets.

### Powers
- **King**: keeps the card draw on banking (hand limit applies). **Royal Guard** (`royalGuard`, once
  per match, `royalGuardPerMatch`): after the King moved this turn (`turn.moved` includes him), guard
  himself or an adjacent ally (sharing an edge with his space) so it cannot be captured until his
  kingdom's next `turnStarted`. Free action.
- **Queen – Diplomacy** (`offerTrade`): only on a turn in which the Queen was selected to move
  (`turn.moved` includes her), once per turn (`turn.diplomacyUsed`). Offer one **spare** banked gem
  (`bank[give] >= 2`) to a rival for either a gem kind they have spare or a power card type they
  hold. The recipient answers off-turn with `respondTrade`; the offerer may `cancelTrade`. On
  accept, both items swap atomically: gems are banked directly, the card moves hand to hand, and
  the hand limit is checked (a full hand cannot accept a card). Open offers expire when the
  offerer's turn ends (`expireTrades`, called by the turn flow). Spares on both sides mean a trade
  never closes anyone's Royal Path. Third parties see only who is trading.
- **Witch – Alchemy** (`alchemy`, repeatable, on her own turn): convert a gem she carries into any
  kind her kingdom is missing, if the kingdom already banked a copy of the carried kind. The gem
  still has to be carried home. She keeps the free fixed-portal hop once per turn. She passes
  through the wild dragon's space (it stays) and is immune to Dragon Fire.
- **Knight**: +1 against dungeon monsters and encounters, plus the route attack.

### Dungeon and dragon
- **Stone Golem** guards a shortcut; **Cave Spider** guards a power-card chest. A move that ends on
  the monster's space forces one roll: `encounterThreshold` (4)+ succeeds (Knight +1). Golem success
  carries the piece along the shortcut; Spider success draws a power card. Failure sends the piece to
  the marked safe room. Both outcomes are previewed before confirming (`arrivalPreview`).
- **Dragon**: keep taming, defenses and recovery. A companion costs 2 steps (minimum 1).
  **Dragon Fire** sends one eligible rival within 3 spaces along open, connected paths home and drops
  their carried gem on that space. No capture credit, no bonus roll. **Release** (start of turn)
  leaves a wild dragon blocking that space: nobody passes it except the Witch.
  **Dragon Slayer**: only the Queen holding it may end on the wild dragon's space, then rolls 4+.
  Success clears the block and returns the dragon to the dungeon to recover for one round. Flight is
  out of this release.

### Map changes
- Landslides, paired portals, teleport tiles, and created or destroyed crossings each get a distinct
  color, icon and label on the actual spaces or roads (A3 data, A4 rendering).
- Legal routes are recomputed from state on every query (no caching across actions).
- `keepsEveryoneConnected` must also keep every kingdom able to reach its castle, all four markers,
  and its Royal Path entry. A map change that would cut one off is refused with a reason.

## 2. State schema additions (`src/engine/types.ts`, owned by the Manager)
- `Character.finished`, `Character.guarded`
- `PlayerState.bank`, `PlayerState.royalGuardUsed`
- `TurnState.extra: 'six'|'capture'|null`, `bonus`, `rolls`, `moved[]`, `diplomacyUsed`
- `GameState.trades: TradeOffer[]`, `tradeCounter`; `PlayerView.trades: TradeView[]`
- `NodeDef.encounter?: EncounterDef`
- `MatchResult.reason` adds `'ended'` (the online host ended it; `winners: []`)
- Config: `knightAttackMin`, `knightAttackMax`, `finishersToWin`, `royalGuardPerMatch`, `encounterThreshold`

Old saved games will not load. The local save key gets a new version (A5).

## 3. Actions (`GameAction`; zod in `src/server/protocol.ts`)
| action | who / when | effect |
|---|---|---|
| `roll` | current player, no roll pending | sets `turn.move` |
| `move {characterId, path, attack?}` | after a roll | exact route; `attack` is the Knight's chosen targets |
| `skipMove` | only when no legal move | resolves a pending bonus |
| `royalGuard {targetId}` | King moved this turn, unused | free |
| `alchemy {characterId, gemId, to}` | Witch's owner, own turn | free, repeatable |
| `offerTrade {to, give, want}` | Queen moved this turn, once | free |
| `respondTrade {offerId, accept, cardId?}` | the recipient, **any time** | swap or decline |
| `cancelTrade {offerId}` | the offerer, any time | withdraw |
| existing adventure actions | once per turn | unchanged unless noted |

`applyAction` lets `OFF_TURN_ACTIONS` (from `powers.ts`) through when it is not your turn and routes
all `POWER_ACTIONS` to `applyPower(ctx, playerId, action)` (A2). This dispatch is already wired.

## 4. Events (`GameEvent`)
Events are facts, never prose. Add optional fields rather than renaming. New:
`rolled.steps/penalty/bonus`, `routeAttack`, `noMove`, `finished`, `encounter`, `terrainChanged`,
`edgeChanged.change/by/card`, `royalGuard`, `alchemy`, `tradeOffered`, `tradeResolved`;
`extraTurn.reason` is now `'six'|'capture'`. Each emitter also writes a log line (who, what, why).
`src/lib/explain.ts` (A4) maps events to event cards (title, why, what you can do now).

## 5. Cross-module hooks (stubs exist; their owners implement them)
- `powers.ts` (A2): `applyPower`, `expireTrades(ctx, playerId)` (A1 calls it in `finishTurn`
  before the next `startTurn`), `tradesFor(state, viewerId)`.
- `dungeon.ts` (A3): `dragonSpaceRule(s, characterId)` is read by A1's route search;
  `arrivalPreview(s, characterId, node)` is shown by A4 and attached by A1 to `MoveOption.arrival`;
  `resolveArrival(ctx, ch)` is called by A1's `walk` after landing captures and pickups, before
  hazards, teleports and the temple.
- Royal Guard: A1's `isProtected` must treat `guarded` as protected. A2 sets and clears `guarded`,
  clearing it in a `startTurn` hook `clearGuards(ctx, playerId)` that A2 exports and A1 calls.
- `MoveOption` (A1, in `rules.ts`): `{ path, cost, witchPortal, landingCuts, entersFinal,
  routeTargets: string[], arrival: ArrivalPreview|null, finishes: boolean }`. Drop `knightCut`. A Knight
  option whose route has 2+ eligible rivals lists them in `routeTargets`; the client picks 2–3
  (including any on the final space) and sends `attack`.
- `royalPathOpen(s, playerId)`, `templeBlockers(s, characterId): string[]` (A1, exported from
  `victory.ts`; empty means it may enter) are used by A4, A6 and the AI.

## 6. Online and same-device play (A5)
- HTTP API under `src/app/api/**` plus Postgres (Neon via `DATABASE_URL`). With no `DATABASE_URL` it
  uses an in-memory store for dev and tests. Clients poll about every 1.5 s. Socket.IO is removed.
- Accounts are a username and password (scrypt), with an httpOnly signed session cookie
  (`SESSION_SECRET`). Seats are bound to an account, so signing in on any device recovers the seat.
- `POST /api/rooms/:code/actions {action, version, clientActionId}`: server validation through
  `applyAction`. The write is atomic: `UPDATE ... WHERE version = $expected`. A repeated
  `clientActionId` returns the stored result. A stale `version` returns 409 with the current view.
- `GET /api/rooms/:code` returns that player's `toPlayerView`. Reads never extend expiry.
- Expiry: unfinished rooms expire `activity_at + 2h`. Only a lobby join, the match start, or an
  accepted action sets `activity_at`. Finished or host-ended rooms keep read-only results until
  `ended_at + 24h`. Expired rooms answer 410. Deletion runs from `/api/cron/cleanup` (`CRON_SECRET`,
  daily Vercel cron) plus an opportunistic sweep on writes. Accounts are kept.
- Only the host may end a match (`POST /api/rooms/:code/end`, confirmed in the UI, checked on the
  server). Result reason `ended`.
- Same device: `localStorage` save after every accepted action and resume on reload. A handoff
  screen hides private hands between turns and for trade responses. Works offline with no account.

## 7. AI contract (A6)
`chooseAiAction(view, random)` must handle exact moves, bonus rolls, Knight `attack` (pick the
best 2–3), the four new free actions (optional), and `respondTrade` for offers aimed at an AI.
Runners (A5 `GameRunner`, `useLocalGame`) also ask the AI for responses to offers aimed at AI
seats when it is not their turn: `aiRespond(view, random): GameAction | null`.

## 8. File ownership
Only edit files you own. In shared files, edit only your marked section with StrReplace, never
rewrite the whole file. Everyone works in the same tree on branch `island-adventure`; do **not** commit,
switch branches, stash, or reset. Ask the Manager about changes to section 2–5 contracts.

| owner | files |
|---|---|
| Manager | `types.ts`, `config.ts`, `index.ts`, `view.ts`, the dispatch block in `engine.ts`, the actions in `protocol.ts`, `docs/island-adventure/*` except QA.md |
| A1 movement | `engine.ts` (turn flow), `rules.ts` sections *laps*, *occupancy*, *movement*, *victory* and `finalUnlocked`/`announceUnlock`; new `victory.ts`; `queries.ts` movement functions (`stepsFor`, `legalMoves`, `movableCharacters`, `whyStuck`, `noMoveReason`, `objectiveText`); `lib/movePlan.ts`, `lib/royalPath.ts`; the final-path block of `crownquest.ts`; tests `turn`, `cutting`, `royalPath`, `movePlan`, new `knight`, `victory` |
| A2 powers | `powers.ts`; `rules.ts` *gems* helpers (`giveGem`, `newGem`, `pickUpAt`, `bankAt`, `bankGem`, `bankAtHome`) and `drawCard`; tests `gems`, new `powers` |
| A3 dungeon/map | `dungeon.ts`; `rules.ts` *dragon*, `springHazard`, `retreat`, `nearestWhere`, *discoveries*, `burn`; `cards.ts`; `graph.ts`; `crownLayout.ts` dungeon and marker data; `crownquest.ts` dungeon, encounter and feature data; `queries.ts` `dragonFireTargets`, `adventureOptions`, `playableCards`, `hasAdventure`; tests `dragon`, `special`, `board`, new `dungeon` |
| A4 board UI | `components/board/*`, `components/game/{GameScreen,ObjectiveStrip,CardView,Die,ResultsOverlay}.tsx`, new `components/game/{EventCard,TradePanel,KingdomProgress}.tsx`, `lib/explain.ts`, `components/art/*`, `e2e/game.spec.ts`, `e2e/mobile.spec.ts` |
| A5 online | `src/server/*` (except the action schema), `server.ts`, `runner/GameRunner.ts`, `app/api/**`, `app/online`, `app/room`, `app/hotseat`, `app/page.tsx`, `lib/{socket,realtime,storage,useLocalGame}.ts` and new `lib/online*.ts`, `db/**`, `.env.example`, `vercel.json`, `package.json`, `next.config.ts`, server tests, new `e2e/online.spec.ts`, `docs/DEPLOY.md` |
| A6 learning | `rulesText.ts`, `ai.ts`, `RulesPanel.tsx`, `components/game/{GuidePanel,MapGuide}.tsx`, `components/tutorial/*`, `app/tutorial`, `app/practice`, `tests/tutorial*`, `README.md`, `docs/{RULES,PHYSICAL,PLAN}.md`, `scripts/simulate.ts` |
| QA | `tests/qa/**`, `e2e/qa.spec.ts`, `docs/island-adventure/QA.md` (never `src`) |

## 9. Playtest defaults
Bonus chains are unlimited. Knight attack is 2–3. Encounters need 4+. Royal Guard is once per match.
Captured pieces keep their markers. One capture is needed for the temple. Four finishers win. Dragon
Fire range is 3. Online polling is 1.5 s.
