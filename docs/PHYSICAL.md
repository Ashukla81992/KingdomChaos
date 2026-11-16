# Crown Quest — Physical Prototype Notes

These notes let the digital rules be played on a table for playtesting. They are a prototype
checklist, not a finished product. Nothing here has been playtested yet.

## Components

| Item | Count | Notes |
| --- | --- | --- |
| Island board | 1 | Print `public/board/island.jpg` at least A2. Mark the 40 circuit spaces, gates, forks, safe stars, traps and shortcuts (`npx tsx scripts/preview-island.ts` renders the overlay to `/tmp/island-preview.png` as a guide). |
| Dungeon board | 1 | Print `public/board/dungeon.jpg` (A3 is enough), with the room overlay from `/tmp/dungeon-preview.png`. |
| Die | 1 | Standard d6. |
| Piece tokens | 16 | 4 per house (Red, Blue, Purple, Green): King, Queen, Witch, Knight. Use the portraits in `public/art/` or the symbol tokens (crown, tiara, hat, sword) plus a crest sticker so colour is not the only cue. |
| Dragon | 1 | Print `public/art/dragon.png`. |
| Gem tokens | about 24 | 6 each of Ruby, Sapphire, Emerald, Diamond (stations never run out; bank by placing them on your house mat). |
| House mats | 4 | Four gem slots, a "cut made" tick box, and four plate tick boxes (Red, Blue, Purple, Green) for each of the four pieces. |
| Status and map markers | a handful each | Shield, Immunity, Landslide, Mountain, River, Bridge/Tunnel/Road open-closed. Quantities are untested; the deck has 3 Shield, 2 Immunity and 2 Landslide cards. |
| Boat, plane | 1 each | Start at the Harbour (c25) and the West Airfield (c35). |
| Deck | 35 cards | Composition in `src/engine/config.ts` (`DEFAULT_DECK`); card texts in `src/engine/rulesText.ts`. Faces to print are `public/art/cards/` (the name goes on the blank banner). |
| Discovery deck | 16 cards | 1 of each gem, 2 each of map / power / special card, key, buried trap, secret shortcut. |
| Dungeon keys | 2 | |

## Setup

1. Each player takes a house, its four pieces (in the castle) and a mat.
2. Shuffle the deck. Deal each player one map, one power and one special card (never Dragon
   Slayer in the opening hand).
3. Shuffle the discovery deck face down.
4. Structures: only the Stone Bridge is open. The Broken Bridge, the Mountain Tunnel and the Ruins
   Road are closed.
5. The dragon starts guarding its lair in the dungeon.
6. With 2 players use Red and Purple (opposite corners); with 3, Red, Blue, Purple.
7. Choose the first player; play goes clockwise.

## Match length without a clock

Use the **12-round limit**: after every player has had 12 turns, the game ends.

- Most banked gems wins.
- If tied, a player who has made a cut wins.
- If still tied, the victory is shared.

The digital game offers the same option ("12 rounds" on the start screen). Whether 12 rounds feels
right is untested; simulation suggests most 12-round games will end on the tie-break rather than at
the temple.

## Bookkeeping the app does for you

At the table these need care:

- **Plates (laps):** tick a house plate whenever a piece passes or lands on that gate, in any
  order. Teleports, boats, planes and shortcuts tick only the plate they arrive on. A trap keeps
  ticks; a cut or a trip home clears that piece's ticks (the house keeps its gems and cut).
- **Carrying:** a piece holds up to two gems; bank both at your gate.
- **Whole-roll movement:** count exactly, in either direction on the main road, never stepping on
  the same space twice. You may not pass an opponent on an unsafe space (except the Queen; the
  Knight cuts the first one he passes).
- **Extra turns:** a 6 or a cut earns one extra turn (both together still one), taken after the
  current turn ends.
- **Shield and Immunity:** remove at the start of the owner's next turn.
- **Dragon companion:** move max(1, roll − 2).

## Playtest questions to answer

- How many minutes does a 2-, 3- and 4-player game take to reach the temple?
- Does seat order matter? The simulator favours Red (first to move) and disfavours Purple.
- Is gate-only banking still too slow with two-gem carrying? Candidate fixes are listed in `docs/PLAN.md`.
- Are map cards and the dungeon used, or ignored in favour of racing?
