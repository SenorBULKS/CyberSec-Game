import { ERRORS, type FsNode } from '../../fs/FileSystem';
import { basename, dirname } from '../../fs/path';
import { canAccess, modeString, type Credentials } from '../../fs/permissions';
import type { Command, CommandContext, Session } from '../types';
import { denied } from './denied';

/** Turns a shell glob (`*`, `?`) into an anchored regular expression. */
function globToRegExp(glob: string, flags = ''): RegExp {
  let out = '';
  for (const ch of glob) {
    if (ch === '*') out += '.*';
    else if (ch === '?') out += '.';
    else out += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${out}$`, flags);
}

const SIX_DIGITS = '000000000';

function bytesOf(node: FsNode): number {
  return node.type === 'dir' ? 4096 : new TextEncoder().encode(node.content).length;
}

/** The numeric uid for an owner name, or the name itself when it is already a number. */
function uidOf(session: Session, owner: string): number | undefined {
  return session.machine.account(owner)?.uid;
}

function gidOf(session: Session, group: string): number | undefined {
  return session.machine.groupList.find((g) => g.name === group)?.gid;
}

// ---- find ----------------------------------------------------------------

interface FindTest {
  name?: RegExp;
  type?: 'f' | 'd';
  user?: string;
  /** Exact mode, "all of" (-mode), or "any of" (/mode). */
  perm?: { bits: number; match: 'exact' | 'all' | 'any' };
  /** Age in whole days: {op:'+'} older than, {op:'-'} younger than, {op:''} exactly. */
  mtime?: { op: '+' | '-' | ''; value: number };
  mmin?: { op: '+' | '-' | ''; value: number };
}

function parsePerm(raw: string): FindTest['perm'] | null {
  let match: 'exact' | 'all' | 'any' = 'exact';
  let digits = raw;
  if (raw.startsWith('-')) {
    match = 'all';
    digits = raw.slice(1);
  } else if (raw.startsWith('/')) {
    match = 'any';
    digits = raw.slice(1);
  }
  if (!/^[0-7]{1,4}$/.test(digits)) return null;
  return { bits: parseInt(digits, 8), match };
}

function parseAge(raw: string): { op: '+' | '-' | ''; value: number } | null {
  const m = /^([+-]?)(\d+)$/.exec(raw);
  if (!m) return null;
  const op = m[1] === '+' ? '+' : m[1] === '-' ? '-' : '';
  return { op, value: Number(m[2]) };
}

function ageMatches(ageUnits: number, test: { op: '+' | '-' | ''; value: number }): boolean {
  // find floors the age to whole units before comparing.
  const whole = Math.floor(ageUnits);
  if (test.op === '+') return whole > test.value;
  if (test.op === '-') return whole < test.value;
  return whole === test.value;
}

function matchesFind(node: FsNode, name: string, test: FindTest, session: Session): boolean {
  if (test.name && !test.name.test(name)) return false;
  if (test.type && (test.type === 'd' ? node.type !== 'dir' : node.type !== 'file')) return false;
  if (test.user && node.owner !== test.user) return false;
  if (test.perm) {
    const bits = node.mode & 0o7777;
    if (test.perm.match === 'exact' && bits !== test.perm.bits) return false;
    if (test.perm.match === 'all' && (bits & test.perm.bits) !== test.perm.bits) return false;
    if (test.perm.match === 'any' && (bits & test.perm.bits) === 0) return false;
  }
  if (test.mtime || test.mmin) {
    const ageMs = session.machine.clock.getTime() - node.mtime.getTime();
    if (test.mtime && !ageMatches(ageMs / 86_400_000, test.mtime)) return false;
    if (test.mmin && !ageMatches(ageMs / 60_000, test.mmin)) return false;
  }
  return true;
}

export const find: Command = {
  name: 'find',
  summary: 'Search for files (try find /var -name "*.log" or find . -mmin -60)',
  run(ctx: CommandContext) {
    const { args, err, session } = ctx;
    const starts: string[] = [];
    const test: FindTest = {};
    let i = 0;
    // Leading operands are the paths to search; the predicates (-name, -type, ...) follow.
    for (; i < args.length && !args[i].startsWith('-'); i++) {
      starts.push(args[i]);
    }
    for (; i < args.length; i++) {
      const flag = args[i];
      const value = args[i + 1];
      switch (flag) {
        case '-name':
        case '-iname':
          if (value === undefined) return usage(err, `find: missing argument to \`${flag}'`);
          test.name = globToRegExp(value, flag === '-iname' ? 'i' : '');
          i++;
          break;
        case '-type':
          if (value !== 'f' && value !== 'd') return usage(err, `find: unknown argument to -type`);
          test.type = value;
          i++;
          break;
        case '-user':
          if (value === undefined) return usage(err, `find: missing argument to \`-user'`);
          if (uidOf(session, value) === undefined) return usage(err, `find: '${value}' is not the name of a known user`);
          test.user = value;
          i++;
          break;
        case '-perm': {
          const perm = value !== undefined ? parsePerm(value) : null;
          if (!perm) return usage(err, `find: invalid mode '${value ?? ''}'`);
          test.perm = perm;
          i++;
          break;
        }
        case '-mtime':
        case '-mmin': {
          const age = value !== undefined ? parseAge(value) : null;
          if (!age) return usage(err, `find: invalid argument '${value ?? ''}' to \`${flag}'`);
          if (flag === '-mtime') test.mtime = age;
          else test.mmin = age;
          i++;
          break;
        }
        default:
          return usage(err, `find: unknown predicate '${flag}'`);
      }
    }
    if (starts.length === 0) starts.push('.');

    const who = session.credentials();
    let status = 0;
    for (const start of starts) {
      const found = session.lookup(start);
      if (!found.ok) {
        err(`find: '${start}': ${ERRORS[found.code]}\n`);
        if (found.code === 'EACCES') denied(session, start);
        status = 1;
        continue;
      }
      status = walkFind(found.node, start, test, who, ctx) || status;
    }
    return status;
  },
};

/** Depth-first walk that prints matches and reports unreadable directories, as find does. */
function walkFind(node: FsNode, display: string, test: FindTest, who: Credentials, ctx: CommandContext): number {
  let status = 0;
  if (matchesFind(node, basename(display) || display, test, ctx.session)) ctx.out(display + '\n');
  if (node.type !== 'dir') return status;
  if (!canAccess(node, who, 'r') || !canAccess(node, who, 'x')) {
    ctx.err(`find: '${display}': ${ERRORS.EACCES}\n`);
    return 1;
  }
  for (const name of [...node.children.keys()].sort()) {
    const child = node.children.get(name)!;
    const childPath = display === '/' ? `/${name}` : `${display}/${name}`;
    status = walkFind(child, childPath, test, who, ctx) || status;
  }
  return status;
}

function usage(err: (t: string) => void, message: string): number {
  err(message + '\n');
  return 1;
}

// ---- stat ----------------------------------------------------------------

function pad6(mtime: Date): string {
  const two = (n: number) => String(n).padStart(2, '0');
  const date = `${mtime.getFullYear()}-${two(mtime.getMonth() + 1)}-${two(mtime.getDate())}`;
  const time = `${two(mtime.getHours())}:${two(mtime.getMinutes())}:${two(mtime.getSeconds())}`;
  return `${date} ${time}.${SIX_DIGITS} +0000`;
}

export const stat: Command = {
  name: 'stat',
  summary: 'Show a file or directory in detail: size, permissions, owner and times',
  run({ args, out, err, session }: CommandContext) {
    const files = args.filter((a) => !a.startsWith('-'));
    if (files.length === 0) return usage(err, 'Usage: stat FILE...');
    let status = 0;
    for (const file of files) {
      const found = session.lookup(file);
      if (!found.ok) {
        err(`stat: cannot statx '${file}': ${ERRORS[found.code]}\n`);
        if (found.code === 'EACCES') denied(session, file);
        status = 1;
        continue;
      }
      const node = found.node;
      const size = bytesOf(node);
      const blocks = Math.ceil(size / 512);
      const kind = node.type === 'dir' ? 'directory' : 'regular file';
      const octal = (node.mode & 0o7777).toString(8).padStart(4, '0');
      const uid = uidOf(session, node.owner);
      const gid = gidOf(session, node.group);
      out(`  File: ${session.resolve(file)}\n`);
      out(`  Size: ${String(size).padEnd(15)} Blocks: ${String(blocks).padEnd(10)} IO Block: 4096   ${kind}\n`);
      out(
        `Access: (${octal}/${modeString(node.type, node.mode)})  ` +
          `Uid: (${String(uid ?? '?').padStart(5)}/${node.owner.padStart(8)})   ` +
          `Gid: (${String(gid ?? '?').padStart(5)}/${node.group.padStart(8)})\n`,
      );
      out(`Access: ${pad6(node.mtime)}\n`);
      out(`Modify: ${pad6(node.mtime)}\n`);
      out(`Change: ${pad6(node.mtime)}\n`);
    }
    return status;
  },
};

// ---- chmod / chown -------------------------------------------------------

/** Applies an octal or simple symbolic mode spec to a starting mode. Returns null on a bad spec. */
export function applyMode(spec: string, current: number): number | null {
  if (/^[0-7]{1,4}$/.test(spec)) return parseInt(spec, 8);
  let mode = current;
  for (const clause of spec.split(',')) {
    const m = /^([ugoa]*)([-+=])([rwx]*)$/.exec(clause);
    if (!m) return null;
    const whoChars = m[1] || 'a';
    const op = m[2];
    let perm = 0;
    if (m[3].includes('r')) perm |= 4;
    if (m[3].includes('w')) perm |= 2;
    if (m[3].includes('x')) perm |= 1;
    const shifts: number[] = [];
    if (whoChars.includes('u') || whoChars.includes('a')) shifts.push(6);
    if (whoChars.includes('g') || whoChars.includes('a')) shifts.push(3);
    if (whoChars.includes('o') || whoChars.includes('a')) shifts.push(0);
    for (const shift of shifts) {
      const field = perm << shift;
      const mask = 7 << shift;
      if (op === '+') mode |= field;
      else if (op === '-') mode &= ~field;
      else mode = (mode & ~mask) | field;
    }
  }
  return mode;
}

export const chmod: Command = {
  name: 'chmod',
  summary: 'Change permission bits, e.g. chmod 640 file or chmod o-r file (-R for a whole tree)',
  run({ args, err, session }: CommandContext) {
    const recursive = args.some((a) => a === '-R' || a === '--recursive');
    const rest = args.filter((a) => !a.startsWith('-'));
    const spec = rest.shift();
    if (spec === undefined || rest.length === 0) return usage(err, 'Usage: chmod [-R] MODE FILE...');
    if (applyMode(spec, 0) === null) return usage(err, `chmod: invalid mode: '${spec}'`);
    const who = session.credentials();
    let status = 0;
    for (const file of rest) {
      const found = session.lookup(file);
      if (!found.ok) {
        err(`chmod: cannot access '${file}': ${ERRORS[found.code]}\n`);
        if (found.code === 'EACCES') denied(session, file);
        status = 1;
        continue;
      }
      // Only the owner (or root) may change a file's mode.
      if (who.uid !== 0 && found.node.owner !== who.user) {
        err(`chmod: changing permissions of '${file}': Operation not permitted\n`);
        status = 1;
        continue;
      }
      applyChmod(found.node, spec, session.resolve(file), recursive, session);
    }
    return status;
  },
};

function applyChmod(node: FsNode, spec: string, path: string, recursive: boolean, session: Session) {
  node.mode = applyMode(spec, node.mode & 0o7777)!;
  session.emit({ type: 'chmod', path, mode: node.mode, user: session.user });
  if (recursive && node.type === 'dir') {
    for (const name of node.children.keys()) {
      applyChmod(node.children.get(name)!, spec, path === '/' ? `/${name}` : `${path}/${name}`, true, session);
    }
  }
}

export const chown: Command = {
  name: 'chown',
  summary: 'Change a file’s owner (and group), e.g. chown root:root file — needs root',
  run({ args, err, session }: CommandContext) {
    const recursive = args.some((a) => a === '-R' || a === '--recursive');
    const rest = args.filter((a) => !a.startsWith('-'));
    const owner = rest.shift();
    if (owner === undefined || rest.length === 0) return usage(err, 'Usage: chown [-R] OWNER[:GROUP] FILE...');
    const [ownerName, groupName] = owner.split(':');
    if (uidOf(session, ownerName) === undefined) return usage(err, `chown: invalid user: '${owner}'`);
    if (groupName !== undefined && groupName !== '' && gidOf(session, groupName) === undefined) {
      return usage(err, `chown: invalid group: '${owner}'`);
    }
    const who = session.credentials();
    let status = 0;
    for (const file of rest) {
      const found = session.lookup(file);
      if (!found.ok) {
        err(`chown: cannot access '${file}': ${ERRORS[found.code]}\n`);
        if (found.code === 'EACCES') denied(session, file);
        status = 1;
        continue;
      }
      // Only root may give a file away to another owner.
      if (who.uid !== 0) {
        err(`chown: changing ownership of '${file}': Operation not permitted\n`);
        status = 1;
        continue;
      }
      applyChown(found.node, ownerName, groupName || undefined, session.resolve(file), recursive, session);
    }
    return status;
  },
};

function applyChown(node: FsNode, owner: string, group: string | undefined, path: string, recursive: boolean, session: Session) {
  node.owner = owner;
  if (group) node.group = group;
  session.emit({ type: 'chown', path, owner, group, user: session.user });
  if (recursive && node.type === 'dir') {
    for (const name of node.children.keys()) {
      applyChown(node.children.get(name)!, owner, group, path === '/' ? `/${name}` : `${path}/${name}`, true, session);
    }
  }
}

// ---- rm ------------------------------------------------------------------

export const rm: Command = {
  name: 'rm',
  summary: 'Remove files (use -r for a directory and its contents, -f to ignore missing files)',
  run({ args, err, session }: CommandContext) {
    let recursive = false;
    let force = false;
    const targets: string[] = [];
    for (const arg of args) {
      if (arg.startsWith('-') && arg !== '-') {
        for (const ch of arg.slice(1)) {
          if (ch === 'r' || ch === 'R') recursive = true;
          else if (ch === 'f') force = true;
          else return usage(err, `rm: invalid option -- '${ch}'`);
        }
      } else {
        targets.push(arg);
      }
    }
    if (targets.length === 0) {
      if (force) return 0;
      return usage(err, 'rm: missing operand');
    }
    const who = session.credentials();
    let status = 0;
    for (const target of targets) {
      const absolute = session.resolve(target);
      const found = session.lookup(target);
      if (!found.ok) {
        if (!force) {
          err(`rm: cannot remove '${target}': ${ERRORS[found.code]}\n`);
          if (found.code === 'EACCES') denied(session, target);
          status = 1;
        }
        continue;
      }
      if (found.node.type === 'dir' && !recursive) {
        err(`rm: cannot remove '${target}': ${ERRORS.EISDIR}\n`);
        status = 1;
        continue;
      }
      // Unlinking needs write + search on the parent directory.
      const parent = session.fs.lookupAs(dirname(absolute), who);
      if (!parent.ok || parent.node.type !== 'dir' || !canAccess(parent.node, who, 'w') || !canAccess(parent.node, who, 'x')) {
        if (!force) {
          err(`rm: cannot remove '${target}': ${ERRORS.EACCES}\n`);
          denied(session, target);
          status = 1;
        }
        continue;
      }
      // In a sticky directory (like /tmp) you may only remove what you own.
      const sticky = (parent.node.mode & 0o1000) !== 0;
      if (sticky && who.uid !== 0 && found.node.owner !== who.user && parent.node.owner !== who.user) {
        if (!force) {
          err(`rm: cannot remove '${target}': Operation not permitted\n`);
          status = 1;
        }
        continue;
      }
      session.fs.remove(absolute);
      session.emit({ type: 'remove', path: absolute, user: session.user });
    }
    return status;
  },
};
