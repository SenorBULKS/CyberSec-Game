import type { FileSystem } from '../fs/FileSystem';

/** The logged-in session a command runs in. Commands may change `cwd`. */
export interface Session {
  fs: FileSystem;
  user: string;
  host: string;
  home: string;
  cwd: string;
  oldpwd?: string;
  /** Width of the terminal in characters, for commands that lay out columns. */
  columns: number;
  /** Turns what the player typed into an absolute path. */
  resolve: (path: string) => string;
}

export interface CommandContext {
  /** Arguments after the command name. */
  args: string[];
  /** Writes to standard output. Use '\n' for newlines. */
  out: (text: string) => void;
  /** Writes to standard error. */
  err: (text: string) => void;
  /** Asks the terminal to clear the screen. */
  clearScreen: () => void;
  session: Session;
  shell: ShellInfo;
}

export interface ShellInfo {
  commandNames: () => string[];
  describe: (name: string) => string | undefined;
}

export interface Command {
  name: string;
  /** One-line, beginner-friendly description shown by `help`. */
  summary: string;
  /** Returns the exit status: 0 for success. */
  run: (ctx: CommandContext) => number;
}
