import { ERRORS, type FileSystem } from '../fs/FileSystem';
import { canAccess } from '../fs/permissions';
import { Machine } from '../system/Machine';
import { dirname, resolvePath, tildify } from '../fs/path';
import type { GameEvent } from '../game/events';
import { allCommands } from './commands';
import { complete, type Completion } from './complete';
import { parsePipeline, type PipeSegment, type Redirect } from './parse';
import type { Command, InputRequest, Session, ShellInfo } from './types';

export interface ExecResult {
  /** Combined stdout and stderr, in the order written. Uses '\n' newlines. */
  output: string;
  exitCode: number;
  /** True when the command asked for the screen to be cleared. */
  clearScreen: boolean;
  /** Wait this long before showing the output. */
  delayMs?: number;
  /** Set when the command is waiting for the player to type an answer. */
  input?: PendingInput;
}

export interface PendingInput {
  prompt: string;
  secret: boolean;
  submit: (input: string) => ExecResult;
}

/** Something the player typed: a command line, or an answer to a prompt such as su's password. */
export type TypedInput = { kind: 'line'; text: string } | { kind: 'answer'; text: string };

/** Where the player was before an `su`, so `exit` can return there. */
interface SessionFrame {
  user: string;
  cwd: string;
  oldpwd?: string;
}

export interface ShellOptions {
  /** The computer the shell runs on. Defaults to a fresh Ubuntu server with the user added. */
  machine?: Machine;
  user?: string;
  cwd?: string;
  commands?: Command[];
  /** Commands added on top of the standard set, e.g. a challenge's `hint` and `submit`. */
  extraCommands?: Command[];
}

export interface ExecOptions {
  /** Terminal width in characters. */
  columns?: number;
}

const ANSI = {
  green: '\x1b[1;32m',
  blue: '\x1b[1;34m',
  reset: '\x1b[0m',
};

/** The simulated shell: turns a typed line into output. Knows nothing about the screen. */
export class Shell implements Session {
  machine: Machine;
  user: string;
  cwd: string;
  oldpwd?: string;
  columns = 80;
  lastExitCode = 0;
  private commands = new Map<string, Command>();
  private outerSessions: SessionFrame[] = [];

  constructor(options: ShellOptions = {}) {
    this.user = options.user ?? 'newhire';
    if (options.machine) {
      this.machine = options.machine;
    } else {
      this.machine = new Machine('harborline');
      this.machine.addUser({ name: this.user, uid: 1001 });
    }
    if (!this.machine.account(this.user)) throw new Error(`Shell: unknown user ${this.user}`);
    this.cwd = options.cwd ?? this.home;
    for (const cmd of [...(options.commands ?? allCommands), ...(options.extraCommands ?? [])]) {
      this.commands.set(cmd.name, cmd);
    }
  }

  private listeners: ((event: GameEvent) => void)[] = [];
  private inputListeners: ((input: TypedInput) => void)[] = [];

  /** Subscribes to everything the player types, so a game can be saved and replayed. */
  onInput(listener: (input: TypedInput) => void): () => void {
    this.inputListeners.push(listener);
    return () => {
      this.inputListeners = this.inputListeners.filter((l) => l !== listener);
    };
  }

  private typed(input: TypedInput) {
    for (const listener of this.inputListeners) listener(input);
  }

  /** Subscribes to what the player does. Returns a function that unsubscribes. */
  onEvent(listener: (event: GameEvent) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  emit = (event: GameEvent) => {
    for (const listener of this.listeners) listener(event);
  };

  get fs(): FileSystem {
    return this.machine.fs;
  }

  get host(): string {
    return this.machine.hostname;
  }

  get home(): string {
    return this.machine.account(this.user)!.home;
  }

  credentials = () => this.machine.credentials(this.user);

  resolve = (path: string) => resolvePath(this.cwd, path, this.home);

  lookup = (path: string) => this.fs.lookupAs(this.resolve(path), this.credentials());

  switchUser = (name: string, options: { login: boolean }) => {
    const from = this.user;
    this.outerSessions.push({ user: this.user, cwd: this.cwd, oldpwd: this.oldpwd });
    this.user = name;
    if (options.login) {
      this.cwd = this.home;
      this.oldpwd = undefined;
    }
    this.emit({ type: 'su', user: name, from });
  };

  exitUser = () => {
    const outer = this.outerSessions.pop();
    if (!outer) return false;
    this.user = outer.user;
    this.cwd = outer.cwd;
    this.oldpwd = outer.oldpwd;
    return true;
  };

  /** How many `su` shells deep the player is (0 = their own login). */
  get depth(): number {
    return this.outerSessions.length;
  }

  /** `#` for root, `$` for everyone else, as in bash's default prompt. */
  private get promptChar(): string {
    return this.credentials().uid === 0 ? '#' : '$';
  }

  /** Prompt text without colors, e.g. "newhire@harborline:~$ ". */
  promptText(): string {
    return `${this.user}@${this.host}:${tildify(this.cwd, this.home)}${this.promptChar} `;
  }

  /** Prompt with the same colors Ubuntu's default bash prompt uses. */
  promptAnsi(): string {
    const where = tildify(this.cwd, this.home);
    return `${ANSI.green}${this.user}@${this.host}${ANSI.reset}:${ANSI.blue}${where}${ANSI.reset}${this.promptChar} `;
  }

  /** Tab completion for the line being typed. */
  complete(line: string, cursor: number): Completion {
    return complete(this, [...this.commands.keys()].sort(), line, cursor);
  }

  execute(line: string, options: ExecOptions = {}): ExecResult {
    if (options.columns) this.columns = options.columns;
    if (line.trim() !== '') this.typed({ kind: 'line', text: line });

    const parsed = parsePipeline(line);
    if (!parsed.ok) return this.finish(`bash: ${parsed.error}\n`, 2, false);
    if (parsed.segments.length === 0) return this.finish('', this.lastExitCode, false);
    return this.runPipeline(parsed.segments);
  }

  /** Runs a pipeline: each command's stdout feeds the next, or a file, or the screen. */
  private runPipeline(segments: PipeSegment[]): ExecResult {
    const info: ShellInfo = {
      commandNames: () => [...this.commands.keys()].sort(),
      describe: (n) => this.commands.get(n)?.summary,
    };
    // Only a single, un-redirected command may pause for input (su's password).
    const interactive = segments.length === 1 && !segments[0].redirect;
    let terminal = '';
    let clearScreen = false;
    let stdin = '';
    let exitCode = 0;

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const isLast = i === segments.length - 1;
      const [name, ...args] = segment.words;

      // `> file` with no command just creates or truncates the file.
      if (name === undefined) {
        if (segment.redirect) {
          const error = this.writeRedirect(segment.redirect, '');
          exitCode = error ? 1 : 0;
          if (error) terminal += error;
        }
        stdin = '';
        continue;
      }

      const command = this.commands.get(name);
      if (!command) {
        terminal += `${name}: command not found\n`;
        exitCode = 127;
        stdin = '';
        continue;
      }

      let stdout = '';
      let request: InputRequest | undefined;
      exitCode = command.run({
        args,
        input: stdin,
        out: (text) => (stdout += text),
        err: (text) => (terminal += text),
        clearScreen: () => (clearScreen = true),
        askInput: (r) => (request = r),
        session: this,
        shell: info,
      });
      this.emit({ type: 'command', name, args, exitCode, user: this.user, cwd: this.cwd });

      if (request && interactive) {
        const result = this.finish(terminal + stdout, exitCode, clearScreen);
        result.input = this.pending(request);
        return result;
      }

      if (segment.redirect) {
        const error = this.writeRedirect(segment.redirect, stdout);
        if (error) {
          terminal += error;
          exitCode = 1;
        }
        stdin = '';
      } else if (isLast) {
        terminal += stdout;
      } else {
        stdin = stdout;
      }
    }

    return this.finish(terminal, exitCode, clearScreen);
  }

  /** Writes a command's output to a file for `>`/`>>`, checking permissions as the kernel would. */
  private writeRedirect(redirect: Redirect, content: string): string | null {
    const target = this.resolve(redirect.file);
    const who = this.credentials();
    const existing = this.fs.lookup(target);
    if (existing.ok && existing.node.type === 'dir') return `bash: ${redirect.file}: ${ERRORS.EISDIR}\n`;
    const parent = this.fs.lookupAs(dirname(target), who);
    if (!parent.ok) return `bash: ${redirect.file}: ${ERRORS[parent.code]}\n`;
    if (parent.node.type !== 'dir') return `bash: ${redirect.file}: ${ERRORS.ENOTDIR}\n`;
    if (existing.ok) {
      if (!canAccess(existing.node, who, 'w')) return `bash: ${redirect.file}: ${ERRORS.EACCES}\n`;
    } else if (!canAccess(parent.node, who, 'w') || !canAccess(parent.node, who, 'x')) {
      return `bash: ${redirect.file}: ${ERRORS.EACCES}\n`;
    }
    const body =
      redirect.append && existing.ok && existing.node.type === 'file' ? existing.node.content + content : content;
    if (existing.ok && existing.node.type === 'file') {
      // `>` and `>>` reuse the inode, so owner, group and mode stay as they were.
      const { owner, group, mode } = existing.node;
      this.fs.writeFile(target, body, { owner, group, mode, mtime: this.machine.clock });
    } else {
      this.fs.writeFile(target, body, { owner: this.user, group: this.user, mtime: this.machine.clock });
    }
    this.emit({ type: 'write', path: target, user: this.user });
    return null;
  }

  private pending(request: InputRequest): PendingInput {
    return {
      prompt: request.prompt,
      secret: request.secret,
      submit: (input) => {
        this.typed({ kind: 'answer', text: input });
        let output = '';
        let delayMs = 0;
        const write = (text: string) => {
          output += text;
        };
        const exitCode = request.onInput(input, { out: write, err: write, delay: (ms) => (delayMs += ms) });
        return { ...this.finish(output, exitCode, false), delayMs };
      },
    };
  }

  private finish(output: string, exitCode: number, clearScreen: boolean): ExecResult {
    this.lastExitCode = exitCode;
    return { output, exitCode, clearScreen };
  }
}
