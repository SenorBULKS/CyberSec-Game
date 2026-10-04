import { describe, expect, it } from 'vitest';
import { challenges } from '../challenges';
import { lookupTerm, GLOSSARY } from './glossary';

/** Every piece of player-facing text a challenge contains. */
function texts(): string[] {
  return challenges.flatMap((c) => [
    c.briefing,
    ...c.objectives.flatMap((o) => [o.intro ?? '', o.outro ?? '', ...o.hints]),
  ]);
}

describe('glossary', () => {
  it('looks terms up without caring about case', () => {
    expect(lookupTerm('Terminal')).toBe(GLOSSARY.terminal);
    expect(lookupTerm('not a term')).toBeUndefined();
  });

  it('defines every [[term]] used in challenge text', () => {
    const used = texts().flatMap((t) => [...t.matchAll(/\[\[([^\]|]+)/g)].map((m) => m[1]));
    expect(used.length).toBeGreaterThan(0);
    for (const term of used) expect(lookupTerm(term), term).toBeDefined();
  });

  it('has no markup errors in definitions', () => {
    for (const [term, definition] of Object.entries(GLOSSARY)) {
      expect((definition.match(/`/g) ?? []).length % 2, term).toBe(0);
      expect(definition, term).not.toContain('[[');
    }
  });
});
