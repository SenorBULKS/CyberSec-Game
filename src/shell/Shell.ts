import type { FileSystem } from '../fs/FileSystem';
import { Machine } from '../system/Machine';
import { resolvePath, tildify } from '../fs/path';
import { allCommands } from './commands';
import { complete, type Completion } from './complete';
import { parseCommandLine } from './parse';
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

  switchUser = (name: string, options: { login: boolean }) => {
    this.outerSessions.push({ user: this.user, cwd: this.cwd, oldpwd: this.oldpwd });
    this.user = name;
    if (options.login) {
      this.cwd = this.home;
      this.oldpwd = undefined;
    }
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
    let request: InputRequest | undefined;
    const exitCode = command.run({
      args,
      out: write,
      err: write,
      clearScreen: () => {
        clearScreen = true;
      },
      askInput: (r) => {
        request = r;
      },
      session: this,
      shell: info,
    });
    const result = this.finish(output, exitCode, clearScreen);
    if (request) result.input = this.pending(request);
    return result;
  }

  private pending(request: InputRequest): PendingInput {
    return {
      prompt: request.prompt,
      secret: request.secret,
      submit: (input) => {
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
