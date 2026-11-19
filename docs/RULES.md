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
5. One Adventure action per turn (card, dig, dungeon, tame, Dragon Fire, vehicle), before or after the move.

## Characters

| Character | Ability |
| --- | --- |
| King | Card draw when banking a new gem kind; **Royal Guard** once per match after he moved |
| Queen | Passes opponents; never captures, must end on an empty (or safe) space; collects spare gems; **Diplomacy** after she moved; **Dragon Slayer** on the wild dragon |
| Witch | Portal hop; collects spare gems; **Alchemy** only in her palace (castle or own gate), each kind once per match; walks through the wild dragon; immune to Dragon Fire |
| Knight | +1 vs monsters/encounters; **charge**: moves through any pieces and captures every eligible rival it passes or lands on |

## Captures, gems, path, temple

- King/Witch/Knight capture by ending a move on a rival on an **unsafe** space. The Knight also captures every eligible rival it passes.
  Queen never captures (she cannot stop on an occupied unsafe space).
- **Safe spaces** never allow a capture; rivals may share them: the four gold-star road stones, the
  four kingdom gates (plates), castles, Royal Paths, the temple, the Dungeon Entrance and the two
  dungeon safe rooms. Shield, Immunity and Royal Guard also make a piece uncapturable (landing on it is
  refused) for **2 opposing movement actions** (`protectionMoves`): every completed rival movement
  counts, bonus-roll moves included; dice, failed requests, Adventure actions, cards and reconnects do
  not. The ward still protects during the second movement and expires right after it
  (`protectionEnded`). Recasting refreshes it to 2, never stacks. A Shield hit by a monster attack
  blocks it and is used up at once. The Witch's Dragon Fire immunity is a permanent trait. `tests/captureSweep.test.ts` checks every space on both maps for King, Witch and Knight.
  Landing on a safe space beside a rival logs "safe space … no capture here", and the move preview says so.
- Captured pieces keep their checkpoints. Capture credit is the kingdom’s temple requirement.
- Banking adds copies to `bank`; duplicates are spares for Diplomacy and Alchemy.
- **Spare gems**: the Queen and the Witch pick up a station's gem even when the kingdom already has
  that kind (one per kind carried). Banked, it is a spare.
- **Alchemy** (Witch, free, own turn): only in her palace (her castle or her kingdom's gate). Turns a
  spare (second banked copy, or a carried gem of a kind already banked) into a kind the kingdom lacks;
  it is banked at once. Each kind of stone may be transmuted once per match (`alchemyUsed`).
- **Diplomacy** (Queen, after she moved): offer a spare for a rival's spare or a power card. The panel
  explains what is missing when it cannot be used.
- Royal Path opens on four different banked kinds alone. Enter early; walk back.
- Temple gate: four checkpoints on that piece **and** kingdom capture credit. Four finishers win.

## Dungeon and dragon

- Stone Golem / Cave Spider: end on their space, roll 4+ (Knight +1). Win: Golem shortcut to the
  Crystal Path / Spider power card. Fail → safe room.
- Monster Den: Adventure fight, 4+ (Knight +1) opens the Vault Door this visit **and drops a dungeon key**.
- Room perks (once per piece per visit, cleared when it leaves the dungeon or goes home):
  - **Old Vault**: loot the hoard: a power card plus a discovery; vault traps are disarmed.
  - **Fallen Ruins** (safe room): search: draw a map card.
  - **Crystal Niche** (safe room): attune: clears a web, next move +2 (`crystalBoost`).
- Crystal Shrine: take a needed gem.
- **Spike Pit**: chute to the Dungeon Entrance (a fast way out); roll on the way down, 4–6
  (`spikeTreasure`) draws a power card.
- **Crystal Mine Tunnel** (island, sealed until Dig Tunnel): shortcut from the Sapphire station to the
  north road; its diamond vein gives each kingdom one Diamond the first time one of its pieces walks
  through with a free hand while it still needs one (`mined`).
- **Killing monsters**: each has **2 hearts** (`monsterHearts`). A hit comes from winning its encounter,
  the **Attack** Adventure action from ≤1 step (`monsterAttackRange`; 4+, Knight +1; a miss and it
  strikes back at once with its push/web unless the attacker is on a safe space or protected), or
  **Dragon Fire** from ≤3 steps (4+, no strike back). Each hit knocks it out (rests like a defeat). At 0
  hearts it is **slain** for the match: no events, no fight; a slain Golem's shortcut opens for everyone;
  the Spider's slayer draws a power card.
- **Roaming monsters** (Stone Golem, Cave Spider; neutral, attack any house). After every full round
  (the last seat's turn ends; bonus rolls are inside a turn so never count) roll one monster die,
  exactly once per round (`monsterRound` is saved with the match):
  **1–3** quiet · **4–5** a random active monster attacks a random eligible piece within **3**
  connected steps of its space (open roads only) · **6** a random active monster climbs out of the
  Dragon Gate and attacks a piece within 3 steps of the gate on the island road, then returns.
  No eligible piece → it patrols (short event, nothing happens).
  - Eligible: not on a safe space, castle, Royal Path or the temple; not Shielded, Immune or Guarded.
  - **Stone Golem** pushes the piece back **2** legal spaces: the reachable space exactly 2 steps
    away that is farthest from the Golem (ties: lowest space id), never a castle, Royal Path, temple,
    trap, trap-risk, encounter or blocked space, nor one it could not share; else 1 step; else stays.
  - **Cave Spider** webs the piece: its next movement allowance is −2 (minimum 1), applied after the
    dragon penalty and before Slow Down, consumed by that piece's next resolved move; never stacks.
  - Encounters (end a move on its space, 4+ with Knight +1): Golem win → shortcut to the Crystal Path
    **and the shortcut stays open for that kingdom** (later pieces pass without a fight); Spider win →
    power card. A beaten monster **rests through the next full round** (no fight, no attacks) and
    recovers at that round's monster event (`monsterRestRounds`).
  - Tunables: `monsterEvents`, `monsterRange`, `monsterQuietMax`, `monsterOutsideRoll`, `golemPush`,
    `webPenalty`, `monsterRestRounds`.
- Companion −2 steps (min 1).
- **Vehicles** (Adventure action, plates on the way do not count, the vehicle stays where it arrives):
  boat between the two docks is free; the plane to another airfield also burns one card as fuel
  (`fuelCardId`, default the oldest card). Why: each skips a long walk (the option shows the steps saved)
  and nothing can capture you on the way.
- Dragon Fire can also target a monster in range (see Killing monsters).
- **Dragon Fire** needs no card: it is an Adventure action of the dragon companion. Choose an
  eligible target (≤3 open spaces), then roll a separate attack die: **4–6 hits** (`dragonFireHit`),
  1–3 misses and the action is still spent. The attack die never earns a bonus roll. A hit sends the
  target home and drops its gems; no capture credit, no bonus.
- Release → wild dragon blocks; Witch may pass. Dragon Slayer: Queen only, end on wild dragon, 4+.

## Modes

- **Play Online** — rooms with invite code, sign-in seat recovery, host-only end, 2h inactivity / 24h results.
- **Play on This Device** — handoff screens, local save, offline.
- **Practice vs AI** — same engine; AI sees only its redacted view.
- **Learn to Play** — guided first turn plus the rules rail during play.
