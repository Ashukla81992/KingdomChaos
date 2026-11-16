# Island Adventure: acceptance checklist

Each row links a requirement to its implementation, the player-facing explanation, and a test or
manual check. Status: ☐ open · ◐ implemented · ✅ verified by QA · ⚠ known issue.

| id | requirement | owner | implementation | player-facing explanation | test / check | status |
|---|---|---|---|---|---|---|
| M1 | Exact movement; no Stop here or split moves | A1/A4 | | | | ☐ |
| M2 | No legal move: pick another; none moves → skip, bonus resolves | A1 | | | | ☐ |
| M3 | Forced effects apply at trigger with explanation | A1/A3/A4 | | | | ☐ |
| M4 | King/Witch landing capture | A1 | | | | ☐ |
| M5 | Queen passes, never captures, ends on empty space | A1 | | | | ☐ |
| M6 | Knight route attack 2–3 chosen targets (1/2/3/5 available), final-space capture counts | A1/A4 | | | | ☐ |
| M7 | Safe spaces, protections, gem transfer/drop preserved | A1 | | | | ☐ |
| M8 | One bonus roll for a 6 or ≥1 capture; 6 + multi-capture = one; chains re-evaluated | A1 | | | | ☐ |
| M9 | Royal Path opens on 4 different banked gems alone | A1/A2 | | | | ☐ |
| M10 | Enter path before checkpoints; walk back to the island | A1 | | | | ☐ |
| M11 | Overlay hidden by default; selected piece's reachable open path only | A4 | | | | ☐ |
| M12 | Temple gate: all four markers + kingdom capture, checked at gate | A1 | | | | ☐ |
| M13 | Pieces finish individually; 4th finisher wins | A1 | | | | ☐ |
| P1 | King card draw on banking with hand limit | A2 | | | | ☐ |
| P2 | Royal Guard once per match, self or adjacent ally, until next turn | A2 | | | | ☐ |
| P3 | Diplomacy offer/accept/decline/expire, atomic, hand limit, private | A2/A4 | | | | ☐ |
| P4 | Witch Alchemy repeatable | A2 | | | | ☐ |
| P5 | Witch free portal hop once per turn | A1 | | | | ☐ |
| P6 | Witch passes wild dragon, immune to Dragon Fire | A3 | | | | ☐ |
| P7 | Knight +1 vs monsters | A3 | | | | ☐ |
| D1 | Stone Golem (shortcut) and Cave Spider (power chest) 4+, fail → safe room, both outcomes previewed | A3/A4 | | | | ☐ |
| D2 | Companion −2 (min 1) steps | A1/A3 | | | | ☐ |
| D3 | Dragon Fire ≤3 along open paths, drops gem, no credit, no bonus | A3 | | | | ☐ |
| D4 | Release → wild dragon blocks; Witch passes | A3 | | | | ☐ |
| D5 | Dragon Slayer: Queen only, 4+, clears block, dragon recovers one round | A3 | | | | ☐ |
| B1 | Distinct color/icon/label for landslides, portals, teleports, crossings | A3/A4 | | | | ☐ |
| B2 | Routes recalc on map change; objectives never cut off | A3 | | | | ☐ |
| B3 | Previews: destinations, captures, portal exits, known hazards | A4 | | | | ☐ |
| B4 | Translucent event cards (what, why, what now); hidden effects stay hidden | A4 | | | | ☐ |
| B5 | Full help early, shorter later; tap marker or Legend for detail | A4/A6 | | | | ☐ |
| L1 | Quick start, guided first turn, full rules reference in play | A6 | | | | ☐ |
| L2 | Rulebook covers every listed topic | A6 | | | | ☐ |
| L3 | Gem, capture, temple progress per kingdom; selected piece's checkpoints | A4 | | | | ☐ |
| L4 | Tooltips, tutorials, examples updated; rulebook = prompts = engine | A6/QA | | | | ☐ |
| O1 | Play with Friends → Online / This Device, 2–4; Practice and Learn reachable | A5 | | | | ☐ |
| O2 | Private rooms, invite code/link, sign-in seat recovery | A5 | | | | ☐ |
| O3 | Host-only end with confirmation, server-enforced | A5 | | | | ☐ |
| O4 | Disconnect keeps seat and active turn | A5 | | | | ☐ |
| O5 | Save after every accepted action incl. rolls; exact turn restore | A5 | | | | ☐ |
| O6 | Server validation, atomic versioned writes, idempotent retries, per-player views | A5 | | | | ☐ |
| O7 | 2 h inactivity expiry (polling does not extend); 24 h result retention; scheduled deletion; accounts kept | A5 | | | | ☐ |
| O8 | Same device: local save, resume, private handoffs, offline | A5 | | | | ☐ |
| V1 | Migrations, `.env.example`, cleanup config, deployment steps | A5 | | | | ☐ |
| V2 | Deployed online play verified in two independent sessions | Manager | | | | ☐ |
