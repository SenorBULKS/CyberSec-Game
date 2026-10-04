import { describe, expect, it } from 'vitest';
import { expandWord, type ExpandContext } from './expand';
import { parseProgram, type Word } from './parse';

/** Parse a single word and return its fragments, for feeding to expandWord. */
function word(text: string): Word {
  const r = parseProgram(text);
  if (!r.ok) throw new Error(r.error);
  return r.stages[0].pipeline[0].words[0];
}

function context(over: Partial<ExpandContext> = {}): ExpandContext {
  return {
    env: (name) => ({ HOME: '/home/me', STAR: '*', EMPTY: '' })[name],
    home: '/home/me',
    homeFor: (name) => (name === 'root' ? '/root' : undefined),
    glob: () => [],
    ...over,
  };
}

describe('expandWord', () => {
  it('expands variables outside and inside double quotes, not single', () => {
    expect(expandWord(word('$HOME'), context())).toEqual(['/home/me']);
    expect(expandWord(word('"$HOME/x"'), context())).toEqual(['/home/me/x']);
    expect(expandWord(word("'$HOME'"), context())).toEqual(['$HOME']);
  });

  it('expands a leading tilde, bare and with a user', () => {
    expect(expandWord(word('~'), context())).toEqual(['/home/me']);
    expect(expandWord(word('~root/x'), context())).toEqual(['/root/x']);
    // An unknown user is left as typed.
    expect(expandWord(word('~ghost'), context())).toEqual(['~ghost']);
  });

  it('does NOT glob a * that came from a variable value', () => {
    // If it tried to glob, the fake glob would return []; staying literal proves it did not.
    const glob = () => ['SHOULD-NOT-BE-USED'];
    expect(expandWord(word('$STAR'), context({ glob }))).toEqual(['*']);
  });

  it('treats an escaped \\* as a literal star, not a glob', () => {
    const glob = () => ['SHOULD-NOT-BE-USED'];
    expect(expandWord(word('a\\*b'), context({ glob }))).toEqual(['a*b']);
  });

  it('globs a literally-typed * and returns the matches', () => {
    const glob = (pattern: string) => (pattern === '*.log' ? ['a.log', 'b.log'] : []);
    expect(expandWord(word('*.log'), context({ glob }))).toEqual(['a.log', 'b.log']);
  });

  it('falls back to the literal word when a glob matches nothing', () => {
    expect(expandWord(word('*.none'), context({ glob: () => [] }))).toEqual(['*.none']);
  });
});
