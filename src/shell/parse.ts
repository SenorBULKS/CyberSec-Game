/**
 * Splits a command line into words the way a POSIX shell does for simple
 * commands: whitespace separates words, single quotes keep everything literal,
 * double quotes keep spaces but allow backslash escapes, and a backslash
 * outside quotes escapes the next character.
 *
 * This is kept for its own tests; the shell uses {@link parseProgram}, which
 * also records how each piece was quoted so expansion can respect it.
 */
export type ParseResult = { ok: true; words: string[] } | { ok: false; error: string };

export function parseCommandLine(line: string): ParseResult {
  const words: string[] = [];
  let current = '';
  let inWord = false;
  let i = 0;

  while (i < line.length) {
    const ch = line[i];

    if (ch === ' ' || ch === '\t') {
      if (inWord) {
        words.push(current);
        current = '';
        inWord = false;
      }
      i++;
      continue;
    }

    inWord = true;

    if (ch === "'") {
      const end = line.indexOf("'", i + 1);
      if (end === -1) return { ok: false, error: "unexpected EOF while looking for matching `''" };
      current += line.slice(i + 1, end);
      i = end + 1;
      continue;
    }

    if (ch === '"') {
      i++;
      let closed = false;
      while (i < line.length) {
        const c = line[i];
        if (c === '"') {
          closed = true;
          i++;
          break;
        }
        if (c === '\\' && i + 1 < line.length && '"\\$`'.includes(line[i + 1])) {
          current += line[i + 1];
          i += 2;
          continue;
        }
        current += c;
        i++;
      }
      if (!closed) return { ok: false, error: 'unexpected EOF while looking for matching `"\'' };
      continue;
    }

    if (ch === '\\') {
      if (i + 1 < line.length) current += line[i + 1];
      i += 2;
      continue;
    }

    current += ch;
    i++;
  }

  if (inWord) words.push(current);
  return { ok: true, words };
}

/**
 * A piece of a word, tagged with how it was quoted. Expansion of `$VAR`, `~`
 * and `*` happens only in unquoted pieces (and `$VAR` in double-quoted ones),
 * exactly as a real shell decides what to expand.
 */
export interface Fragment {
  text: string;
  quote: 'none' | 'single' | 'double';
}

/** A single word before expansion: its fragments in order. */
export type Word = Fragment[];

/**
 * One redirection on a command, before the file name is expanded:
 * - `out`:  `> file`, `>> file`, `2> file`, `2>> file` — a stream to a file.
 * - `in`:   `< file` — a file as standard input.
 * - `both`: `&> file`, `&>> file` — both stdout and stderr to one file.
 * - `dup`:  `2>&1`, `1>&2` — point one stream at where another is going.
 */
export type RedirectOp =
  | { kind: 'out'; fd: 1 | 2; file: Word; append: boolean }
  | { kind: 'in'; file: Word }
  | { kind: 'both'; file: Word; append: boolean }
  | { kind: 'dup'; fd: 1 | 2; toFd: 1 | 2 };

/** One command in a pipeline: its words and any redirections, in the order written. */
export interface PipeSegment {
  words: Word[];
  redirects: RedirectOp[];
}

export type Pipeline = PipeSegment[];

/** How a pipeline connects to the one before it: `;` always, `&&`/`||` on success/failure. */
export type Connector = 'first' | ';' | '&&' | '||';

/** One pipeline in a line, with the operator that joined it to the previous one. */
export interface Stage {
  connector: Connector;
  pipeline: Pipeline;
}

export type ProgramResult = { ok: true; stages: Stage[] } | { ok: false; error: string };

const syntaxError = (token: string) => `syntax error near unexpected token \`${token}'`;

/**
 * Parses a whole line: pipelines joined by `|`, chained with `;`, `&&` and
 * `||`, each command with redirections (`>`, `>>`, `2>`, `&>`, `<`, `2>&1`).
 * Quoting works as in a single command; the operators count only when not
 * quoted or escaped. Words keep their quoting so the shell can expand them.
 */
export function parseProgram(line: string): ProgramResult {
  const stages: Stage[] = [];
  let pipeline: Pipeline = [];
  let words: Word[] = [];
  let redirects: RedirectOp[] = [];
  let fragments: Word = [];
  let inWord = false;
  let connector: Connector = 'first';
  // The operator most recently consumed, to name the token if the line ends on it.
  let lastOp: '|' | ';' | '&&' | '||' | null = null;
  // After a redirection operator the next word is its file name, not an argument.
  type Pending = { kind: 'out'; fd: 1 | 2; append: boolean } | { kind: 'in' } | { kind: 'both'; append: boolean };
  let pendingFile: Pending | null = null;
  let i = 0;

  const push = (text: string, quote: Fragment['quote']) => {
    inWord = true;
    lastOp = null;
    const last = fragments[fragments.length - 1];
    // Merge runs of the same quoting into one fragment, so a plain word is one piece.
    if (last && last.quote === quote) last.text += text;
    else if (text !== '' || quote !== 'none') fragments.push({ text, quote });
  };

  const endWord = () => {
    if (!inWord) return;
    if (pendingFile) {
      if (pendingFile.kind === 'out') redirects.push({ kind: 'out', fd: pendingFile.fd, file: fragments, append: pendingFile.append });
      else if (pendingFile.kind === 'both') redirects.push({ kind: 'both', file: fragments, append: pendingFile.append });
      else redirects.push({ kind: 'in', file: fragments });
      pendingFile = null;
    } else {
      words.push(fragments);
    }
    fragments = [];
    inWord = false;
  };

  const endPipe = (operator: string): ProgramResult | null => {
    endWord();
    if (pendingFile) return { ok: false, error: syntaxError(operator) };
    if (words.length === 0 && redirects.length === 0) return { ok: false, error: syntaxError(operator) };
    pipeline.push({ words, redirects });
    words = [];
    redirects = [];
    return null;
  };

  /** A bare `1` or `2` typed immediately before `>` names the file descriptor. */
  const takeFd = (): 1 | 2 => {
    if (inWord && fragments.length === 1 && fragments[0].quote === 'none' && /^[12]$/.test(fragments[0].text)) {
      const fd = Number(fragments[0].text) as 1 | 2;
      fragments = [];
      inWord = false;
      return fd;
    }
    return 1;
  };

  const endStage = (operator: string): ProgramResult | null => {
    const err = endPipe(operator);
    if (err) return err;
    stages.push({ connector, pipeline });
    pipeline = [];
    return null;
  };

  while (i < line.length) {
    const ch = line[i];

    if (ch === ' ' || ch === '\t') {
      endWord();
      i++;
      continue;
    }

    if (ch === '|' && line[i + 1] === '|') {
      const err = endStage('||');
      if (err) return err;
      connector = '||';
      lastOp = '||';
      i += 2;
      continue;
    }

    if (ch === '&' && line[i + 1] === '&') {
      const err = endStage('&&');
      if (err) return err;
      connector = '&&';
      lastOp = '&&';
      i += 2;
      continue;
    }

    // `&>` / `&>>`: send both stdout and stderr to one file.
    if (ch === '&' && line[i + 1] === '>') {
      endWord();
      const append = line[i + 2] === '>';
      pendingFile = { kind: 'both', append };
      i += append ? 3 : 2;
      continue;
    }

    if (ch === '&') return { ok: false, error: syntaxError('&') };

    if (ch === ';') {
      const err = endStage(';');
      if (err) return err;
      connector = ';';
      lastOp = ';';
      i++;
      continue;
    }

    if (ch === '|') {
      const err = endPipe('|');
      if (err) return err;
      lastOp = '|';
      i++;
      continue;
    }

    if (ch === '<') {
      endWord();
      pendingFile = { kind: 'in' };
      i++;
      continue;
    }

    if (ch === '>') {
      const fd = takeFd();
      endWord();
      const append = line[i + 1] === '>';
      i += append ? 2 : 1;
      // `2>&1` / `>&2`: point this descriptor at wherever another one is going.
      if (line[i] === '&' && (line[i + 1] === '1' || line[i + 1] === '2')) {
        redirects.push({ kind: 'dup', fd, toFd: Number(line[i + 1]) as 1 | 2 });
        i += 2;
        continue;
      }
      pendingFile = { kind: 'out', fd, append };
      continue;
    }

    if (ch === "'") {
      const end = line.indexOf("'", i + 1);
      if (end === -1) return { ok: false, error: "unexpected EOF while looking for matching `''" };
      push(line.slice(i + 1, end), 'single');
      i = end + 1;
      continue;
    }

    if (ch === '"') {
      i++;
      let text = '';
      let closed = false;
      while (i < line.length) {
        const c = line[i];
        if (c === '"') {
          closed = true;
          i++;
          break;
        }
        if (c === '\\' && i + 1 < line.length && '"\\$`'.includes(line[i + 1])) {
          text += line[i + 1];
          i += 2;
          continue;
        }
        text += c;
        i++;
      }
      if (!closed) return { ok: false, error: 'unexpected EOF while looking for matching `"\'' };
      push(text, 'double');
      continue;
    }

    if (ch === '\\') {
      // An escaped character is literal, like a one-character single-quote.
      if (i + 1 < line.length) push(line[i + 1], 'single');
      i += 2;
      continue;
    }

    push(ch, 'none');
    i++;
  }

  endWord();
  if (pendingFile) return { ok: false, error: syntaxError('newline') };
  const segmentPending = words.length > 0 || redirects.length > 0;
  if (!segmentPending) {
    // The line ended right after an operator, or is blank.
    if (lastOp === null) return { ok: true, stages: [] };
    if (lastOp === ';') return { ok: true, stages };
    // A trailing |, && or || has nothing to run after it.
    return { ok: false, error: syntaxError(lastOp) };
  }
  const err = endStage('newline');
  if (err) return err;
  return { ok: true, stages };
}
