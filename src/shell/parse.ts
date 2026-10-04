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

/** Where a command's output goes: `> file` (overwrite) or `>> file` (append). */
export interface Redirect {
  file: Word;
  append: boolean;
}

/** One command in a pipeline: its words and an optional output redirection. */
export interface PipeSegment {
  words: Word[];
  redirect?: Redirect;
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
 * `||`, each command with an optional `>`/`>>` redirection. Quoting works as in
 * a single command; the operators count only when not quoted or escaped. Words
 * keep their quoting so the shell can expand them afterwards.
 */
export function parseProgram(line: string): ProgramResult {
  const stages: Stage[] = [];
  let pipeline: Pipeline = [];
  let words: Word[] = [];
  let redirect: Redirect | undefined;
  let fragments: Word = [];
  let inWord = false;
  let connector: Connector = 'first';
  // The operator most recently consumed, to name the token if the line ends on it.
  let lastOp: '|' | ';' | '&&' | '||' | null = null;
  // After `>` or `>>` the next word is the file name, not a command argument.
  let awaitingFile: false | { append: boolean } = false;
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
    if (awaitingFile) {
      redirect = { file: fragments, append: awaitingFile.append };
      awaitingFile = false;
    } else {
      words.push(fragments);
    }
    fragments = [];
    inWord = false;
  };

  const endPipe = (operator: string): ProgramResult | null => {
    endWord();
    if (awaitingFile) return { ok: false, error: syntaxError(operator) };
    if (words.length === 0 && !redirect) return { ok: false, error: syntaxError(operator) };
    pipeline.push({ words, redirect });
    words = [];
    redirect = undefined;
    return null;
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

    if (ch === '>') {
      endWord();
      const append = line[i + 1] === '>';
      awaitingFile = { append };
      i += append ? 2 : 1;
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
  if (awaitingFile) return { ok: false, error: syntaxError('newline') };
  const segmentPending = words.length > 0 || redirect !== undefined;
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
