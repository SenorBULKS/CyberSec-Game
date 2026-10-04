import { ERRORS, type DirNode, type FsNode } from '../../fs/FileSystem';
import { dirname, joinPath, splitPath } from '../../fs/path';
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

type ColorWhen = 'default' | 'never' | 'always' | 'auto';

/** The on/off flags, i.e. every flag except `color`, which carries a value. */
type BoolFlag = Exclude<keyof Flags, 'color'>;

const SHORT_FLAGS: Record<string, BoolFlag> = {
  a: 'all',
  A: 'almostAll',
  l: 'long',
  d: 'directory',
  h: 'human',
  R: 'recursive',
  '1': 'onePerLine',
};

const LONG_FLAGS: Record<string, BoolFlag> = {
  '--all': 'all',
  '--almost-all': 'almostAll',
  '--directory': 'directory',
  '--human-readable': 'human',
  '--recursive': 'recursive',
};

interface Flags {
  all: boolean;
  almostAll: boolean;
  long: boolean;
  directory: boolean;
  human: boolean;
  recursive: boolean;
  onePerLine: boolean;
  color: ColorWhen;
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

/** A directory to be listed, with the label to print for it. */
interface DirTarget {
  label: string;
  path: string;
  node: DirNode;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SIX_MONTHS_MS = (365.2425 / 2) * 24 * 60 * 60 * 1000;

/** A /dev/null-style character device, shown by ls with a 'c' and a major,minor pair. */
function charDevice(node: FsNode): boolean {
  return node.type === 'file' && node.device === 'null';
}

function colorize(name: string, node: FsNode | undefined, useColor: boolean): string {
  if (!useColor || !node) return name;
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

function formatLong(entries: Entry[], flags: Flags, now: Date, useColor: boolean): string {
  const rows = entries.map(({ name, node, type }) => {
    if (!node) return { mode: `${type === 'dir' ? 'd' : '-'}?????????`, links: '?', owner: '?', group: '?', size: '?', date: '           ?', name };
    // A character device shows a leading 'c' and a "major, minor" pair in place of a byte size.
    const dev = charDevice(node);
    const mode = dev ? 'c' + modeString('file', node.mode).slice(1) : modeString(node.type, node.mode);
    const size = dev ? '1, 3' : flags.human ? humanSize(byteSize(node)) : String(byteSize(node));
    return {
      mode,
      links: String(linkCount(node)),
      owner: node.owner,
      group: node.group,
      size,
      date: formatDate(node.mtime, now),
      name: colorize(name, node, useColor),
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

function formatEntries(entries: Entry[], flags: Flags, session: Session, useColor: boolean): string {
  if (entries.length === 0) return '';
  if (flags.long) return formatLong(entries, flags, session.machine.clock, useColor);
  const items: ColumnItem[] = entries.map((e) => ({ display: colorize(e.name, e.node, useColor), width: e.name.length }));
  if (flags.onePerLine) return items.map((i) => i.display + '\n').join('');
  return formatColumns(items, session.columns);
}

function parseArgs(args: string[]): { flags: Flags; operands: string[] } | { error: string } {
  const flags: Flags = {
    all: false,
    almostAll: false,
    long: false,
    directory: false,
    human: false,
    recursive: false,
    onePerLine: false,
    color: 'default',
  };
  const operands: string[] = [];
  let optionsDone = false;
  for (const arg of args) {
    if (optionsDone || arg === '-' || !arg.startsWith('-')) {
      operands.push(arg);
    } else if (arg === '--') {
      optionsDone = true;
    } else if (arg === '--color' || arg.startsWith('--color=')) {
      const when = arg.includes('=') ? arg.slice('--color='.length) : 'always';
      if (when === 'never' || when === 'no' || when === 'none') flags.color = 'never';
      else if (when === 'always' || when === 'yes' || when === 'force') flags.color = 'always';
      else if (when === 'auto' || when === 'tty' || when === 'if-tty') flags.color = 'auto';
      else
        return {
          error: `ls: invalid argument '${when}' for '--color'\nValid arguments are:\n  - 'always', 'yes', 'force'\n  - 'never', 'no', 'none'\n  - 'auto', 'tty', 'if-tty'\nTry 'ls --help' for more information.\n`,
        };
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

/** Lists one directory's contents, emits its `list` event, and reports its subdirectories. */
function listDir(
  target: DirTarget,
  flags: Flags,
  session: Session,
  useColor: boolean,
  err: (text: string) => void,
): { text: string | null; subdirs: DirTarget[]; status: number } {
  const who = session.credentials();
  if (!canAccess(target.node, who, 'r')) {
    err(`ls: cannot open directory '${target.label}': ${ERRORS.EACCES}\n`);
    session.emit({ type: 'denied', path: target.path, user: session.user });
    return { text: null, subdirs: [], status: 2 };
  }
  // Without x on the directory, names can be read but nothing about the files.
  const canInspect = canAccess(target.node, who, 'x');

  let names = [...target.node.children.keys()];
  if (!flags.all && !flags.almostAll) names = names.filter((n) => !n.startsWith('.'));
  const entries: Entry[] = names.map((n) => {
    const child = target.node.children.get(n)!;
    return { name: n, node: canInspect ? child : undefined, type: child.type };
  });
  if (flags.all) {
    const parent = session.fs.lookup(dirname(target.path));
    const parentNode = parent.ok ? parent.node : target.node;
    entries.push(
      { name: '.', node: canInspect ? target.node : undefined, type: 'dir' },
      { name: '..', node: canInspect ? parentNode : undefined, type: 'dir' },
    );
  }
  entries.sort((a, b) => compareNames(a.name, b.name));

  let status = 0;
  if (!canInspect && flags.long) {
    for (const e of entries) err(`ls: cannot access '${target.label}/${e.name}': ${ERRORS.EACCES}\n`);
    status = 1;
  }

  let listing = formatEntries(entries, flags, session, useColor);
  if (flags.long) {
    const total = entries.reduce((sum, e) => sum + (e.node ? blocks(e.node) : 0), 0);
    listing = `total ${flags.human ? humanSize(total * 1024) : total}\n` + listing;
  }
  session.emit({
    type: 'list',
    path: target.path,
    all: flags.all || flags.almostAll,
    long: flags.long,
    user: session.user,
  });

  // Real directories to recurse into (excluding the . and .. entries -a adds).
  const subdirs: DirTarget[] = canInspect
    ? entries
        .filter((e) => e.type === 'dir' && e.name !== '.' && e.name !== '..' && e.node)
        .map((e) => ({ label: `${target.label}/${e.name}`, path: joinPath([...splitPath(target.path), e.name]), node: e.node as DirNode }))
    : [];
  return { text: listing, subdirs, status };
}

export const ls: Command = {
  name: 'ls',
  summary: 'List files. -a shows hidden files, -l shows owners and permissions',
  run({ args, out, err, session, stdoutIsTerminal }) {
    const parsed = parseArgs(args);
    if ('error' in parsed) {
      err(parsed.error);
      return 2;
    }
    const { flags } = parsed;
    // Like GNU ls: when the output is a pipe or a file, fall back to one name per line.
    if (!stdoutIsTerminal && !flags.long) flags.onePerLine = true;
    const useColor =
      flags.color === 'never'
        ? false
        : flags.color === 'always'
          ? true
          : flags.color === 'auto'
            ? stdoutIsTerminal
            : true; // 'default': this shell colours like Ubuntu's aliased ls.
    const operands = parsed.operands.length > 0 ? parsed.operands : ['.'];
    let status = 0;

    const files: Entry[] = [];
    const dirs: DirTarget[] = [];
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
    if (files.length > 0) sections.push(formatEntries(files, flags, session, useColor));

    dirs.sort((a, b) => compareNames(a.label, b.label));
    // With -R, every directory gets a header and its subdirectories follow it.
    const showHeaders = operands.length > 1 || flags.recursive;
    const worklist = [...dirs];
    while (worklist.length > 0) {
      const target = worklist.shift()!;
      const result = listDir(target, flags, session, useColor, err);
      if (result.status) status = Math.max(status, result.status);
      if (result.text !== null) sections.push(showHeaders ? `${target.label}:\n${result.text}` : result.text);
      if (flags.recursive) worklist.unshift(...result.subdirs);
    }
    out(sections.join('\n'));
    return status;
  },
};
