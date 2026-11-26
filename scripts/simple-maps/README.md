# Simple maps

The Simple board paintings (`public/board/*-simple.jpg`) and where every space sits on them
(`src/lib/simpleLayout.ts`). The game graph is the same as the Detailed map; only positions change.

`source/` holds the original paintings with their stepping-stone dots. `dedot.py` / `lanefix.py` paint the
dots out (so only the game's own spaces show), and `build.py` traces each road between the hand-placed
spaces in `pairs.json` (`overrides_island`, `overrides_dungeon`). Edges in `notrace_*` are drawn straight.

```
pip install numpy scipy pillow opencv-python-headless scikit-image
python3 dedot.py source/island-simple-original.jpg /tmp/i1.png 4 && python3 dedot.py /tmp/i1.png /tmp/i2.png 4 0.2 0.6 && python3 lanefix.py /tmp/i2.png island-dedot.png
python3 dedot.py source/dungeon-simple-original.jpg /tmp/d1.png 4 && python3 dedot.py /tmp/d1.png dungeon-dedot.png 4 0.2 0.6
python3 build.py island source/island-simple-original.jpg lay-island.json   # run from this folder; needs nodes.json/edges.json dumped from CROWN_QUEST
```
Then `npx tsx scripts/make-board-bleed.ts` for the soft edges.
