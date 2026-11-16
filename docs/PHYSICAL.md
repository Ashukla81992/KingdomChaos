# Crown Quest — Physical Prototype Notes

These notes let the digital rules be played on a table for playtesting. They are a prototype
checklist, not a finished product.

## Components

| Item | Count | Notes |
| --- | --- | --- |
| Island board | 1 | Print `public/board/island.jpg` at least A2. Mark the 40 circuit spaces, gates, forks, safe stars, traps and shortcuts (`npx tsx scripts/preview-island.ts` renders the overlay to `/tmp/island-preview.png` as a guide). |
| Dungeon board | 1 | Print `public/board/dungeon.jpg` (A3 is enough), with the room overlay from `/tmp/dungeon-preview.png`. |
| Die | 1 | Standard d6. |
| Piece tokens | 16 | 4 per house (Red, Blue, Purple, Green): King, Queen, Witch, Knight. |
| Dragon | 1 | Print `public/art/dragon.png`. |
| Gem tokens | about 24 | 6 each of Ruby, Sapphire, Emerald, Diamond (stations never run out; bank by placing them on your house mat). |
| House mats | 4 | Four gem slots (with spare tallies), a capture-credit tick, and four checkpoint ticks (Red, Blue, Purple, Green) for each of the four pieces. |
| Status and map markers | a handful each | Shield, Immunity, Royal Guard, Landslide, Mountain, River, Bridge/Tunnel/Road open-closed, encounter and wild-dragon markers. |
| Boat, plane | 1 each | Start at the Harbour (c25) and the West Airfield (c35). |
| Deck | 35 cards | Composition in `src/engine/config.ts` (`DEFAULT_DECK`); card texts in `src/engine/rulesText.ts`. Faces to print are `public/art/cards/`. |
| Discovery deck | 16 cards | 1 of each gem, 2 each of map / power / special card, key, buried trap, secret shortcut. |
| Dungeon keys | 2 | |

## Setup

1. Each player takes a house, its four pieces (in the castle) and a mat.
2. Shuffle the deck. Deal each player one map, one power and one special card (never Dragon
   Slayer in the opening hand).
3. Shuffle the discovery deck face down.
4. Structures: only the Stone Bridge is open. The Rope Bridge, Camp Road, Ruins Road and Crystal
   Mine Tunnel start closed.
5. The dragon starts guarding its lair in the dungeon.
6. With 2 players use Red and Purple (opposite corners); with 3, Red, Blue, Purple.
7. Choose the first player; play goes clockwise.

## Match length without a clock

Use the **12-round limit**: after every player has had 12 turns, the game ends.

- Most banked gem kinds wins.
- If tied, a player who has capture credit wins.
- If still tied, the victory is shared.

The digital game offers the same option ("12 rounds" on the start screen).

## Bookkeeping the app does for you

At the table these need care:

- **Checkpoints:** tick a house gate whenever a piece passes or lands on it, in any order.
  Teleports, boats, planes and shortcuts tick only the checkpoint they arrive on. Captured pieces
  **keep** their checkpoint ticks. Rescue resets that piece’s ticks.
- **Carrying:** a piece holds up to two gems; bank at your gate. Duplicates are spares.
- **Exact movement:** count exactly, in either direction, never stepping on the same space twice.
  Island and dungeon both use the full allowance. Queen ends on an empty space; Knight may choose
  a 2–3 route attack when enough eligible rivals sit on the route.
- **Bonus rolls:** a 6 or a movement capture earns one bonus roll in the **same** turn (both together
  still one). Chains are allowed. Dragon Fire earns none.
- **Royal Path:** opens when one of each gem kind is banked. Pieces may enter early and walk back.
  Temple gate still needs four checkpoints on that piece and the kingdom’s capture credit.
- **Victory:** all four of a house’s characters finish in the Crown Temple.
- **Shield, Immunity, Royal Guard:** remove at the start of the owner’s next turn.
- **Dragon companion:** move max(1, roll − 2).

## Playtest questions to answer

- How many minutes does a 2-, 3- and 4-player game take to get four finishers into the temple?
- Does seat order matter?
- Are map cards, Diplomacy, Alchemy and dungeon encounters used, or ignored in favour of racing?
