# Kingdom Chaos: Crown Quest

A Ludo-inspired browser board game for 2–4 players. Each house — **Red, Blue, Purple, Green** —
moves a King, Queen, Witch and Knight around a painted island on two-way roads and side routes.

**To win (Island Adventure):**

1. Bank one of each gem (Ruby, Sapphire, Emerald, Diamond) at your house gate to open your Royal Path.
2. Touch the four public **checkpoints** (house gates) with each character you send to the temple.
3. Earn the kingdom’s **capture credit** (a movement capture).
4. Walk characters up your Royal Path into the Crown Temple. The first house with **all four**
   characters finished wins.

Modes: **Play Online** (private rooms with an invite code), **Play on This Device** (handoffs and
local save), **Practice vs AI**, and **Learn to Play** (guided first turn + rules rail).

> Match length and online durability are still being playtested. Treat timer presets as design
> options, not measured results.

---

## Quick start

Requires **Node.js ≥ 20.19** (Node 22 recommended; `.nvmrc` is included).

```bash
nvm use            # or install Node 22
npm install
npm run dev
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm test` | Vitest unit tests |
| `npm run test:e2e` | Playwright (`E2E_PROD=1` after `npm run build`) |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm run sim -- --games 200 --players 4` | AI-vs-AI simulator (turns, finishers, captures, gems) |

## How a turn works

1. **Roll** the die (tap it or press `R`).
2. Choose **one character** and a route that uses **exactly** the allowance (island and dungeon alike).
3. Confirm the glowing end space. Forced effects resolve where they trigger.
4. A natural **6** or at least one **movement capture** earns **one bonus roll in the same turn**
   (chains allowed). The Adventure action stays once per turn.
5. Optional **Adventure**: play a card, dig, dungeon, dragon, or vehicle — or End turn.

**Rules rail / Guide:** searchable rules, kingdom progress, selected piece checkpoints, and what
that piece still needs for the temple. Opening rules never pauses the clock.

## Rules summary

Full text: `src/engine/rulesText.ts` and [docs/RULES.md](docs/RULES.md).

- **Board:** 40-space two-way main road, inner routes, four castles/gates/checkpoints, Royal Paths,
  dungeon under the Dragon Gate. Map changes keep every house able to reach castle, checkpoints
  and Royal Path entry.
- **Captures:** King/Witch by landing; Knight route attack 2–3; Queen passes and ends on empty
  spaces. Captured pieces keep checkpoints. Capture credit feeds the temple gate.
- **Gems:** pick up at stations, bank at your gate; duplicates are spares (Diplomacy / Alchemy).
- **Royal Path:** opens on four gem kinds alone; enter early and walk back.
- **Temple:** four checkpoints on that piece + kingdom capture credit; four finishers win.
- **Characters:** King (draw + Royal Guard), Queen (Diplomacy + Dragon Slayer duel), Witch
  (Alchemy + portal + wild-dragon passage), Knight (+1 encounters + route attack).
- **Dungeon:** Stone Golem / Cave Spider encounters (4+, Knight +1), Crystal Shrine, dragon lair.
- **Dragon:** companion −2 (min 1); Dragon Fire ≤3 (no credit, no bonus); release → wild block;
  Witch may pass; Queen + Dragon Slayer ends on the wild dragon and rolls 4+.

## Architecture

```
src/engine/     Pure rules engine (createGame / applyAction / queries / AI / rulesText)
src/tutorial/   Learn to Play script (guided first turn)
src/components/ Board UI, RulesPanel, GuidePanel, MapGuide legend
docs/           RULES, PHYSICAL, PLAN, island-adventure/CONTRACTS
```

Practice AI: `chooseAiAction(view, random)` and off-turn `aiRespond(view, random)` for trade offers.

## Match length

Timer presets are **design options**. Use `npm run sim` for AI-vs-AI turn and finisher stats; do not
treat those numbers as human playtime.

## Further reading

- [docs/RULES.md](docs/RULES.md) — overview of Island Adventure rules
- [docs/PHYSICAL.md](docs/PHYSICAL.md) — table prototype checklist
- [docs/PLAN.md](docs/PLAN.md) — implementation notes
- [docs/island-adventure/CONTRACTS.md](docs/island-adventure/CONTRACTS.md) — shared agent contracts
