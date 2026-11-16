import { describe, expect, it } from 'vitest';
import { CHARACTER_INFO, RULE_SECTIONS } from '@/engine';

/**
 * L4: player-facing rules text vs Island Adventure contract.
 * These assertions encode the CONTRACT; failures are documented mismatches (owner A6).
 */
describe('L4 rules text vs engine contract', () => {
  const text = RULE_SECTIONS.map((s) => `${s.title}\n${s.paragraphs.join('\n')}\n${(s.bullets ?? []).join('\n')}`).join('\n');

  it('L4 Royal Path opens on four gems alone (no cut required in text)', () => {
    // Contract M9: gems alone. Legacy text still requires a cut.
    expect(text).not.toMatch(/Royal Path opens once all four gems are banked and you have made one cut/i);
    expect(text).toMatch(/Royal Path opens.*four.*gem/i);
  });

  it('L4 temple needs four markers + kingdom capture; win on 4th finisher', () => {
    expect(text).toMatch(/temple/i);
    expect(text).toMatch(/four.*(marker|plate|checkpoint)|all four/i);
    expect(text).toMatch(/4th|fourth|four.*(finish|piece|character)|finishersToWin|four pieces/i);
  });

  it('L4 bonus roll (not a separate extra turn) and Knight route attack 2–3', () => {
    expect(text).toMatch(/bonus roll/i);
    expect(text).toMatch(/route attack|2–3|2-3/i);
  });

  it('L4 Queen Diplomacy and Witch Alchemy appear', () => {
    expect(text + JSON.stringify(CHARACTER_INFO)).toMatch(/Diplomacy|Alchemy/i);
    expect(CHARACTER_INFO.queen.abilityName + CHARACTER_INFO.queen.ability).toMatch(/Diplomacy|trade/i);
    expect(CHARACTER_INFO.witch.abilityName + CHARACTER_INFO.witch.ability).toMatch(/Alchemy|convert/i);
  });

  it('L4 Witch passes wild dragon / immune to Dragon Fire', () => {
    expect(text).toMatch(/Witch.*(pass|through).*dragon|dragon.*Witch.*pass/i);
    expect(text).toMatch(/immune to Dragon Fire|Dragon Fire.*Witch/i);
  });

  it('L4 dungeon exact moves and encounters', () => {
    expect(text).not.toMatch(/dungeon moves may stop early/i);
    expect(text).toMatch(/Stone Golem|Cave Spider/i);
  });
});
