import { describe, expect, it } from 'vitest';
import { parseCommandLine, parseProgram, type Word } from './parse';

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

/** The literal text of a word (its fragments joined), before any expansion. */
const literal = (word: Word) => word.map((f) => f.text).join('');

/** A readable view of parseProgram's output: each stage's connector and its segments' literal words. */
const program = (line: string) => {
  const r = parseProgram(line);
  if (!r.ok) throw new Error(r.error);
  return r.stages.map((stage) => ({
    connector: stage.connector,
    pipeline: stage.pipeline.map((seg) => ({
      words: seg.words.map(literal),
      redirect: seg.redirect ? { file: literal(seg.redirect.file), append: seg.redirect.append } : undefined,
    })),
  }));
};

describe('parseProgram', () => {
  it('reads a single command as one stage', () => {
    expect(program('ls -la /home')).toEqual([
      { connector: 'first', pipeline: [{ words: ['ls', '-la', '/home'], redirect: undefined }] },
    ]);
  });

  it('splits a pipeline on | into segments', () => {
    const [stage] = program('cat log | grep error | wc -l');
    expect(stage.pipeline.map((s) => s.words)).toEqual([['cat', 'log'], ['grep', 'error'], ['wc', '-l']]);
  });

  it('works without spaces around the pipe', () => {
    const [stage] = program('echo hi|cat');
    expect(stage.pipeline.map((s) => s.words)).toEqual([['echo', 'hi'], ['cat']]);
  });

  it('reads > as overwrite and >> as append redirection', () => {
    expect(program('echo hi > out.txt')[0].pipeline[0].redirect).toEqual({ file: 'out.txt', append: false });
    expect(program('echo hi>>out.txt')[0].pipeline[0].redirect).toEqual({ file: 'out.txt', append: true });
  });

  it('chains stages with ; && and ||', () => {
    const stages = program('a ; b && c || d');
    expect(stages.map((s) => [s.connector, s.pipeline[0].words[0]])).toEqual([
      ['first', 'a'],
      [';', 'b'],
      ['&&', 'c'],
      ['||', 'd'],
    ]);
  });

  it('allows a trailing semicolon', () => {
    expect(program('echo hi ;').map((s) => s.pipeline[0].words)).toEqual([['echo', 'hi']]);
  });

  it('keeps quoted and escaped operators as literal text', () => {
    expect(program(`echo 'a | b ; c'`)[0].pipeline[0].words).toEqual(['echo', 'a | b ; c']);
    expect(program('echo a\\|b')[0].pipeline[0].words).toEqual(['echo', 'a|b']);
  });

  it('is an empty program for a blank line', () => {
    expect(program('   ')).toEqual([]);
  });

  it('reports a leading pipe, a trailing pipe and a dangling &&', () => {
    expect(parseProgram('| grep x')).toEqual({ ok: false, error: "syntax error near unexpected token `|'" });
    expect(parseProgram('grep x |')).toEqual({ ok: false, error: "syntax error near unexpected token `|'" });
    expect(parseProgram('echo hi &&')).toEqual({ ok: false, error: "syntax error near unexpected token `&&'" });
  });

  it('reports a redirection with no file name', () => {
    expect(parseProgram('echo hi >')).toEqual({ ok: false, error: "syntax error near unexpected token `newline'" });
  });

  it('records how each word was quoted', () => {
    const r = parseProgram(`echo "$HOME" '*' plain`);
    if (!r.ok) throw new Error(r.error);
    const quotes = r.stages[0].pipeline[0].words.map((w) => w.map((f) => f.quote));
    expect(quotes).toEqual([['none'], ['double'], ['single'], ['none']]);
  });
});
