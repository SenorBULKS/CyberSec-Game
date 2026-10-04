export interface CommandContext {
  /** Arguments after the command name. */
  args: string[];
  /** Writes to standard output. Use '\n' for newlines. */
  out: (text: string) => void;
  /** Writes to standard error. */
  err: (text: string) => void;
  /** Asks the terminal to clear the screen. */
  clearScreen: () => void;
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
