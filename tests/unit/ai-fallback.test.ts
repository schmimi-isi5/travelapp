import { describe, expect, it } from 'vitest';
import { runLocal } from '../../src/lib/ai/fallback';
import { AI_TASKS } from '../../src/lib/ai/types';

describe('local answers for every AI task (no model, no network)', () => {
  it('knows every task and labels every answer as rule-based', () => {
    for (const task of AI_TASKS) {
      const result = runLocal({ task, input: { question: 'Elefant am Fluss', entries: [{ title: 'Tag 1', body: 'Wir sahen Elefanten. Sehr schön.' }], stopTitle: 'Chobe', facts: ['Wetter: trocken'] } });
      expect(result.origin, task).toBe('local_rule_based');
      expect(result.text.length, task).toBeGreaterThan(0);
    }
  });

  it('lists the facts for the day preview and the findings for the plan check, and says so when there are none', () => {
    expect(runLocal({ task: 'day_briefing', input: { stopTitle: 'Etosha', facts: ['Wetter: trocken', 'Unterkunft: Camping'] } }).text).toBe('Dein Tag in Etosha:\n• Wetter: trocken\n• Unterkunft: Camping');
    expect(runLocal({ task: 'check_plan', input: { facts: ['Etosha: keine Unterkunft erfasst.'] } }).text).toContain('• Etosha: keine Unterkunft erfasst.');
    expect(runLocal({ task: 'check_plan', input: { facts: [] } }).text).toBe('Keine Auffälligkeiten gefunden.');
  });

  it('suggests a title from the first words, and species only from the known list', () => {
    const title = runLocal({ task: 'suggest_title', input: { entries: [{ title: '', body: 'Heute fuhren wir früh los und sahen am Wasserloch Elefanten. Danach Mittag.' }], stopTitle: 'Etosha' } });
    expect(title.text.split('\n')).toEqual(['Heute fuhren wir früh los und', 'Ein Tag in Etosha']);
    expect(runLocal({ task: 'suggest_species', input: { question: 'Eine große Herde Elefanten am Ufer', facts: ['Elefant', 'Löwe', 'Giraffe'] } }).text).toBe('Elefant');
    expect(runLocal({ task: 'suggest_species', input: { question: 'Etwas Raschelndes im Busch', facts: ['Elefant'] } }).text).toBe('unklar');
  });
});

describe('local transcript cleanup', () => {
  const clean = (raw: string) => runLocal({ task: 'clean_transcript', input: { entries: [{ title: 'Abschrift', body: raw }] } }).text;
  it('removes filler words and stutters and fixes spacing and sentence starts', () => {
    expect(clean('äh also wir waren heute am Wasserloch und ähm haben Elefanten gesehen')).toBe('Wir waren heute am Wasserloch und haben Elefanten gesehen.');
    expect(clean('wir wir sind früh los . dann gab es Frühstück ,ähm sehr lecker')).toBe('Wir sind früh los. Dann gab es Frühstück, sehr lecker.');
  });
  it('changes no wording beyond that, keeps numbers and names, and says it is not an AI correction', () => {
    expect(clean('Wir fuhren 320 Kilometer nach Etosha. Naja es war heiß!')).toBe('Wir fuhren 320 Kilometer nach Etosha. Es war heiß!');
    expect(runLocal({ task: 'clean_transcript', input: { entries: [{ title: 'Abschrift', body: 'ähm' }] } }).text).toBe('Keine Abschrift zum Glätten.');
    expect(runLocal({ task: 'clean_transcript', input: { entries: [{ title: 'Abschrift', body: 'ok' }] } }).availability_note).toContain('keine KI');
  });
});
