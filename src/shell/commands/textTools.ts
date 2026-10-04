import { ERRORS } from '../../fs/FileSystem';
import { canAccess } from '../../fs/permissions';
import type { Command, CommandContext } from '../types';
import { denied } from './denied';

/** Reads a file's text for a tool like grep or head, or reports the error the way that tool would. */
function readFileArg(session: CommandContext['session'], tool: string, arg: string, err: (t: string) => void): string | null {
  const found = session.lookup(arg);
  if (!found.ok) {
    err(`${tool}: ${arg}: ${ERRORS[found.code]}\n`);
    if (found.code === 'EACCES') denied(session, arg);
    return null;
  }
  if (found.node.type === 'dir') {
    err(`${tool}: ${arg}: ${ERRORS.EISDIR}\n`);
    return null;
  }
  if (!canAccess(found.node, session.credentials(), 'r')) {
    err(`${tool}: ${arg}: ${ERRORS.EACCES}\n`);
    denied(session, arg);
    return null;
  }
  session.emit({ type: 'read', path: session.resolve(arg), user: session.user });
  return found.node.content;
}

/** Splits text into lines the way the line tools see them, dropping the empty piece after a final newline. */
function toLines(text: string): string[] {
  const lines = text.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/** Gathers each source as named text: the given files, or standard input when there are none. */
function sources(
  tool: string,
  files: string[],
  ctx: CommandContext,
): { name?: string; text: string | null }[] {
  if (files.length === 0) return [{ text: ctx.input }];
  return files.map((file) => ({ name: file, text: readFileArg(ctx.session, tool, file, ctx.err) }));
}

export const grep: Command = {
  name: 'grep',
  summary: 'Print the lines that match a pattern (-i ignore case, -n line numbers, -v invert, -c count)',
  run(ctx) {
    const { out, err } = ctx;
    const flags = { i: false, n: false, v: false, c: false };
    let pattern: string | undefined;
    const files: string[] = [];
    for (const arg of ctx.args) {
      if (pattern === undefined && arg.length > 1 && arg.startsWith('-')) {
        for (const ch of arg.slice(1)) {
          if (ch in flags) flags[ch as keyof typeof flags] = true;
          else {
            err(`grep: invalid option -- '${ch}'\n`);
            return 2;
          }
        }
      } else if (pattern === undefined) {
        pattern = arg;
      } else {
        files.push(arg);
      }
    }
    if (pattern === undefined) {
      err('Usage: grep [OPTION]... PATTERN [FILE]...\n');
      return 2;
    }
    let regex: RegExp;
    try {
      regex = new RegExp(pattern, flags.i ? 'i' : '');
    } catch {
      err(`grep: ${pattern}: invalid regular expression\n`);
      return 2;
    }
    const withName = files.length > 1;
    let error = false;
    let matched = false;
    for (const source of sources('grep', files, ctx)) {
      if (source.text === null) {
        error = true;
        continue;
      }
      let count = 0;
      toLines(source.text).forEach((line, index) => {
        if (regex.test(line) !== flags.v) {
          matched = true;
          count++;
          if (!flags.c) {
            const prefix = (withName && source.name ? `${source.name}:` : '') + (flags.n ? `${index + 1}:` : '');
            out(prefix + line + '\n');
          }
        }
      });
      if (flags.c) out((withName && source.name ? `${source.name}:` : '') + count + '\n');
    }
    if (error) return 2;
    return matched ? 0 : 1;
  },
};

/** Shared engine for head and tail: parse `-n N`, then print the chosen lines of each source. */
function lineWindow(tool: 'head' | 'tail', ctx: CommandContext): number {
  const { args, out, err } = ctx;
  let count = 10;
  const files: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-n') {
      const value = args[++i];
      const parsed = Number(value);
      if (value === undefined || !Number.isInteger(parsed) || parsed < 0) {
        err(`${tool}: invalid number of lines: '${value ?? ''}'\n`);
        return 1;
      }
      count = parsed;
    } else if (/^-n?\d+$/.test(arg)) {
      count = Number(arg.replace(/^-n?/, ''));
    } else if (arg.length > 1 && arg.startsWith('-')) {
      err(`${tool}: invalid option -- '${arg.slice(1)}'\n`);
      return 1;
    } else {
      files.push(arg);
    }
  }
  const list = sources(tool, files, ctx);
  const withHeaders = files.length > 1;
  let status = 0;
  let first = true;
  for (const source of list) {
    if (source.text === null) {
      status = 1;
      continue;
    }
    if (withHeaders) {
      out(`${first ? '' : '\n'}==> ${source.name} <==\n`);
    }
    first = false;
    const lines = toLines(source.text);
    const chosen = tool === 'head' ? lines.slice(0, count) : lines.slice(Math.max(0, lines.length - count));
    if (chosen.length > 0) out(chosen.join('\n') + '\n');
  }
  return status;
}

export const head: Command = {
  name: 'head',
  summary: 'Show the first lines of a file, 10 by default (-n N for a different number)',
  run: (ctx) => lineWindow('head', ctx),
};

export const tail: Command = {
  name: 'tail',
  summary: 'Show the last lines of a file, 10 by default (-n N for a different number)',
  run: (ctx) => lineWindow('tail', ctx),
};

export const wc: Command = {
  name: 'wc',
  summary: 'Count lines, words and characters (-l lines, -w words, -c characters)',
  run(ctx) {
    const { out, err } = ctx;
    const show = { l: false, w: false, c: false };
    const files: string[] = [];
    for (const arg of ctx.args) {
      if (arg.length > 1 && arg.startsWith('-') && !/\d/.test(arg)) {
        for (const ch of arg.slice(1)) {
          if (ch in show) show[ch as keyof typeof show] = true;
          else {
            err(`wc: invalid option -- '${ch}'\n`);
            return 1;
          }
        }
      } else {
        files.push(arg);
      }
    }
    const any = show.l || show.w || show.c;
    const want = any ? show : { l: true, w: true, c: true };
    const format = (c: { l: number; w: number; c: number }, name?: string) => {
      const parts: string[] = [];
      if (want.l) parts.push(String(c.l));
      if (want.w) parts.push(String(c.w));
      if (want.c) parts.push(String(c.c));
      return parts.join(' ') + (name ? ` ${name}` : '') + '\n';
    };
    const total = { l: 0, w: 0, c: 0 };
    let status = 0;
    const list = sources('wc', files, ctx);
    for (const source of list) {
      if (source.text === null) {
        status = 1;
        continue;
      }
      const counts = {
        l: (source.text.match(/\n/g) ?? []).length,
        w: source.text.trim() === '' ? 0 : source.text.trim().split(/\s+/).length,
        c: source.text.length,
      };
      total.l += counts.l;
      total.w += counts.w;
      total.c += counts.c;
      out(format(counts, source.name));
    }
    if (files.length > 1) out(format(total, 'total'));
    return status;
  },
};

export const less: Command = {
  name: 'less',
  summary: 'Read through a file (here it simply prints the whole file)',
  run(ctx) {
    const files = ctx.args.filter((a) => !a.startsWith('-'));
    if (files.length === 0) {
      ctx.out(ctx.input);
      return 0;
    }
    let status = 0;
    for (const file of files) {
      const content = readFileArg(ctx.session, 'less', file, ctx.err);
      if (content === null) status = 1;
      else ctx.out(content);
    }
    return status;
  },
};
