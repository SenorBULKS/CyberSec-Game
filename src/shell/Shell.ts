import { builtins } from './builtins';
import { parseCommandLine } from './parse';
import type { Command, ShellInfo } from './types';

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
  commands?: Command[];
}

const ANSI = {
  green: '\x1b[1;32m',
  blue: '\x1b[1;34m',
  reset: '\x1b[0m',
};

/** The simulated shell: turns a typed line into output. Knows nothing about the screen. */
export class Shell {
  user: string;
  host: string;
  private commands = new Map<string, Command>();
  lastExitCode = 0;

  constructor(options: ShellOptions = {}) {
    this.user = options.user ?? 'newhire';
    this.host = options.host ?? 'harborline';
    for (const cmd of options.commands ?? builtins) this.commands.set(cmd.name, cmd);
  }

  /** Prompt text without colors, e.g. "newhire@harborline:~$ ". */
  promptText(): string {
    return `${this.user}@${this.host}:~$ `;
  }

  /** Prompt with the same colors Ubuntu's default bash prompt uses. */
  promptAnsi(): string {
    return `${ANSI.green}${this.user}@${this.host}${ANSI.reset}:${ANSI.blue}~${ANSI.reset}$ `;
  }

  execute(line: string): ExecResult {
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
      shell: info,
    });
    return this.finish(output, exitCode, clearScreen);
  }

  private finish(output: string, exitCode: number, clearScreen: boolean): ExecResult {
    this.lastExitCode = exitCode;
    return { output, exitCode, clearScreen };
  }
}
