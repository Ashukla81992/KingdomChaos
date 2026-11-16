# Kingdom Chaos: Crown Quest — Implementation Notes

Island Adventure updates the Crown Quest rules: exact moves and bonus rolls in the same turn,
checkpoints kept on capture, Royal Path on four gem kinds alone, temple gate checks, four finishers
to win, character powers (Royal Guard, Diplomacy, Alchemy, Knight route attack), and dungeon
encounters. Shared contracts: `docs/island-adventure/CONTRACTS.md`.

## What changed from earlier Crown Quest

| Area | Earlier Crown Quest | Island Adventure |
| --- | --- | --- |
| Movement | Whole roll; dungeon could stop early | Exact allowance on island **and** dungeon |
| Bonus | Extra turn after the current turn | Bonus roll **in the same turn**; chains |
| Win | One piece: gems + cut + lap + temple | Four finishers; path on gems alone; temple needs checkpoints + capture |
| Checkpoints | Reset on capture (“lap”) | Kept when captured |
| Knight | Pass-cut one rival | Route attack choosing 2–3 eligible rivals |
| Queen | Pass + land-capture | Pass; empty-space landings; Diplomacy |
| Witch | Portal hop | Portal hop + Alchemy; wild-dragon passage; Dragon Fire immunity |
| King | Card on banking | Card on banking + Royal Guard once per match |
| Dragon Slayer | Adventure card near dragon | Queen ends on wild dragon, then rolls |
| Online | Socket.IO rooms | HTTP + Postgres (A5); same-device handoffs and local save |

## Architecture

```
src/engine/
  types.ts / config.ts / index.ts / view.ts   Shared schema (Manager)
  rules.ts / victory.ts / queries.ts          Movement, path, temple (A1)
  powers.ts                                   Royal Guard, Alchemy, trades (A2)
  dungeon.ts / cards.ts / crownquest.ts       Encounters, dragon, map (A3)
  rulesText.ts / ai.ts                        Rulebook + Practice AI (A6)
src/components/game/{GuidePanel,MapGuide,RulesPanel}
src/tutorial/steps.ts                         Learn to Play script
```

The UI never decides rules. Every option it shows comes from engine queries, and the server
re-validates every action.

## Key decisions (Island Adventure)

- **Exact routes.** No “Stop here”, no split moves. Portal hops / traps / shortcuts after steps.
- **Bonus rolls.** One per movement roll (6 or ≥1 capture); Adventure still once per turn.
- **Royal Path.** `royalPathOpen` = one of each banked kind. Enter early; edges both ways.
- **Temple gate.** `templeBlockers`: four checkpoints on the piece + kingdom `cutsRequired`.
- **Victory.** `finishersToWin` (default 4) characters with `finished` in the temple.
- **Spares.** `player.bank[kind]` counts copies; Diplomacy and Alchemy spend spares only.
- **AI.** `chooseAiAction` + `aiRespond` for off-turn trade answers (A6).
- **Learn to Play.** Guided first turn (roll → exact route → capture bonus → event) plus rules rail.

## Open playtest levers

Simulated match length depends heavily on four finishers and exact movement. Untried levers:

- lower `finishersToWin` for shorter practice presets;
- carry limit and gem pickup rules;
- encounter and Knight attack tuning in `config.ts`.

Seat balance remains an open question for playtests.
