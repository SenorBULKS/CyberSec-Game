/**
 * Splits a command line into words the way a POSIX shell does for simple
 * commands: whitespace separates words, single quotes keep everything literal,
 * double quotes keep spaces but allow backslash escapes, and a backslash
 * outside quotes escapes the next character.
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

/** Where a command's output goes: `> file` (overwrite) or `>> file` (append). */
export interface Redirect {
  file: string;
  append: boolean;
}

/** One command in a pipeline: its words and an optional output redirection. */
export interface PipeSegment {
  words: string[];
  redirect?: Redirect;
}

export type PipelineResult = { ok: true; segments: PipeSegment[] } | { ok: false; error: string };

const syntaxError = (token: string) => `syntax error near unexpected token \`${token}'`;

/**
 * Parses a line into a pipeline of commands joined by `|`, each with an
 * optional `>`/`>>` redirection. Quoting works exactly as in a single command;
 * `|`, `>` and `>>` are operators only when they are not quoted or escaped.
 */
export function parsePipeline(line: string): PipelineResult {
  const segments: PipeSegment[] = [];
  let words: string[] = [];
  let redirect: Redirect | undefined;
  let current = '';
  let inWord = false;
  // After `>` or `>>` the next word is the file name, not a command argument.
  let awaitingFile: false | { append: boolean } = false;
  let i = 0;

  const endWord = () => {
    if (!inWord) return true;
    if (awaitingFile) {
      redirect = { file: current, append: awaitingFile.append };
      awaitingFile = false;
    } else {
      words.push(current);
    }
    current = '';
    inWord = false;
    return true;
  };

  const endSegment = (atEnd: boolean): PipelineResult | null => {
    endWord();
    if (awaitingFile) return { ok: false, error: syntaxError('newline') };
    if (words.length === 0 && !redirect) {
      return { ok: false, error: syntaxError(atEnd && segments.length === 0 ? 'newline' : '|') };
    }
    segments.push({ words, redirect });
    words = [];
    redirect = undefined;
    return null;
  };

  while (i < line.length) {
    const ch = line[i];

    if (ch === ' ' || ch === '\t') {
      endWord();
      i++;
      continue;
    }

    if (ch === '|') {
      const err = endSegment(false);
      if (err) return err;
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

  // Nothing typed at all is a valid empty pipeline (a blank line).
  endWord();
  if (!inWordLeft(words, redirect, awaitingFile, segments)) return { ok: true, segments: [] };
  const err = endSegment(true);
  if (err) return err;
  return { ok: true, segments };
}

/** True unless the line was blank: there is a pending command, redirect, or an earlier segment. */
function inWordLeft(
  words: string[],
  redirect: Redirect | undefined,
  awaitingFile: false | { append: boolean },
  segments: PipeSegment[],
): boolean {
  return words.length > 0 || redirect !== undefined || awaitingFile !== false || segments.length > 0;
}
