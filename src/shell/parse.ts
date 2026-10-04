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
