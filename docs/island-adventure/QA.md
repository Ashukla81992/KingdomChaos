# Island Adventure QA log

Branch: `island-adventure`. QA owns `tests/qa/**`, `e2e/qa.spec.ts`, this file. Never edits `src/**`.
Last engine re-run: `npx vitest run tests/qa` → **46 passed / 0 failed** (8 files).
E2E (`e2e/qa.spec.ts`) is written for Manager `E2E_PROD=1` runs — not executed in this QA session.

Status key: **PASS** = assertion green against current engine · **FAIL** = open defect · **PENDING** = needs e2e/UI/manual · **N/A** = out of engine scope this pass.

## Acceptance results

| id | status | test name(s) | notes / owner |
|---|---|---|---|
| M1 | PASS | `M1 island routes use exactly the allowance…`; `M1 dungeon routes also require the full allowance…` | A1 |
| M2 | PASS | `M2 when nothing can use the roll…`; `M2 skipMove is allowed only…` | A1 |
| M3 | PASS | `M3 ending on a trap teleports with a reason line…` | A1 |
| M4 | PASS | `M4 King captures by landing` | A1 |
| M5 | PASS | `M5 Queen never captures and must end on an empty…` | A1 |
| M6 | PASS | `M6 with 1/2/3/5 eligible…` (knight.test.ts) | A1 |
| M7 | PASS | `M7 protected rivals are not eligible…` | A1 |
| M8 | PASS | `M8 a natural 6…`; `M8 a movement capture…`; `M8 bonus chains…`; `M8 Dragon Fire never…` | A1 |
| M9 | PASS | `M9 four different banked gems open…`; `M9 three gems do not…` | A1 |
| M10 | PASS | `M10 may enter an open Royal Path and walk back…` | A1 |
| M11 | PENDING | — | Overlay UI (A4); not in engine suite |
| M12 | PASS | `M12 missing a marker…`; `M12 no kingdom capture…`; `M12 four markers + cut…` | A1 |
| M13 | PASS | `M13 match ends only when the 4th character enters…` | A1 |
| P1 | PENDING | — | Covered indirectly by banking helpers; dedicated King draw+limit case not asserted this pass (A2) |
| P2 | PENDING | — | Royal Guard not in this QA pass (A2) |
| P3 | PASS | `P3 accepted trade…`; `P3 full hand…`; `P3 open offers expire…`; `P3 third parties…` | A2 |
| P4 | PASS | `P4 Witch may alchemy multiple times…` | A2 |
| P5 | PENDING | — | Existing `tests/special.test.ts` covers portal; not duplicated in qa (A1) |
| P6 | PASS | `P6 Witch may pass a wild dragon…`; `P6 Witch is immune to Dragon Fire` | A3 |
| P7 | PASS | `D1 Cave Spider… Knight gets +1 (P7)` | A3 |
| D1 | PASS | `D1 board exposes…`; `D1 golem success…`; `D1 Cave Spider…` | A3 |
| D2 | PASS | `D2 companion roll 5 yields exactly 3 steps…` | A1/A3 |
| D3 | PASS | `D3 Dragon Fire drops gems…` | A3 |
| D4 | PASS | `D4 release leaves a wild dragon…` | A3 |
| D5 | PASS | `D5 Dragon Slayer: Queen holding the card ends on…` | A3 — see rule-text note on threshold constant |
| B1 | PENDING | — | Visual markers (A3/A4) |
| B2 | PASS | `B2 closing a bridge updates legal routes…` | A3 |
| B3–B5 | PENDING | — | UI (A4/A6) |
| L1–L3 | PENDING | e2e `O1 Learn to Play…` | A6/A4; e2e not run here |
| L4 | PASS | `tests/qa/rulesText.test.ts` (contract phrases present) | A6 — see mismatches below |
| O1 | PENDING | e2e `O1 Learn…`; `O1 Play Online and Play on This Device…` | A5/A6; home now exposes Online + This Device directly |
| O2–O4 | PENDING | e2e two-context room | A5 |
| O3 | PENDING | e2e host-only End match | A5 |
| O5/O8 | PENDING | e2e same-device reload | A5 |
| O6 | PASS | `applyAction rejects a duplicate/stale action version` | engine version gate; HTTP idempotency is A5 |
| O7 | PENDING | — | Server expiry (A5) |
| V1–V2 | PENDING | — | Deploy (A5/Manager) |
| Hidden info | PASS | `toPlayerView hides other hands and deck order` | Manager/view |

## Open defects

None failing in `tests/qa` at last re-run. Earlier in the session (before A1–A3 landed) these failed and are retained as regression anchors:

| was | repro (minimal) | suspected owner |
|---|---|---|
| D1 encounters missing | `getBoard('crownquest')` had no `node.encounter` for golem/spider | A3 (fixed: `d-golem` / `d-spider`) |
| P3/P4 powers stub | `applyPower` returned `"That power is not available yet."` | A2 (fixed) |
| M6 `routeTargets` empty / `knightCut` only | Knight pass-cut legacy | A1 (fixed) |
| M9 path required cuts | `finalUnlocked` needed `cutsRequired` | A1 (fixed via `royalPathOpen`) |
| M13 first temple entry won | `walk` called `finishGame` on first temple | A1 (fixed: `finished` + `finishersToWin`) |
| `dragonSpaceRule` not exported from `@/engine` | import from `src/engine/dungeon` in QA | Manager/A3 — still not re-exported from `index.ts` |

## Rule-text mismatches (L4)

Compared `src/engine/rulesText.ts` / `CHARACTER_INFO` / RulesPanel source (`RULE_SECTIONS`) to CONTRACT §1 and engine:

1. **Dragon Slayer threshold constant (A3/A6)** — player text uses `config.slayThreshold`; `resolveArrival` duel rolls against `config.encounterThreshold`. Both default to 4 today; diverging them would desync rules vs engine.
2. **Home menu vs setup copy (A5/A6)** — `RULE_SECTIONS.setup` still says “Play Online / Play on This Device” under Friends-style modes; the live home page promotes both as top-level links (no “Play with Friends” parent). Acceptable UX drift; e2e accepts either shape.
3. **`keepsEveryoneConnected` prose vs older graph** — rules text matches the strengthened objective check; verified green via B2 test. No open prose defect.
4. No remaining “extra turn / cut required for Royal Path / dungeon may stop early” legacy bullets were found in current `RULE_SECTIONS` (A6 appears updated).

## Test inventory

- `tests/qa/helpers.ts`
- `tests/qa/movement.test.ts` — M1 M2 M3 D2
- `tests/qa/knight.test.ts` — M4 M5 M6 M7
- `tests/qa/bonus.test.ts` — M8
- `tests/qa/royalPath.test.ts` — M9 M10 M12 M13
- `tests/qa/powers.test.ts` — P3 P4
- `tests/qa/dungeon.test.ts` — D1 D3 D4 D5 P6 P7 B2
- `tests/qa/view.test.ts` — hidden info, stale version
- `tests/qa/rulesText.test.ts` — L4 contract phrases
- `e2e/qa.spec.ts` — O1 Learn / Online+Device / O8 resume / two-context roll + host End match
