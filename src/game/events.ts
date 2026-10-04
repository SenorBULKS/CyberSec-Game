/** Things the player did, reported by the shell so challenges can react. */
export type GameEvent =
  /** Any command line that ran (after it finished). `piped` is true when it read from a pipe. */
  | { type: 'command'; name: string; args: string[]; exitCode: number; user: string; cwd: string; piped?: boolean }
  /** A file's contents were shown, e.g. by cat. */
  | { type: 'read'; path: string; user: string }
  /** A directory was listed by ls. */
  | { type: 'list'; path: string; all: boolean; long: boolean; user: string }
  /** The player moved into a directory. */
  | { type: 'cd'; path: string; user: string }
  /** The player was refused access to a path (Permission denied). */
  | { type: 'denied'; path: string; user: string }
  /** The player became another user with su. */
  | { type: 'su'; user: string; from: string }
  /** A file was created or its contents changed, e.g. by a `>` redirect. */
  | { type: 'write'; path: string; user: string }
  /** A file or directory's permission bits were changed with chmod. */
  | { type: 'chmod'; path: string; mode: number; user: string }
  /** A file or directory's owner (and maybe group) was changed with chown. */
  | { type: 'chown'; path: string; owner: string; group?: string; user: string }
  /** A file or directory was deleted with rm. */
  | { type: 'remove'; path: string; user: string }
  /** The player signalled a process with kill. */
  | { type: 'kill'; pid: number; signal: number; user: string }
  /** The player entered an answer with `submit`. */
  | { type: 'submit'; answer: string; correct: boolean };
