/**
 * Keyboard handling for the line being typed at the prompt, modelled on bash's
 * default (emacs-style) readline keys. Pure state, no rendering: the terminal
 * view feeds it raw input and redraws the line from `buffer` and `cursor`.
 */
export type EditorEvent =
  | { type: 'submit'; line: string }
  | { type: 'cancel'; line: string }
  | { type: 'clearScreen' }
  | { type: 'complete'; repeated: boolean };

const KEYS: Record<string, string> = {
  '\r': 'enter',
  '\n': 'enter',
  '\x7f': 'backspace',
  '\b': 'backspace',
  '\x1b[3~': 'delete',
  '\x1b[A': 'up',
  '\x1bOA': 'up',
  '\x1b[B': 'down',
  '\x1bOB': 'down',
  '\x1b[C': 'right',
  '\x1bOC': 'right',
  '\x1b[D': 'left',
  '\x1bOD': 'left',
  '\x1b[H': 'home',
  '\x1bOH': 'home',
  '\x1b[1~': 'home',
  '\x01': 'home',
  '\x1b[F': 'end',
  '\x1bOF': 'end',
  '\x1b[4~': 'end',
  '\x05': 'end',
  '\x03': 'interrupt',
  '\x0c': 'clearScreen',
  '\x15': 'killToStart',
  '\x0b': 'killToEnd',
  '\x17': 'killWord',
  '\t': 'tab',
};

// Longest first so multi-byte escape sequences win over their prefixes.
const KEY_SEQUENCES = Object.keys(KEYS).sort((a, b) => b.length - a.length);

export class LineEditor {
  buffer = '';
  cursor = 0;
  private history: string[] = [];
  /** Position while browsing history; equals history.length when editing a new line. */
  private historyIndex = 0;
  /** The unsent line saved when the player starts browsing history. */
  private draft = '';
  /** Whether the previous key was Tab, so a second Tab can list the choices. */
  private lastWasTab = false;
  /**
   * Password entry: the line is not shown, not saved to history, and the
   * arrow keys cannot pull earlier commands into it.
   */
  secret = false;

  /** Feeds raw terminal input (one key or a whole paste). Returns what happened. */
  feed(data: string): EditorEvent[] {
    const events: EditorEvent[] = [];
    let i = 0;
    while (i < data.length) {
      const seq = KEY_SEQUENCES.find((s) => data.startsWith(s, i));
      if (seq) {
        const key = KEYS[seq];
        const event = this.handleKey(key);
        if (event) events.push(event);
        this.lastWasTab = key === 'tab';
        i += seq.length;
        continue;
      }
      this.lastWasTab = false;
      const ch = data[i];
      if (ch === '\x1b') {
        // An escape sequence we don't support (e.g. F-keys): skip it whole.
        const match = /^\x1b(\[[0-9;]*[~A-Za-z]|O[A-Za-z])?/.exec(data.slice(i));
        i += match ? match[0].length : 1;
        continue;
      }
      if (ch >= ' ') this.insert(ch);
      i++;
    }
    return events;
  }

  /** Bash-style history listing, oldest first. */
  getHistory(): readonly string[] {
    return this.history;
  }

  /** Inserts text at the cursor, e.g. the rest of a Tab-completed name. */
  insert(text: string) {
    this.buffer = this.buffer.slice(0, this.cursor) + text + this.buffer.slice(this.cursor);
    this.cursor += text.length;
  }

  /** Puts earlier commands back into history, e.g. when a saved game is resumed. */
  restoreHistory(lines: readonly string[]) {
    for (const line of lines) this.remember(line);
    this.resetLine();
  }

  private remember(line: string) {
    // Ubuntu's default HISTCONTROL=ignoreboth: skip blank lines, lines that
    // start with a space, and repeats of the previous command.
    if (line.trim() !== '' && !line.startsWith(' ') && this.history.at(-1) !== line) this.history.push(line);
  }

  private setLine(line: string) {
    this.buffer = line;
    this.cursor = line.length;
  }

  private resetLine() {
    this.setLine('');
    this.historyIndex = this.history.length;
    this.draft = '';
  }

  private handleKey(key: string): EditorEvent | undefined {
    switch (key) {
      case 'enter': {
        const line = this.buffer;
        if (!this.secret) this.remember(line);
        this.resetLine();
        return { type: 'submit', line };
      }
      case 'interrupt': {
        const line = this.buffer;
        this.resetLine();
        return { type: 'cancel', line };
      }
      case 'clearScreen':
        return { type: 'clearScreen' };
      case 'tab':
        return { type: 'complete', repeated: this.lastWasTab };
      case 'backspace':
        if (this.cursor > 0) {
          this.buffer = this.buffer.slice(0, this.cursor - 1) + this.buffer.slice(this.cursor);
          this.cursor--;
        }
        return;
      case 'delete':
        this.buffer = this.buffer.slice(0, this.cursor) + this.buffer.slice(this.cursor + 1);
        return;
      case 'left':
        this.cursor = Math.max(0, this.cursor - 1);
        return;
      case 'right':
        this.cursor = Math.min(this.buffer.length, this.cursor + 1);
        return;
      case 'home':
        this.cursor = 0;
        return;
      case 'end':
        this.cursor = this.buffer.length;
        return;
      case 'killToStart':
        this.buffer = this.buffer.slice(this.cursor);
        this.cursor = 0;
        return;
      case 'killToEnd':
        this.buffer = this.buffer.slice(0, this.cursor);
        return;
      case 'killWord': {
        const before = this.buffer.slice(0, this.cursor);
        const kept = before.replace(/\S*\s*$/, '');
        this.buffer = kept + this.buffer.slice(this.cursor);
        this.cursor = kept.length;
        return;
      }
      case 'up':
        if (!this.secret && this.historyIndex > 0) {
          if (this.historyIndex === this.history.length) this.draft = this.buffer;
          this.historyIndex--;
          this.setLine(this.history[this.historyIndex]);
        }
        return;
      case 'down':
        if (!this.secret && this.historyIndex < this.history.length) {
          this.historyIndex++;
          this.setLine(
            this.historyIndex === this.history.length ? this.draft : this.history[this.historyIndex],
          );
        }
        return;
    }
  }
}
