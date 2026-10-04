import { describe, expect, it } from 'vitest';
import { LineEditor } from './LineEditor';

const UP = '\x1b[A';
const DOWN = '\x1b[B';
const LEFT = '\x1b[D';
const RIGHT = '\x1b[C';

describe('LineEditor', () => {
  it('collects typed characters and submits on Enter', () => {
    const ed = new LineEditor();
    expect(ed.feed('ls -a')).toEqual([]);
    expect(ed.buffer).toBe('ls -a');
    expect(ed.feed('\r')).toEqual([{ type: 'submit', line: 'ls -a' }]);
    expect(ed.buffer).toBe('');
  });

  it('edits in the middle of the line', () => {
    const ed = new LineEditor();
    ed.feed('ct' + LEFT + 'a');
    expect(ed.buffer).toBe('cat');
    expect(ed.cursor).toBe(2);
    ed.feed('\x7f');
    expect(ed.buffer).toBe('ct');
    ed.feed('\x01'); // Ctrl+A
    expect(ed.cursor).toBe(0);
    ed.feed('\x1b[3~'); // Delete
    expect(ed.buffer).toBe('t');
    ed.feed('\x05' + RIGHT); // Ctrl+E then Right does not pass the end
    expect(ed.cursor).toBe(1);
  });

  it('ignores Backspace at the start of the line', () => {
    const ed = new LineEditor();
    ed.feed('\x7f\x7f');
    expect(ed.buffer).toBe('');
    expect(ed.cursor).toBe(0);
  });

  it('recalls history with Up and Down, keeping the unsent draft', () => {
    const ed = new LineEditor();
    ed.feed('first\rsecond\r');
    ed.feed('dra');
    ed.feed(UP);
    expect(ed.buffer).toBe('second');
    ed.feed(UP);
    expect(ed.buffer).toBe('first');
    ed.feed(UP);
    expect(ed.buffer).toBe('first');
    ed.feed(DOWN + DOWN);
    expect(ed.buffer).toBe('dra');
    ed.feed(DOWN);
    expect(ed.buffer).toBe('dra');
  });

  it('follows ignoreboth: skips blanks, repeats and lines starting with a space', () => {
    const ed = new LineEditor();
    ed.feed('ls\rls\r\r   \r secret\rpwd\r');
    expect(ed.getHistory()).toEqual(['ls', 'pwd']);
  });

  it('cancels the line on Ctrl+C and reports what was typed', () => {
    const ed = new LineEditor();
    ed.feed('rm -rf');
    expect(ed.feed('\x03')).toEqual([{ type: 'cancel', line: 'rm -rf' }]);
    expect(ed.buffer).toBe('');
    expect(ed.getHistory()).toEqual([]);
  });

  it('kills text with Ctrl+U, Ctrl+K and Ctrl+W', () => {
    const ed = new LineEditor();
    ed.feed('cat /etc/passwd');
    ed.feed('\x17'); // Ctrl+W
    expect(ed.buffer).toBe('cat ');
    ed.feed('notes.txt' + LEFT.repeat(4) + '\x0b'); // Ctrl+K
    expect(ed.buffer).toBe('cat notes');
    ed.feed('\x15'); // Ctrl+U
    expect(ed.buffer).toBe('');
  });

  it('runs each line of a multi-line paste in order', () => {
    const ed = new LineEditor();
    expect(ed.feed('echo a\recho b\rec')).toEqual([
      { type: 'submit', line: 'echo a' },
      { type: 'submit', line: 'echo b' },
    ]);
    expect(ed.buffer).toBe('ec');
  });

  it('skips escape sequences it does not handle', () => {
    const ed = new LineEditor();
    ed.feed('a\x1b[15~b\x1bOPc'); // F5 and F1
    expect(ed.buffer).toBe('abc');
  });

  it('reports Tab and Ctrl+L', () => {
    const ed = new LineEditor();
    expect(ed.feed('\t\x0c')).toEqual([{ type: 'complete', repeated: false }, { type: 'clearScreen' }]);
  });

  it('marks a second Tab in a row as repeated', () => {
    const ed = new LineEditor();
    expect(ed.feed('\t\t')).toEqual([
      { type: 'complete', repeated: false },
      { type: 'complete', repeated: true },
    ]);
    expect(ed.feed('a\t')).toEqual([{ type: 'complete', repeated: false }]);
  });
});
