import { describe, expect, it } from 'vitest';
import { toTerminal } from './markup';

describe('toTerminal', () => {
  it('bolds code and bold text', () => {
    expect(toTerminal('Type `ls` and **press Enter**.')).toBe('Type \x1b[1mls\x1b[0m and \x1b[1mpress Enter\x1b[0m.');
  });

  it('keeps only the shown words of glossary terms', () => {
    expect(toTerminal('Your [[home directory]] and [[hidden file|dot files]].')).toBe('Your home directory and dot files.');
  });
});
