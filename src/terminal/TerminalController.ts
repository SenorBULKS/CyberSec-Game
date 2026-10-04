import type { ExecResult, PendingInput, Shell } from '../shell/Shell';
import { formatColumns } from '../shell/format';
import { LineEditor } from './LineEditor';

/** The part of an xterm.js Terminal the controller needs. */
export interface TerminalLike {
  readonly cols: number;
  write(data: string): void;
}

export interface ControllerOptions {
  /** Text shown before the first prompt. */
  motd?: string;
  /** Schedules delayed output; tests pass a synchronous version. */
  wait?: (ms: number, then: () => void) => void;
}

const CLEAR_ALL = '\x1b[2J\x1b[3J\x1b[H';

/** Connects an xterm.js terminal to the simulated shell: echoes typing, runs lines, prints output. */
export class TerminalController {
  readonly editor = new LineEditor();
  /** Row of the screen cursor, counted from the row where the current prompt starts. */
  private cursorRow = 0;
  /** A question a command is waiting on, such as su's password prompt. */
  private pending?: PendingInput;
  /** True while a command is "working" (e.g. su's delay); typing is ignored, as in a real shell. */
  private busy = false;
  private readonly motd: string;
  private readonly wait: (ms: number, then: () => void) => void;

  constructor(
    private term: TerminalLike,
    private shell: Shell,
    options: ControllerOptions = {},
  ) {
    this.motd = options.motd ?? '';
    this.wait = options.wait ?? ((ms, then) => setTimeout(then, ms));
  }

  start() {
    if (this.motd) this.write(this.motd);
    this.newPrompt();
  }

  /** Raw input from xterm's onData: a key press or a paste. */
  handleInput(data: string) {
    if (this.busy) return;
    for (const event of this.editor.feed(data)) {
      switch (event.type) {
        case 'submit':
          this.drawLine(event.line, event.line.length);
          this.term.write('\r\n');
          if (this.pending) this.answer(event.line);
          else this.show(this.shell.execute(event.line, { columns: this.term.cols }));
          break;
        case 'cancel':
          this.drawLine(event.line, event.line.length);
          this.term.write('^C\r\n');
          this.endInput();
          this.newPrompt();
          break;
        case 'clearScreen':
          this.term.write(CLEAR_ALL);
          this.cursorRow = 0;
          break;
        case 'complete':
          if (!this.pending) this.complete(event.repeated);
          break;
      }
      if (this.busy) return;
    }
    this.drawLine(this.editor.buffer, this.editor.cursor);
  }

  private complete(repeated: boolean) {
    const { buffer, cursor } = this.editor;
    const result = this.shell.complete(buffer, cursor);
    if (result.insert) {
      this.editor.insert(result.insert);
    } else if (repeated && result.candidates.length > 1) {
      // Second Tab with nothing more to fill in: list the choices, like bash.
      this.drawLine(buffer, buffer.length);
      this.term.write('\r\n');
      const items = result.candidates.map((c) => ({ display: c, width: c.length }));
      this.write(formatColumns(items, this.term.cols));
      this.cursorRow = 0;
    }
  }

  private answer(input: string) {
    const pending = this.pending!;
    this.endInput();
    this.show(pending.submit(input));
  }

  /** Prints a command's result, after its delay if it has one, then the next prompt. */
  private show(result: ExecResult) {
    const finish = () => {
      if (result.clearScreen) this.term.write(CLEAR_ALL);
      if (result.output) this.write(result.output);
      if (result.input) {
        this.startInput(result.input);
      } else {
        // Like zsh, start the prompt on a fresh line even if output didn't end with one.
        if (result.output && !result.output.endsWith('\n')) this.term.write('\r\n');
        this.newPrompt();
      }
    };
    if (result.delayMs) {
      this.busy = true;
      this.wait(result.delayMs, () => {
        this.busy = false;
        finish();
      });
    } else {
      finish();
    }
  }

  private startInput(input: PendingInput) {
    this.pending = input;
    this.editor.secret = input.secret;
    this.cursorRow = 0;
    this.drawLine('', 0);
  }

  private endInput() {
    this.pending = undefined;
    this.editor.secret = false;
  }

  private newPrompt() {
    this.cursorRow = 0;
    this.drawLine('', 0);
  }

  private write(text: string) {
    this.term.write(text.replace(/\r?\n/g, '\r\n'));
  }

  /**
   * Redraws the prompt and the typed line, then puts the cursor at `cursor`.
   * Handles lines that wrap past the terminal's width. Secret input is not shown.
   */
  private drawLine(buffer: string, cursor: number) {
    const cols = this.term.cols;
    const promptText = this.pending ? this.pending.prompt : this.shell.promptText();
    const promptShown = this.pending ? this.pending.prompt : this.shell.promptAnsi();
    if (this.pending?.secret) {
      buffer = '';
      cursor = 0;
    }
    let seq = '';

    if (this.cursorRow > 0) seq += `\x1b[${this.cursorRow}A`;
    seq += '\r\x1b[J' + promptShown + buffer;

    const end = promptText.length + buffer.length;
    const endRow = Math.floor(end / cols);
    // At an exact multiple of the width the terminal holds the cursor on the
    // last column; step onto the next row so the arithmetic below holds.
    if (end > 0 && end % cols === 0) seq += '\r\n';

    const target = promptText.length + cursor;
    const targetRow = Math.floor(target / cols);
    const targetCol = target % cols;
    if (endRow > targetRow) seq += `\x1b[${endRow - targetRow}A`;
    seq += `\x1b[${targetCol + 1}G`;

    this.cursorRow = targetRow;
    this.term.write(seq);
  }
}
