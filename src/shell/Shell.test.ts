import { describe, expect, it } from 'vitest';
import { Shell } from './Shell';

describe('Shell', () => {
  it('echoes its arguments', () => {
    const r = new Shell().execute('echo hello   world');
    expect(r).toEqual({ output: 'hello world\n', exitCode: 0, clearScreen: false });
  });

  it('echo -n leaves off the newline', () => {
    expect(new Shell().execute('echo -n hi').output).toBe('hi');
  });

  it('reports unknown commands with exit code 127', () => {
    const r = new Shell().execute('nmap 10.0.0.1');
    expect(r.output).toBe('nmap: command not found\n');
    expect(r.exitCode).toBe(127);
  });

  it('does nothing for an empty line', () => {
    expect(new Shell().execute('   ').output).toBe('');
  });

  it('asks the terminal to clear for `clear`', () => {
    expect(new Shell().execute('clear').clearScreen).toBe(true);
  });

  it('lists every command in `help`', () => {
    const out = new Shell().execute('help').output;
    for (const name of ['clear', 'echo', 'help']) expect(out).toContain(`  ${name} `);
  });

  it('describes one command with `help <name>`', () => {
    expect(new Shell().execute('help echo').output).toBe('echo: Print text back to the screen\n');
    const r = new Shell().execute('help nope');
    expect(r.exitCode).toBe(1);
    expect(r.output).toContain('no help topics match');
  });

  it('reports a syntax error for an unclosed quote', () => {
    const r = new Shell().execute("echo 'x");
    expect(r.output).toBe("bash: unexpected EOF while looking for matching `''\n");
    expect(r.exitCode).toBe(2);
  });

  it('builds an Ubuntu-style prompt', () => {
    expect(new Shell().promptText()).toBe('newhire@harborline:~$ ');
  });
});
