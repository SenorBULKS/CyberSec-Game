import { describe, expect, it } from 'vitest';
import { parseCommandLine } from './parse';

const words = (line: string) => {
  const r = parseCommandLine(line);
  if (!r.ok) throw new Error(r.error);
  return r.words;
};

describe('parseCommandLine', () => {
  it('splits on spaces and tabs, ignoring extra whitespace', () => {
    expect(words('  ls   -la\t/home ')).toEqual(['ls', '-la', '/home']);
  });

  it('returns no words for a blank line', () => {
    expect(words('   ')).toEqual([]);
  });

  it('keeps single-quoted text literal', () => {
    expect(words(`echo 'a  b' 'it\\s'`)).toEqual(['echo', 'a  b', 'it\\s']);
  });

  it('allows escapes inside double quotes', () => {
    expect(words(`echo "say \\"hi\\"" "a\\nb"`)).toEqual(['echo', 'say "hi"', 'a\\nb']);
  });

  it('joins adjacent quoted and unquoted parts into one word', () => {
    expect(words(`echo pre'fix'"ed"`)).toEqual(['echo', 'prefixed']);
  });

  it('treats an empty quoted string as a word', () => {
    expect(words(`echo '' x`)).toEqual(['echo', '', 'x']);
  });

  it('escapes a space with a backslash', () => {
    expect(words('cat my\\ file')).toEqual(['cat', 'my file']);
  });

  it('reports an unclosed quote with the bash wording', () => {
    expect(parseCommandLine(`echo 'oops`)).toEqual({
      ok: false,
      error: "unexpected EOF while looking for matching `''",
    });
    expect(parseCommandLine('echo "oops')).toEqual({
      ok: false,
      error: 'unexpected EOF while looking for matching `"\'',
    });
  });
});
