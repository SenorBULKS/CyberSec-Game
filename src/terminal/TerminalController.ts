import type { Shell } from '../shell/Shell';
import { formatColumns } from '../shell/format';
import { LineEditor } from './LineEditor';

/** The part of an xterm.js Terminal the controller needs. */
export interface TerminalLike {
  readonly cols: number;
  write(data: string): void;
}

const CLEAR_ALL = '\x1b[2J\x1b[3J\x1b[H';

/** Connects an xterm.js terminal to the simulated shell: echoes typing, runs lines, prints output. */
export class TerminalController {
  readonly editor = new LineEditor();
  /** Row of the screen cursor, counted from the row where the current prompt starts. */
  private cursorRow = 0;

  constructor(
    private term: TerminalLike,
    private shell: Shell,
    private motd = '',
  ) {}

  start() {
    if (this.motd) this.write(this.motd);
    this.newPrompt();
  }

  /** Raw input from xterm's onData: a key press or a paste. */
  handleInput(data: string) {
    for (const event of this.editor.feed(data)) {
      switch (event.type) {
        case 'submit':
          this.drawLine(event.line, event.line.length);
          this.term.write('\r\n');
          this.run(event.line);
          break;
        case 'cancel':
          this.drawLine(event.line, event.line.length);
          this.term.write('^C\r\n');
          this.newPrompt();
          break;
        case 'clearScreen':
          this.term.write(CLEAR_ALL);
          this.cursorRow = 0;
          break;
        case 'complete':
          this.complete(event.repeated);
          break;
      }
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

  private run(line: string) {
    const result = this.shell.execute(line, { columns: this.term.cols });
    if (result.clearScreen) this.term.write(CLEAR_ALL);
    if (result.output) {
      // Like zsh, start the prompt on a fresh line even if output didn't end with one.
      const text = result.output.endsWith('\n') ? result.output : result.output + '\n';
      this.write(text);
    }
    this.newPrompt();
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
   * Handles lines that wrap past the terminal's width.
   */
  private drawLine(buffer: string, cursor: number) {
    const cols = this.term.cols;
    const promptLength = this.shell.promptText().length;
    let seq = '';

    if (this.cursorRow > 0) seq += `\x1b[${this.cursorRow}A`;
    seq += '\r\x1b[J' + this.shell.promptAnsi() + buffer;

    const end = promptLength + buffer.length;
    const endRow = Math.floor(end / cols);
    // At an exact multiple of the width the terminal holds the cursor on the
    // last column; step onto the next row so the arithmetic below holds.
    if (end > 0 && end % cols === 0) seq += '\r\n';

    const target = promptLength + cursor;
    const targetRow = Math.floor(target / cols);
    const targetCol = target % cols;
    if (endRow > targetRow) seq += `\x1b[${endRow - targetRow}A`;
    seq += `\x1b[${targetCol + 1}G`;

    this.cursorRow = targetRow;
    this.term.write(seq);
  }
}
