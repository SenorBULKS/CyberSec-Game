/** Things the player did, reported by the shell so challenges can react. */
export type GameEvent =
  /** Any command line that ran (after it finished). */
  | { type: 'command'; name: string; args: string[]; exitCode: number; user: string; cwd: string }
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
  /** The player entered an answer with `submit`. */
  | { type: 'submit'; answer: string; correct: boolean };
