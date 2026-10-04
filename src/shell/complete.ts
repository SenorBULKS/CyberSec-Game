import { canAccess } from '../fs/permissions';
import { compareNames } from './format';
import type { Session } from './types';

export interface Completion {
  /** Text to insert at the cursor (may be empty). */
  insert: string;
  /** Every match, for listing when the completion is ambiguous. Directories end in '/'. */
  candidates: string[];
}

const NONE: Completion = { insert: '', candidates: [] };

function commonPrefix(words: string[]): string {
  let prefix = words[0] ?? '';
  for (const w of words) while (!w.startsWith(prefix)) prefix = prefix.slice(0, -1);
  return prefix;
}

const escape = (text: string) => text.replace(/([ '"\\$`])/g, '\\$1');

/** Finds where the word under the cursor starts, skipping backslash-escaped spaces. */
function wordStart(before: string): number {
  for (let i = before.length - 1; i >= 0; i--) {
    if (before[i] === ' ' && before[i - 1] !== '\\') return i + 1;
  }
  return 0;
}

/**
 * Bash-style Tab completion: command names in the first word, file and
 * directory names everywhere else. Only shows what the user may list.
 */
export function complete(session: Session, commandNames: string[], line: string, cursor: number): Completion {
  const before = line.slice(0, cursor);
  const start = wordStart(before);
  const word = before.slice(start).replace(/\\(.)/g, '$1');
  const isCommand = before.slice(0, start).trim() === '' && !word.includes('/');

  let base: string;
  let matches: { name: string; isDir: boolean }[];

  if (isCommand) {
    if (word === '') return NONE;
    base = word;
    matches = commandNames.filter((n) => n.startsWith(word)).map((name) => ({ name, isDir: false }));
  } else {
    const slash = word.lastIndexOf('/');
    const dirPart = word.slice(0, slash + 1);
    base = word.slice(slash + 1);
    const dir = session.lookup(dirPart === '' ? '.' : dirPart);
    if (!dir.ok || dir.node.type !== 'dir' || !canAccess(dir.node, session.credentials(), 'r')) return NONE;
    matches = [...dir.node.children.entries()]
      .filter(([name]) => name.startsWith(base) && (base.startsWith('.') || !name.startsWith('.')))
      .map(([name, node]) => ({ name, isDir: node.type === 'dir' }))
      .sort((a, b) => compareNames(a.name, b.name));
  }

  if (matches.length === 0) return NONE;
  if (matches.length === 1) {
    const [only] = matches;
    const suffix = only.isDir ? '/' : ' ';
    return { insert: escape(only.name.slice(base.length)) + suffix, candidates: [] };
  }
  const shared = commonPrefix(matches.map((m) => m.name));
  return {
    insert: escape(shared.slice(base.length)),
    candidates: matches.map((m) => m.name + (m.isDir ? '/' : '')),
  };
}
