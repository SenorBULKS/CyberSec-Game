import type { FileSystem, LookupResult } from '../fs/FileSystem';
import type { Credentials } from '../fs/permissions';
import type { GameEvent } from '../game/events';
import type { Machine } from '../system/Machine';

/** The logged-in session a command runs in. Commands may change `cwd`. */
export interface Session {
  machine: Machine;
  fs: FileSystem;
  user: string;
  host: string;
  home: string;
  cwd: string;
  oldpwd?: string;
  /** Width of the terminal in characters, for commands that lay out columns. */
  columns: number;
  /** The current user's identity for permission checks. */
  credentials: () => Credentials;
  /** Turns what the player typed into an absolute path. */
  resolve: (path: string) => string;
  /** Resolves a typed path and looks it up with the current user's permissions. */
  lookup: (path: string) => LookupResult;
  /** Starts a shell as another user, as `su` does. `login` also moves to their home. */
  switchUser: (name: string, options: { login: boolean }) => void;
  /** Leaves the current `su` shell. Returns false when already in the first login shell. */
  exitUser: () => boolean;
  /** Reports something the player did, for challenge objectives. */
  emit: (event: GameEvent) => void;
}

export interface InputIO {
  out: (text: string) => void;
  err: (text: string) => void;
  /** Pauses before showing the output, e.g. su's delay after a wrong password. */
  delay: (ms: number) => void;
}

/** A question a command asks the player, like su's "Password: ". */
export interface InputRequest {
  prompt: string;
  /** Hide what is typed and keep it out of the command history. */
  secret: boolean;
  /** Receives what the player typed and returns the exit status. */
  onInput: (input: string, io: InputIO) => number;
}

export interface CommandContext {
  /** Arguments after the command name. */
  args: string[];
  /** Standard input: text piped in from the previous command, or '' when there is none. */
  input: string;
  /** Writes to standard output. Use '\n' for newlines. */
  out: (text: string) => void;
  /** Writes to standard error. */
  err: (text: string) => void;
  /** Asks the terminal to clear the screen. */
  clearScreen: () => void;
  /** Asks the player to type something; the command finishes in `onInput`. */
  askInput: (request: InputRequest) => void;
  session: Session;
  shell: ShellInfo;
}

export interface ShellInfo {
  commandNames: () => string[];
  describe: (name: string) => string | undefined;
  /** The command lines entered so far, oldest first, for the `history` command. */
  history: () => readonly string[];
  /** Clears the command history, for `history -c`. */
  clearHistory: () => void;
}

export interface Command {
  name: string;
  /** One-line, beginner-friendly description shown by `help`. */
  summary: string;
  /** Returns the exit status: 0 for success. */
  run: (ctx: CommandContext) => number;
}
