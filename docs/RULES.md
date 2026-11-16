# Kingdom Chaos: Crown Quest — Rules

Player-facing rules live in `src/engine/rulesText.ts` (`RULE_SECTIONS`, `CARD_INFO`, `CHARACTER_INFO`).
The in-game Rules panel, Learn to Play tutorial, legend and card faces all read from that file.
This document is a short overview of the Island Adventure rules for developers and playtesters.

## Objective

Bank one of each gem kind (Ruby, Sapphire, Emerald, Diamond) at your gate to **open your Royal Path**.
Touch the four public **checkpoints** (house gates) with each character you send to the temple, earn
your kingdom’s **capture credit**, walk them up the Royal Path, and get **all four characters** into
the Crown Temple.

## Turn

1. Roll. Allowance is the roll, then a dragon companion uses `max(1, roll − 2)`, then Slow Down may cap it.
2. Choose one character and a route that uses **exactly** that allowance (island and dungeon alike).
3. Forced effects (traps, shortcuts, hazards, encounters) resolve where they trigger.
4. A natural **6** or at least one **movement capture** earns exactly **one bonus roll** in the same turn
   (a 6 plus captures is still one; chains are possible). Dragon Fire, encounters and cards earn none.
5. One Adventure action per turn (card, dig, dungeon, dragon, vehicle), before or after the move.

## Characters

| Character | Ability |
| --- | --- |
| King | Card draw when banking a new gem kind; **Royal Guard** once per match after he moved |
| Queen | Passes opponents; must end on an empty space; **Diplomacy** after she moved; **Dragon Slayer** on the wild dragon |
| Witch | Portal hop; **Alchemy**; walks through the wild dragon; immune to Dragon Fire |
| Knight | +1 vs monsters/encounters; **route attack** 2–3 eligible rivals when the route allows |

## Captures, gems, path, temple

- King/Witch capture by landing. Knight may route-attack. Queen never captures by landing.
- Captured pieces keep their checkpoints. Capture credit is the kingdom’s temple requirement.
- Banking adds copies to `bank`; duplicates are spares for Diplomacy and Alchemy.
- Royal Path opens on four different banked kinds alone. Enter early; walk back.
- Temple gate: four checkpoints on that piece **and** kingdom capture credit. Four finishers win.

## Dungeon and dragon

- Stone Golem / Cave Spider: end on their space, roll 4+ (Knight +1). Fail → safe room.
- Companion −2 steps (min 1). Dragon Fire ≤3 open spaces: no capture credit, no bonus.
- Release → wild dragon blocks; Witch may pass. Dragon Slayer: Queen only, end on wild dragon, 4+.

## Modes

- **Play Online** — rooms with invite code, sign-in seat recovery, host-only end, 2h inactivity / 24h results.
- **Play on This Device** — handoff screens, local save, offline.
- **Practice vs AI** — same engine; AI sees only its redacted view.
- **Learn to Play** — guided first turn plus the rules rail during play.
