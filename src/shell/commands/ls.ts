import { ERRORS, type DirNode, type FsNode } from '../../fs/FileSystem';
import { dirname } from '../../fs/path';
import { canAccess, modeString } from '../../fs/permissions';
import { compareNames, formatColumns, type ColumnItem } from '../format';
import type { Command, Session } from '../types';
import { denied } from './denied';

// Ubuntu's default LS_COLORS for the common cases.
const COLOR = {
  dir: '\x1b[01;34m',
  stickyOtherWritable: '\x1b[30;42m',
  exec: '\x1b[01;32m',
  reset: '\x1b[0m',
};

const SHORT_FLAGS: Record<string, keyof Flags> = {
  a: 'all',
  A: 'almostAll',
  l: 'long',
  d: 'directory',
  h: 'human',
  '1': 'onePerLine',
};

const LONG_FLAGS: Record<string, keyof Flags> = {
  '--all': 'all',
  '--almost-all': 'almostAll',
  '--directory': 'directory',
  '--human-readable': 'human',
};

interface Flags {
  all: boolean;
  almostAll: boolean;
  long: boolean;
  directory: boolean;
  human: boolean;
  onePerLine: boolean;
}

/**
 * One line of output: a name plus its node. Without execute permission on the
 * directory only the name and type are known (as from readdir), so `node` is unset.
 */
interface Entry {
  name: string;
  node?: FsNode;
  type?: 'file' | 'dir';
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SIX_MONTHS_MS = (365.2425 / 2) * 24 * 60 * 60 * 1000;

function colorize(name: string, node?: FsNode): string {
  if (!node) return name;
  if (node.type === 'dir') {
    const color = (node.mode & 0o1002) === 0o1002 ? COLOR.stickyOtherWritable : COLOR.dir;
    return color + name + COLOR.reset;
  }
  if (node.mode & 0o111) return COLOR.exec + name + COLOR.reset;
  return name;
}

function byteSize(node: FsNode): number {
  return node.type === 'dir' ? 4096 : new TextEncoder().encode(node.content).length;
}

/** Disk usage in 1K blocks, as counted in the "total" line (4K filesystem blocks). */
function blocks(node: FsNode): number {
  return Math.ceil(byteSize(node) / 4096) * 4;
}

function linkCount(node: FsNode): number {
  if (node.type === 'file') return 1;
  let subdirs = 0;
  for (const child of node.children.values()) if (child.type === 'dir') subdirs++;
  return 2 + subdirs;
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return String(bytes);
  const units = ['K', 'M', 'G', 'T'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  // GNU rounds up, with one decimal below 10.
  const shown = value < 10 ? (Math.ceil(value * 10) / 10).toFixed(1) : String(Math.ceil(value));
  return shown + units[unit];
}

function formatDate(mtime: Date, now: Date): string {
  const day = String(mtime.getDate()).padStart(2, ' ');
  const month = MONTHS[mtime.getMonth()];
  const age = now.getTime() - mtime.getTime();
  if (age >= 0 && age < SIX_MONTHS_MS) {
    const hh = String(mtime.getHours()).padStart(2, '0');
    const mm = String(mtime.getMinutes()).padStart(2, '0');
    return `${month} ${day} ${hh}:${mm}`;
  }
  return `${month} ${day}  ${mtime.getFullYear()}`;
}

function formatLong(entries: Entry[], flags: Flags, now: Date): string {
  const rows = entries.map(({ name, node, type }) => {
    if (!node) return { mode: `${type === 'dir' ? 'd' : '-'}?????????`, links: '?', owner: '?', group: '?', size: '?', date: '           ?', name };
    const size = byteSize(node);
    return {
      mode: modeString(node.type, node.mode),
      links: String(linkCount(node)),
      owner: node.owner,
      group: node.group,
      size: flags.human ? humanSize(size) : String(size),
      date: formatDate(node.mtime, now),
      name: colorize(name, node),
    };
  });
  const width = (key: 'links' | 'owner' | 'group' | 'size') => Math.max(...rows.map((r) => r[key].length));
  const w = { links: width('links'), owner: width('owner'), group: width('group'), size: width('size') };
  return rows
    .map(
      (r) =>
        `${r.mode} ${r.links.padStart(w.links)} ${r.owner.padEnd(w.owner)} ${r.group.padEnd(w.group)} ` +
        `${r.size.padStart(w.size)} ${r.date} ${r.name}\n`,
    )
    .join('');
}

function formatEntries(entries: Entry[], flags: Flags, session: Session): string {
  if (entries.length === 0) return '';
  if (flags.long) return formatLong(entries, flags, session.machine.clock);
  const items: ColumnItem[] = entries.map((e) => ({ display: colorize(e.name, e.node), width: e.name.length }));
  if (flags.onePerLine) return items.map((i) => i.display + '\n').join('');
  return formatColumns(items, session.columns);
}

function parseArgs(args: string[]): { flags: Flags; operands: string[] } | { error: string } {
  const flags: Flags = { all: false, almostAll: false, long: false, directory: false, human: false, onePerLine: false };
  const operands: string[] = [];
  let optionsDone = false;
  for (const arg of args) {
    if (optionsDone || arg === '-' || !arg.startsWith('-')) {
      operands.push(arg);
    } else if (arg === '--') {
      optionsDone = true;
    } else if (arg.startsWith('--')) {
      const flag = LONG_FLAGS[arg];
      if (!flag) return { error: `ls: unrecognized option '${arg}'\nTry 'ls --help' for more information.\n` };
      flags[flag] = true;
    } else {
      for (const ch of arg.slice(1)) {
        const flag = SHORT_FLAGS[ch];
        if (!flag) return { error: `ls: invalid option -- '${ch}'\nTry 'ls --help' for more information.\n` };
        flags[flag] = true;
      }
    }
  }
  return { flags, operands };
}

export const ls: Command = {
  name: 'ls',
  summary: 'List files. -a shows hidden files, -l shows owners and permissions',
  run({ args, out, err, session }) {
    const parsed = parseArgs(args);
    if ('error' in parsed) {
      err(parsed.error);
      return 2;
    }
    const { flags } = parsed;
    const operands = parsed.operands.length > 0 ? parsed.operands : ['.'];
    const who = session.credentials();
    let status = 0;

    const files: Entry[] = [];
    const dirs: { label: string; path: string; node: DirNode }[] = [];
    for (const arg of operands) {
      const found = session.lookup(arg);
      if (!found.ok) {
        err(`ls: cannot access '${arg}': ${ERRORS[found.code]}\n`);
        if (found.code === 'EACCES') denied(session, arg);
        status = 2;
      } else if (found.node.type === 'dir' && !flags.directory) {
        dirs.push({ label: arg, path: session.resolve(arg), node: found.node });
      } else {
        files.push({ name: arg, node: found.node });
      }
    }

    const sections: string[] = [];
    files.sort((a, b) => compareNames(a.name, b.name));
    if (files.length > 0) sections.push(formatEntries(files, flags, session));

    dirs.sort((a, b) => compareNames(a.label, b.label));
    const showHeaders = operands.length > 1;
    for (const { label, path, node } of dirs) {
      if (!canAccess(node, who, 'r')) {
        err(`ls: cannot open directory '${label}': ${ERRORS.EACCES}\n`);
        session.emit({ type: 'denied', path, user: session.user });
        status = 2;
        continue;
      }
      // Without x on the directory, names can be read but nothing about the files.
      const canInspect = canAccess(node, who, 'x');

      let names = [...node.children.keys()];
      if (!flags.all && !flags.almostAll) names = names.filter((n) => !n.startsWith('.'));
      const entries: Entry[] = names.map((n) => {
        const child = node.children.get(n)!;
        return { name: n, node: canInspect ? child : undefined, type: child.type };
      });
      if (flags.all) {
        const parent = session.fs.lookup(dirname(path));
        const parentNode = parent.ok ? parent.node : node;
        entries.push(
          { name: '.', node: canInspect ? node : undefined, type: 'dir' },
          { name: '..', node: canInspect ? parentNode : undefined, type: 'dir' },
        );
      }
      entries.sort((a, b) => compareNames(a.name, b.name));

      if (!canInspect && flags.long) {
        for (const e of entries) err(`ls: cannot access '${label}/${e.name}': ${ERRORS.EACCES}\n`);
        status = 1;
      }

      let listing = formatEntries(entries, flags, session);
      if (flags.long) {
        const total = entries.reduce((sum, e) => sum + (e.node ? blocks(e.node) : 0), 0);
        listing = `total ${flags.human ? humanSize(total * 1024) : total}\n` + listing;
      }
      sections.push(showHeaders ? `${label}:\n${listing}` : listing);
      session.emit({
        type: 'list',
        path,
        all: flags.all || flags.almostAll,
        long: flags.long,
        user: session.user,
      });
    }
    out(sections.join('\n'));
    return status;
  },
};
