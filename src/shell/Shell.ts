import type { FileSystem } from '../fs/FileSystem';
import { Machine } from '../system/Machine';
import { resolvePath, tildify } from '../fs/path';
import { allCommands } from './commands';
import { complete, type Completion } from './complete';
import { parseCommandLine } from './parse';
import type { Command, Session, ShellInfo } from './types';

export interface ExecResult {
  /** Combined stdout and stderr, in the order written. Uses '\n' newlines. */
  output: string;
  exitCode: number;
  /** True when the command asked for the screen to be cleared. */
  clearScreen: boolean;
}

export interface ShellOptions {
  /** The computer the shell runs on. Defaults to a fresh Ubuntu server with the user added. */
  machine?: Machine;
  user?: string;
  cwd?: string;
  commands?: Command[];
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
    for (const cmd of options.commands ?? allCommands) this.commands.set(cmd.name, cmd);
  }

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

  /** Prompt text without colors, e.g. "newhire@harborline:~$ ". */
  promptText(): string {
    return `${this.user}@${this.host}:${tildify(this.cwd, this.home)}$ `;
  }

  /** Prompt with the same colors Ubuntu's default bash prompt uses. */
  promptAnsi(): string {
    const where = tildify(this.cwd, this.home);
    return `${ANSI.green}${this.user}@${this.host}${ANSI.reset}:${ANSI.blue}${where}${ANSI.reset}$ `;
  }

  /** Tab completion for the line being typed. */
  complete(line: string, cursor: number): Completion {
    return complete(this, [...this.commands.keys()].sort(), line, cursor);
  }

  execute(line: string, options: ExecOptions = {}): ExecResult {
    if (options.columns) this.columns = options.columns;
    let output = '';
    let clearScreen = false;
    const write = (text: string) => {
      output += text;
    };

    const parsed = parseCommandLine(line);
    if (!parsed.ok) {
      write(`bash: ${parsed.error}\n`);
      return this.finish(output, 2, false);
    }
    if (parsed.words.length === 0) return this.finish('', this.lastExitCode, false);

    const [name, ...args] = parsed.words;
    const command = this.commands.get(name);
    if (!command) {
      write(`${name}: command not found\n`);
      return this.finish(output, 127, false);
    }

    const info: ShellInfo = {
      commandNames: () => [...this.commands.keys()].sort(),
      describe: (n) => this.commands.get(n)?.summary,
    };
    const exitCode = command.run({
      args,
      out: write,
      err: write,
      clearScreen: () => {
        clearScreen = true;
      },
      session: this,
      shell: info,
    });
    return this.finish(output, exitCode, clearScreen);
  }

  private finish(output: string, exitCode: number, clearScreen: boolean): ExecResult {
    this.lastExitCode = exitCode;
    return { output, exitCode, clearScreen };
  }
}
