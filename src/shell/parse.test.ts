import { describe, expect, it } from 'vitest';
import { parseCommandLine, parseProgram, type RedirectOp, type Word } from './parse';

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

/** A readable view of one redirection, with its file name as literal text. */
const redir = (r: RedirectOp) =>
  r.kind === 'dup'
    ? { kind: r.kind, fd: r.fd, toFd: r.toFd }
    : r.kind === 'in'
      ? { kind: r.kind, file: literal(r.file) }
      : r.kind === 'both'
        ? { kind: r.kind, file: literal(r.file), append: r.append }
        : { kind: r.kind, fd: r.fd, file: literal(r.file), append: r.append };

/** A readable view of parseProgram's output: each stage's connector and its segments' literal words. */
const program = (line: string) => {
  const r = parseProgram(line);
  if (!r.ok) throw new Error(r.error);
  return r.stages.map((stage) => ({
    connector: stage.connector,
    pipeline: stage.pipeline.map((seg) => ({
      words: seg.words.map(literal),
      redirects: seg.redirects.map(redir),
    })),
  }));
};

/** The redirections parsed for a single command. */
const redirects = (line: string) => program(line)[0].pipeline[0].redirects;

describe('parseProgram', () => {
  it('reads a single command as one stage', () => {
    expect(program('ls -la /home')).toEqual([
      { connector: 'first', pipeline: [{ words: ['ls', '-la', '/home'], redirects: [] }] },
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
    expect(redirects('echo hi > out.txt')).toEqual([{ kind: 'out', fd: 1, file: 'out.txt', append: false }]);
    expect(redirects('echo hi>>out.txt')).toEqual([{ kind: 'out', fd: 1, file: 'out.txt', append: true }]);
  });

  it('reads stderr, both-stream, input and dup redirections', () => {
    expect(redirects('cmd 2> err.log')).toEqual([{ kind: 'out', fd: 2, file: 'err.log', append: false }]);
    expect(redirects('cmd 2>>err.log')).toEqual([{ kind: 'out', fd: 2, file: 'err.log', append: true }]);
    expect(redirects('cmd > out 2>&1')).toEqual([
      { kind: 'out', fd: 1, file: 'out', append: false },
      { kind: 'dup', fd: 2, toFd: 1 },
    ]);
    expect(redirects('find / 2>/dev/null')).toEqual([{ kind: 'out', fd: 2, file: '/dev/null', append: false }]);
    expect(redirects('cmd &> all.log')).toEqual([{ kind: 'both', file: 'all.log', append: false }]);
    expect(redirects('cmd &>>all.log')).toEqual([{ kind: 'both', file: 'all.log', append: true }]);
    expect(redirects('cat < in.txt')).toEqual([{ kind: 'in', file: 'in.txt' }]);
  });

  it('treats a number glued to a word as part of the word, not a descriptor', () => {
    const [stage] = program('echo abc2>out');
    expect(stage.pipeline[0].words).toEqual(['echo', 'abc2']);
    expect(stage.pipeline[0].redirects).toEqual([{ kind: 'out', fd: 1, file: 'out', append: false }]);
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
