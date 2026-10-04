import { describe, expect, it } from 'vitest';
import { parseCommandLine, parsePipeline } from './parse';

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

const pipeline = (line: string) => {
  const r = parsePipeline(line);
  if (!r.ok) throw new Error(r.error);
  return r.segments;
};

describe('parsePipeline', () => {
  it('reads a single command as one segment', () => {
    expect(pipeline('ls -la /home')).toEqual([{ words: ['ls', '-la', '/home'], redirect: undefined }]);
  });

  it('splits a pipeline on | into segments', () => {
    const segments = pipeline('cat log | grep error | wc -l');
    expect(segments.map((s) => s.words)).toEqual([['cat', 'log'], ['grep', 'error'], ['wc', '-l']]);
  });

  it('works without spaces around the pipe', () => {
    expect(pipeline('echo hi|cat').map((s) => s.words)).toEqual([['echo', 'hi'], ['cat']]);
  });

  it('reads > as overwrite redirection', () => {
    expect(pipeline('echo hi > out.txt')).toEqual([{ words: ['echo', 'hi'], redirect: { file: 'out.txt', append: false } }]);
  });

  it('reads >> as append redirection, with or without a space', () => {
    expect(pipeline('echo hi>>out.txt')).toEqual([{ words: ['echo', 'hi'], redirect: { file: 'out.txt', append: true } }]);
  });

  it('keeps a quoted pipe as literal text', () => {
    expect(pipeline(`echo 'a | b'`)).toEqual([{ words: ['echo', 'a | b'], redirect: undefined }]);
  });

  it('keeps an escaped pipe as literal text', () => {
    expect(pipeline('echo a\\|b').map((s) => s.words)).toEqual([['echo', 'a|b']]);
  });

  it('is an empty pipeline for a blank line', () => {
    expect(pipeline('   ')).toEqual([]);
  });

  it('reports a leading pipe as a syntax error', () => {
    expect(parsePipeline('| grep x')).toEqual({ ok: false, error: "syntax error near unexpected token `|'" });
  });

  it('reports a trailing pipe as a syntax error', () => {
    expect(parsePipeline('grep x |')).toEqual({ ok: false, error: "syntax error near unexpected token `|'" });
  });

  it('reports a redirection with no file name', () => {
    expect(parsePipeline('echo hi >')).toEqual({ ok: false, error: "syntax error near unexpected token `newline'" });
  });
});
