import type { Fragment, Word } from './parse';

/** What expansion needs from the shell: variable values, home directories and globbing. */
export interface ExpandContext {
  /** The value of $NAME, or undefined if it is not set (expands to empty, as in bash). */
  env: (name: string) => string | undefined;
  /** The home directory of a user for `~user`, or undefined if there is no such user. */
  homeFor: (user: string) => string | undefined;
  /** The current user's home, for a bare `~`. */
  home: string;
  /**
   * Expands a pathname pattern against the filesystem. A `*` or `?` to match is
   * left bare; any other character is backslash-escaped. Returns the matches
   * (sorted), or [] when nothing matches so the caller can fall back to the
   * literal word, exactly as a shell with nullglob off does.
   */
  glob: (pattern: string) => string[];
}

const NAME_START = /[A-Za-z_]/;
const NAME_CHAR = /[A-Za-z0-9_]/;

/** Reads a variable name after a `$`, either `$name` or `${name}`. Returns the name and how many chars it spanned. */
function readVarName(text: string, at: number): { name: string; length: number } | null {
  if (text[at] === '{') {
    const end = text.indexOf('}', at);
    if (end === -1) return null;
    return { name: text.slice(at + 1, end), length: end - at + 1 };
  }
  // $? is the last command's exit status.
  if (text[at] === '?') return { name: '?', length: 1 };
  if (!NAME_START.test(text[at] ?? '')) return null;
  let j = at;
  while (j < text.length && NAME_CHAR.test(text[j])) j++;
  return { name: text.slice(at, j), length: j - at };
}

/** Escapes a run of literal text so the globber treats every character literally. */
function escapeLiteral(text: string): string {
  return text.replace(/[\\*?[\]]/g, '\\$&');
}

/** Expands `$VAR` in a piece of text; the result is literal (not eligible for globbing). */
function expandVars(text: string, ctx: ExpandContext): string {
  let out = '';
  let i = 0;
  while (i < text.length) {
    if (text[i] === '$') {
      const found = readVarName(text, i + 1);
      if (found) {
        out += ctx.env(found.name) ?? '';
        i += 1 + found.length;
        continue;
      }
    }
    out += text[i];
    i++;
  }
  return out;
}

/** Expands a leading `~` or `~user` in an unquoted first fragment. Returns the home and the rest. */
function expandTilde(text: string, ctx: ExpandContext): string {
  if (text[0] !== '~') return text;
  const slash = text.indexOf('/');
  const name = text.slice(1, slash === -1 ? undefined : slash);
  const rest = slash === -1 ? '' : text.slice(slash);
  if (name === '') return ctx.home + rest;
  const home = ctx.homeFor(name);
  return home ? home + rest : text;
}

/**
 * Expands one parsed word into the arguments it yields: variables, a leading
 * tilde, then pathname globbing — each respecting how the piece was quoted.
 */
export function expandWord(word: Word, ctx: ExpandContext): string[] {
  let pattern = '';
  let hasGlob = false;
  word.forEach((fragment: Fragment, index) => {
    if (fragment.quote === 'single') {
      pattern += escapeLiteral(fragment.text);
      return;
    }
    if (fragment.quote === 'double') {
      pattern += escapeLiteral(expandVars(fragment.text, ctx));
      return;
    }
    // Unquoted: a leading ~ on the first fragment, then variables; the literally
    // typed * and ? stay bare so they can match, everything else is literal.
    let text = fragment.text;
    if (index === 0) text = expandTilde(text, ctx);
    let i = 0;
    while (i < text.length) {
      const ch = text[i];
      if (ch === '$') {
        const found = readVarName(text, i + 1);
        if (found) {
          pattern += escapeLiteral(ctx.env(found.name) ?? '');
          i += 1 + found.length;
          continue;
        }
      }
      if (ch === '*' || ch === '?') {
        pattern += ch;
        hasGlob = true;
      } else {
        pattern += escapeLiteral(ch);
      }
      i++;
    }
  });

  if (hasGlob) {
    const matches = ctx.glob(pattern);
    if (matches.length > 0) return matches;
  }
  return [unescape(pattern)];
}

/** Removes the globber escaping to get the literal string a non-matching pattern stands for. */
function unescape(pattern: string): string {
  let out = '';
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] === '\\' && i + 1 < pattern.length) {
      out += pattern[i + 1];
      i++;
    } else {
      out += pattern[i];
    }
  }
  return out;
}

/** Turns one path component of a glob pattern (already escaped) into a matcher, honouring the leading-dot rule. */
export function compileGlobComponent(component: string): { test: (name: string) => boolean; matchesDotFiles: boolean } {
  let regex = '';
  let matchesDotFiles = false;
  let first = true;
  for (let i = 0; i < component.length; i++) {
    const ch = component[i];
    if (ch === '\\' && i + 1 < component.length) {
      regex += component[i + 1].replace(/[.+^${}()|[\]\\]/g, '\\$&');
      if (first && component[i + 1] === '.') matchesDotFiles = true;
      i++;
      first = false;
      continue;
    }
    if (ch === '*') regex += '[^/]*';
    else if (ch === '?') regex += '[^/]';
    else {
      regex += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
      if (first && ch === '.') matchesDotFiles = true;
    }
    first = false;
  }
  const compiled = new RegExp(`^${regex}$`);
  return { test: (name) => compiled.test(name), matchesDotFiles };
}

/** Whether a component has an unescaped glob metacharacter, i.e. it needs matching rather than a plain lookup. */
export function componentHasGlob(component: string): boolean {
  for (let i = 0; i < component.length; i++) {
    if (component[i] === '\\') {
      i++;
      continue;
    }
    if (component[i] === '*' || component[i] === '?') return true;
  }
  return false;
}
