import { createBaseSystem } from '../fs/baseSystem';
import type { FileSystem } from '../fs/FileSystem';
import { resolvePath, tildify } from '../fs/path';
import { allCommands } from './commands';
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
  user?: string;
  host?: string;
  home?: string;
  cwd?: string;
  fs?: FileSystem;
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
  fs: FileSystem;
  user: string;
  host: string;
  home: string;
  cwd: string;
  oldpwd?: string;
  columns = 80;
  lastExitCode = 0;
  private commands = new Map<string, Command>();

  constructor(options: ShellOptions = {}) {
    this.user = options.user ?? 'newhire';
    this.host = options.host ?? 'harborline';
    this.home = options.home ?? `/home/${this.user}`;
    this.cwd = options.cwd ?? this.home;
    this.fs = options.fs ?? createBaseSystem(this.host);
    this.fs.mkdir(this.home, { owner: this.user, group: this.user, mode: 0o750 });
    for (const cmd of options.commands ?? allCommands) this.commands.set(cmd.name, cmd);
  }

  resolve = (path: string) => resolvePath(this.cwd, path, this.home);

  /** Prompt text without colors, e.g. "newhire@harborline:~$ ". */
  promptText(): string {
    return `${this.user}@${this.host}:${tildify(this.cwd, this.home)}$ `;
  }

  /** Prompt with the same colors Ubuntu's default bash prompt uses. */
  promptAnsi(): string {
    const where = tildify(this.cwd, this.home);
    return `${ANSI.green}${this.user}@${this.host}${ANSI.reset}:${ANSI.blue}${where}${ANSI.reset}$ `;
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
