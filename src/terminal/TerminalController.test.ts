// @vitest-environment node
import { Terminal } from '@xterm/headless';
import { describe, expect, it } from 'vitest';
import { Shell } from '../shell/Shell';
import { Machine } from '../system/Machine';
import { TerminalController } from './TerminalController';

/** A real (headless) xterm.js emulator, so tests check what the player actually sees. */
async function setup(cols = 80, shell = new Shell()) {
  const term = new Terminal({ cols, rows: 24, allowProposedApi: true });
  const ctl = new TerminalController(term, shell, { motd: 'Welcome.\n\n', wait: (_ms, then) => then() });
  const flush = () => new Promise<void>((resolve) => term.write('', resolve));
  const type = async (data: string) => {
    ctl.handleInput(data);
    await flush();
  };
  const screen = () => {
    const buf = term.buffer.active;
    const lines: string[] = [];
    for (let i = 0; i < buf.length; i++) lines.push(buf.getLine(i)!.translateToString(true));
    while (lines.length && lines.at(-1) === '') lines.pop();
    return lines;
  };
  const cursor = () => ({ x: term.buffer.active.cursorX, y: term.buffer.active.cursorY });
  ctl.start();
  await flush();
  return { term, type, screen, cursor };
}

const PROMPT = 'newhire@harborline:~$ ';

function practiceShell() {
  const machine = new Machine('harborline');
  machine.addUser({ name: 'mwalker', uid: 1000, password: 'letmein' });
  machine.addUser({ name: 'newhire', uid: 1001 });
  return new Shell({ machine });
}

describe('TerminalController', () => {
  it('shows the welcome text and a prompt with the cursor after it', async () => {
    const t = await setup();
    expect(t.screen()).toEqual(['Welcome.', '', PROMPT]);
    expect(t.cursor()).toEqual({ x: PROMPT.length, y: 2 });
  });

  it('runs a command and prints its output under it', async () => {
    const t = await setup();
    await t.type('echo hello\r');
    expect(t.screen().slice(2)).toEqual([PROMPT + 'echo hello', 'hello', PROMPT]);
  });

  it('shows "command not found" for unknown commands', async () => {
    const t = await setup();
    await t.type('hack\r');
    expect(t.screen()).toContain('hack: command not found');
  });

  it('redraws correctly when editing mid-line', async () => {
    const t = await setup();
    await t.type('eco hi\x1b[D\x1b[D\x1b[D\x1b[Dh');
    expect(t.screen().at(-1)).toBe(PROMPT + 'echo hi');
    expect(t.cursor().x).toBe(PROMPT.length + 3);
  });

  it('replaces a longer line fully when recalling a shorter one from history', async () => {
    const t = await setup();
    await t.type('echo a\r');
    await t.type('echo a much longer line');
    await t.type('\x1b[A');
    expect(t.screen().at(-1)).toBe(PROMPT + 'echo a');
  });

  it('wraps long lines and keeps the cursor in the right place', async () => {
    const t = await setup(30); // prompt is 22 wide, so typing wraps quickly
    await t.type('echo 1234567890abcdef');
    expect(t.screen().slice(-2)).toEqual([PROMPT + 'echo 123', '4567890abcdef']);
    await t.type('\x01'); // Ctrl+A: back to the first row
    expect(t.cursor()).toEqual({ x: PROMPT.length, y: 2 });
    await t.type('\x05\r');
    expect(t.screen().slice(-3)).toEqual(['4567890abcdef', '1234567890abcdef', PROMPT]);
  });

  it('handles a line that exactly fills the width', async () => {
    const t = await setup(30);
    await t.type('echo 123'); // 22 + 8 = 30 characters
    expect(t.cursor()).toEqual({ x: 0, y: 3 });
    await t.type('\x7f');
    expect(t.screen().at(-1)).toBe(PROMPT + 'echo 12');
    expect(t.cursor()).toEqual({ x: 29, y: 2 });
  });

  it('shows ^C and a fresh prompt on Ctrl+C', async () => {
    const t = await setup();
    await t.type('rm -rf /\x03');
    expect(t.screen().slice(-2)).toEqual([PROMPT + 'rm -rf /^C', PROMPT]);
  });

  it('clears the screen with `clear` and with Ctrl+L', async () => {
    const t = await setup();
    await t.type('echo one\rclear\r');
    expect(t.screen()).toEqual([PROMPT]);
    await t.type('echo two\recho x\x0c');
    expect(t.screen()).toEqual([PROMPT + 'echo x']);
  });

  it('asks for a password without showing it, then becomes the other user', async () => {
    const t = await setup(80, practiceShell());
    await t.type('su mwalker\r');
    expect(t.screen().at(-1)).toBe('Password: ');
    await t.type('letmein');
    expect(t.screen().at(-1)).toBe('Password: ');
    expect(t.cursor().x).toBe('Password: '.length);
    await t.type('\r');
    // Like real su without '-', the directory stays where it was.
    expect(t.screen().at(-1)).toBe('mwalker@harborline:/home/newhire$ ');
    await t.type('whoami\r');
    expect(t.screen().slice(-2)).toEqual(['mwalker', 'mwalker@harborline:/home/newhire$ ']);
    await t.type('exit\r');
    expect(t.screen().slice(-2)).toEqual(['exit', PROMPT]);
  });

  it('says "Authentication failure" for a wrong password', async () => {
    const t = await setup(80, practiceShell());
    await t.type('su mwalker\rguess\r');
    expect(t.screen().slice(-3)).toEqual(['Password: ', 'su: Authentication failure', PROMPT]);
  });

  it('never puts a typed password into the command history', async () => {
    const t = await setup(80, practiceShell());
    await t.type('su mwalker\rletmein\rexit\r');
    await t.type('\x1b[A\x1b[A\x1b[A');
    expect(t.screen().at(-1)).toBe(PROMPT + 'su mwalker');
  });

  it('cancels a password prompt with Ctrl+C', async () => {
    const t = await setup(80, practiceShell());
    await t.type('su mwalker\rlet\x03');
    expect(t.screen().slice(-2)).toEqual(['Password: ^C', PROMPT]);
    await t.type('whoami\r');
    expect(t.screen().at(-2)).toBe('newhire');
  });

  it('starts the next prompt on a new line after output without a newline', async () => {
    const t = await setup();
    await t.type('echo -n hi\r');
    expect(t.screen().slice(-2)).toEqual(['hi', PROMPT]);
  });
});
