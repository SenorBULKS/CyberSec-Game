import { ERRORS, type FileSystem } from '../fs/FileSystem';
import { canAccess } from '../fs/permissions';
import { Machine } from '../system/Machine';
import { dirname, resolvePath, tildify } from '../fs/path';
import type { GameEvent } from '../game/events';
import { allCommands } from './commands';
import { complete, type Completion } from './complete';
import { expandWord, compileGlobComponent, componentHasGlob, type ExpandContext } from './expand';
import { parseProgram, type Pipeline, type Stage, type Word } from './parse';
import type { Command, InputRequest, RunContext, Session, ShellInfo } from './types';

/** A redirection whose file name has been expanded to a plain string. */
type ExpandedRedirect =
  | { kind: 'out'; fd: 1 | 2; file: string; append: boolean }
  | { kind: 'in'; file: string }
  | { kind: 'both'; file: string; append: boolean }
  | { kind: 'dup'; fd: 1 | 2; toFd: 1 | 2 };

/** A pipeline whose words and redirects have been expanded to plain strings, ready to run. */
interface ExpandedSegment {
  words: string[];
  redirects: ExpandedRedirect[];
}

/** Where a stream ends up once a segment's redirections are applied. */
type Dest =
  | { to: 'terminal' }
  | { to: 'pipe' }
  | { to: 'file'; file: string; append: boolean }
  | { to: 'discard' };

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
  /** Whether sudo has accepted the password this session (its credential cache). */
  sudoAuthed = false;
  private commands = new Map<string, Command>();
  private outerSessions: SessionFrame[] = [];
  /** The command lines entered this session, for the `history` command. */
  private commandHistory: string[] = [];
  /** Whether the last line's final command was a pager, so a lone `q` next is swallowed. */
  private lastWasPager = false;

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

  /** Runs a command as another user (for sudo) and reverts, keeping the same working directory. */
  runAs = (user: string, words: string[], io: RunContext): number => {
    const name = words[0];
    const command = this.commands.get(name);
    if (!command) {
      io.err(`sudo: ${name}: command not found\n`);
      return 127;
    }
    const previous = this.user;
    this.user = user;
    let exitCode: number;
    try {
      exitCode = command.run({
        args: words.slice(1),
        input: io.input,
        out: io.out,
        err: io.err,
        clearScreen: io.clearScreen,
        askInput: io.askInput,
        stdoutIsTerminal: io.stdoutIsTerminal,
        session: this,
        shell: this.makeInfo(),
      });
    } finally {
      this.user = previous;
    }
    this.emit({ type: 'command', name, args: words.slice(1), exitCode, user, cwd: this.cwd });
    return exitCode;
  };

  private makeInfo(): ShellInfo {
    return {
      commandNames: () => [...this.commands.keys()].sort(),
      describe: (n) => this.commands.get(n)?.summary,
      history: () => this.commandHistory,
      clearHistory: () => (this.commandHistory.length = 0),
    };
  }

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

    // A lone `q` right after `less` is the instinctive "quit the pager"; swallow it
    // rather than reporting "q: command not found".
    if (line.trim() === 'q' && this.lastWasPager) {
      this.lastWasPager = false;
      return this.finish('', this.lastExitCode, false);
    }

    if (line.trim() !== '') {
      this.typed({ kind: 'line', text: line });
      this.commandHistory.push(line);
    }

    const parsed = parseProgram(line);
    this.lastWasPager = parsed.ok && endsWithPager(parsed.stages);
    if (!parsed.ok) return this.finish(`bash: ${parsed.error}\n`, 2, false);
    if (parsed.stages.length === 0) return this.finish('', this.lastExitCode, false);
    return this.runProgram(parsed.stages);
  }

  /** The value of $NAME for expansion, or undefined when it is not set. */
  private envValue(name: string): string | undefined {
    switch (name) {
      case 'HOME':
        return this.home;
      case 'USER':
      case 'LOGNAME':
        return this.user;
      case 'PWD':
        return this.cwd;
      case 'OLDPWD':
        return this.oldpwd;
      case 'SHELL':
        return '/bin/bash';
      case 'HOSTNAME':
        return this.host;
      case 'UID':
        return String(this.credentials().uid);
      case '?':
        return String(this.lastExitCode);
      default:
        return undefined;
    }
  }

  private expandContext(): ExpandContext {
    return {
      env: (name) => this.envValue(name),
      home: this.home,
      homeFor: (name) => this.machine.account(name)?.home,
      glob: (pattern) => this.globMatch(pattern),
    };
  }

  /**
   * Pathname expansion: matches a glob pattern against the filesystem, honouring
   * read/search permissions and the rule that `*` skips names that start with a dot.
   */
  private globMatch(pattern: string): string[] {
    const absolute = pattern.startsWith('/');
    const base = absolute ? '/' : this.cwd;
    const components = splitPatternComponents(absolute ? pattern.slice(1) : pattern);
    const who = this.credentials();

    let frontier: string[] = [base];
    for (const component of components) {
      const next: string[] = [];
      if (!componentHasGlob(component)) {
        const literal = unescapeComponent(component);
        for (const dir of frontier) {
          const child = joinChild(dir, literal);
          if (this.fs.lookupAs(child, who).ok) next.push(child);
        }
      } else {
        const matcher = compileGlobComponent(component);
        for (const dir of frontier) {
          const found = this.fs.lookupAs(dir, who);
          if (!found.ok || found.node.type !== 'dir') continue;
          if (!canAccess(found.node, who, 'r')) continue;
          const names = [...found.node.children.keys()].sort();
          for (const name of names) {
            if (name.startsWith('.') && !matcher.matchesDotFiles) continue;
            if (matcher.test(name)) next.push(joinChild(dir, name));
          }
        }
      }
      frontier = next;
      if (frontier.length === 0) break;
    }
    // Return matches as the pattern was written: relative to cwd, or absolute.
    const results = absolute ? frontier : frontier.map((path) => relativeTo(this.cwd, path));
    return results.sort();
  }

  /** Runs each stage in order, respecting `;` (always), `&&` (on success) and `||` (on failure). */
  private runProgram(stages: Stage[]): ExecResult {
    let output = '';
    let clearScreen = false;
    let exitCode = this.lastExitCode;
    for (const stage of stages) {
      if (stage.connector === '&&' && exitCode !== 0) continue;
      if (stage.connector === '||' && exitCode === 0) continue;
      const segments = this.expandPipeline(stage.pipeline);
      // Only a lone, un-redirected command in a single-stage line may pause for input.
      const canPause = stages.length === 1 && segments.length === 1 && segments[0].redirects.length === 0;
      const result = this.runPipeline(segments, canPause);
      output += result.output;
      clearScreen = clearScreen || result.clearScreen;
      exitCode = result.exitCode;
      if (result.input) {
        return { ...this.finish(output, exitCode, clearScreen), input: result.input };
      }
    }
    return this.finish(output, exitCode, clearScreen);
  }

  /** Expands every word (and redirect target) in a pipeline to the strings a command actually sees. */
  private expandPipeline(pipeline: Pipeline): ExpandedSegment[] {
    const ctx = this.expandContext();
    return pipeline.map((segment) => {
      const words = segment.words.flatMap((word: Word) => expandWord(word, ctx));
      const redirects: ExpandedRedirect[] = segment.redirects.map((r) => {
        if (r.kind === 'dup') return r;
        const file = expandWord(r.file, ctx)[0] ?? '';
        if (r.kind === 'out') return { kind: 'out', fd: r.fd, file, append: r.append };
        if (r.kind === 'both') return { kind: 'both', file, append: r.append };
        return { kind: 'in', file };
      });
      return { words, redirects };
    });
  }

  /** Runs a pipeline: each command's stdout feeds the next, a file, or the screen. */
  private runPipeline(segments: ExpandedSegment[], interactive: boolean): ExecResult {
    const info = this.makeInfo();
    let terminal = '';
    let clearScreen = false;
    let stdin = '';
    let exitCode = 0;

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const isLast = i === segments.length - 1;
      const piped = i > 0;

      // Apply the segment's redirections: where stdout and stderr go, and stdin.
      let dest1: Dest = isLast ? { to: 'terminal' } : { to: 'pipe' };
      let dest2: Dest = { to: 'terminal' };
      let input = stdin;
      let redirectError: string | null = null;
      for (const r of segment.redirects) {
        if (r.kind === 'in') {
          const read = this.readRedirect(r.file);
          if (typeof read === 'string') input = read;
          else redirectError = read.error;
        } else if (r.kind === 'out') {
          if (r.fd === 1) dest1 = this.fileDest(r);
          else dest2 = this.fileDest(r);
        } else if (r.kind === 'both') {
          dest1 = dest2 = this.fileDest(r);
        } else {
          const src: Dest = r.toFd === 1 ? dest1 : dest2;
          if (r.fd === 1) dest1 = src;
          else dest2 = src;
        }
      }
      if (redirectError) {
        terminal += redirectError;
        exitCode = 1;
        stdin = '';
        continue;
      }

      // Each write goes straight to its destination, so when stdout and stderr both
      // reach the terminal they interleave in the order the command wrote them.
      const files = new Map<string, { append: boolean; text: string }>();
      for (const dest of [dest1, dest2]) {
        if (dest.to === 'file' && !files.has(dest.file)) files.set(dest.file, { append: dest.append, text: '' });
      }
      let pipeOut = '';
      const writeTo = (dest: Dest, text: string) => {
        if (dest.to === 'terminal') terminal += text;
        else if (dest.to === 'pipe') pipeOut += text;
        else if (dest.to === 'file') files.get(dest.file)!.text += text;
        // 'discard' drops it (that is /dev/null).
      };

      const [name, ...args] = segment.words;
      let request: InputRequest | undefined;

      if (name === undefined) {
        // Just redirections with no command (e.g. `> file`): open the files, run nothing.
      } else {
        const command = this.commands.get(name);
        if (!command) {
          writeTo(dest2, `${name}: command not found\n`);
          exitCode = 127;
        } else {
          exitCode = command.run({
            args,
            input,
            out: (text) => writeTo(dest1, text),
            err: (text) => writeTo(dest2, text),
            clearScreen: () => (clearScreen = true),
            askInput: (r) => (request = r),
            stdoutIsTerminal: dest1.to === 'terminal',
            session: this,
            shell: info,
          });
          this.emit({ type: 'command', name, args, exitCode, user: this.user, cwd: this.cwd, piped });
        }
      }

      // A command may pause for input only when nothing is redirected (see canPause),
      // so its output has already gone to the terminal.
      if (request && interactive) {
        const result = this.finish(terminal, exitCode, clearScreen);
        result.input = this.pending(request);
        return result;
      }

      for (const [file, { append, text }] of files) {
        const error = this.writeRedirect({ file, append }, text);
        if (error) {
          terminal += error;
          exitCode = 1;
        }
      }
      stdin = pipeOut;
    }

    return this.finish(terminal, exitCode, clearScreen);
  }

  /** Resolves a file redirection to its destination, folding /dev/null into a discard. */
  private fileDest(r: { file: string; append: boolean }): Dest {
    const found = this.fs.lookup(this.resolve(r.file));
    if (found.ok && found.node.type === 'file' && found.node.device === 'null') return { to: 'discard' };
    return { to: 'file', file: r.file, append: r.append };
  }

  /** Reads a file for `< file`, with the same checks the kernel makes, or returns the error text. */
  private readRedirect(file: string): string | { error: string } {
    const who = this.credentials();
    const found = this.fs.lookupAs(this.resolve(file), who);
    if (!found.ok) return { error: `bash: ${file}: ${ERRORS[found.code]}\n` };
    if (found.node.type === 'dir') return { error: `bash: ${file}: ${ERRORS.EISDIR}\n` };
    if (!canAccess(found.node, who, 'r')) return { error: `bash: ${file}: ${ERRORS.EACCES}\n` };
    return found.node.content;
  }

  /** Writes a command's output to a file for `>`/`>>`, checking permissions as the kernel would. */
  private writeRedirect(redirect: { file: string; append: boolean }, content: string): string | null {
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

/** Whether a parsed line's final command is the pager, so a following lone `q` is swallowed. */
function endsWithPager(stages: Stage[]): boolean {
  const lastStage = stages[stages.length - 1];
  const segment = lastStage?.pipeline[lastStage.pipeline.length - 1];
  const name = segment?.words[0]?.map((f) => f.text).join('');
  return name === 'less';
}

/** Splits a glob pattern into path components without breaking on an escaped slash. */
function splitPatternComponents(pattern: string): string[] {
  const parts: string[] = [];
  let current = '';
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] === '\\' && i + 1 < pattern.length) {
      current += pattern[i] + pattern[i + 1];
      i++;
      continue;
    }
    if (pattern[i] === '/') {
      parts.push(current);
      current = '';
      continue;
    }
    current += pattern[i];
  }
  parts.push(current);
  return parts.filter((p) => p !== '');
}

/** Removes a component's globber escaping to get the literal name it stands for. */
function unescapeComponent(component: string): string {
  let out = '';
  for (let i = 0; i < component.length; i++) {
    if (component[i] === '\\' && i + 1 < component.length) {
      out += component[i + 1];
      i++;
    } else {
      out += component[i];
    }
  }
  return out;
}

/** Joins a child name onto a directory path. */
function joinChild(dir: string, name: string): string {
  return dir === '/' ? `/${name}` : `${dir}/${name}`;
}

/** Expresses an absolute path relative to cwd when it is at or below it, so globs echo as typed. */
function relativeTo(cwd: string, path: string): string {
  if (cwd === '/') return path.replace(/^\//, '') || '/';
  if (path === cwd) return '.';
  if (path.startsWith(cwd + '/')) return path.slice(cwd.length + 1);
  return path;
}
