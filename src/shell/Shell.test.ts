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

describe('Shell pipelines and redirection', () => {
  it('pipes one command into another', () => {
    const r = new Shell().execute('echo hello | cat');
    expect(r.output).toBe('hello\n');
    expect(r.exitCode).toBe(0);
  });

  it('does not also print a piped command’s output to the screen', () => {
    // cat receives "hello" on stdin; the screen shows it once, not twice.
    expect(new Shell().execute('echo hello | cat').output).toBe('hello\n');
  });

  it('writes output to a file with > and reads it back', () => {
    const shell = new Shell();
    expect(shell.execute('echo saved > note.txt').output).toBe('');
    expect(shell.execute('cat note.txt').output).toBe('saved\n');
  });

  it('overwrites with > and adds on with >>', () => {
    const shell = new Shell();
    shell.execute('echo one > f.txt');
    shell.execute('echo two >> f.txt');
    expect(shell.execute('cat f.txt').output).toBe('one\ntwo\n');
    shell.execute('echo fresh > f.txt');
    expect(shell.execute('cat f.txt').output).toBe('fresh\n');
  });

  it('refuses to redirect into a file it may not write', () => {
    const r = new Shell().execute('echo x > /etc/passwd');
    expect(r.output).toBe('bash: /etc/passwd: Permission denied\n');
    expect(r.exitCode).toBe(1);
  });

  it('refuses to redirect onto a directory', () => {
    const r = new Shell().execute('echo x > /home');
    expect(r.output).toBe('bash: /home: Is a directory\n');
    expect(r.exitCode).toBe(1);
  });

  it('reports a missing command inside a pipeline', () => {
    const r = new Shell().execute('echo hi | nope');
    expect(r.output).toBe('nope: command not found\n');
    expect(r.exitCode).toBe(127);
  });

  it('feeds a real pipeline end to end', () => {
    const r = new Shell().execute('echo hi | grep hi');
    expect(r.output).toBe('hi\n');
    expect(r.exitCode).toBe(0);
  });
});
