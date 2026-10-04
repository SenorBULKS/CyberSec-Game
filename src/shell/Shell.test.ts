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

describe('Shell stream redirection', () => {
  it('ls writes one name per line when its output is piped', () => {
    const sh = new Shell();
    sh.execute('echo a > ~/a.txt');
    sh.execute('echo b > ~/b.txt');
    sh.execute('echo c > ~/c.txt');
    // Piped, ls is one-per-line, so wc -l counts the files (not columns on one line).
    expect(sh.execute('ls ~ | wc -l').output).toBe('3\n');
  });

  it('ls still lays out columns on the terminal', () => {
    const sh = new Shell();
    sh.execute('echo a > ~/a.txt');
    sh.execute('echo b > ~/b.txt');
    expect(sh.execute('ls ~').output).toBe('a.txt  b.txt\n');
  });

  it('sends stderr to a file with 2> and keeps stdout on the screen', () => {
    const sh = new Shell();
    expect(sh.execute('cat missing 2> err.log').output).toBe('');
    expect(sh.execute('cat err.log').output).toBe('cat: missing: No such file or directory\n');
  });

  it('appends stderr with 2>>', () => {
    const sh = new Shell();
    sh.execute('cat one 2> err.log');
    sh.execute('cat two 2>> err.log');
    expect(sh.execute('cat err.log').output).toBe(
      'cat: one: No such file or directory\ncat: two: No such file or directory\n',
    );
  });

  it('discards stderr with 2>/dev/null', () => {
    const r = new Shell().execute('cat missing 2>/dev/null');
    expect(r.output).toBe('');
  });

  it('merges stderr into stdout with 2>&1', () => {
    const r = new Shell().execute('cat missing 2>&1 | cat');
    expect(r.output).toBe('cat: missing: No such file or directory\n');
  });

  it('sends both streams to one file with &>', () => {
    const sh = new Shell();
    sh.execute('echo hi > have.txt');
    sh.execute('cat have.txt missing &> both.log');
    expect(sh.execute('cat both.log').output).toBe('hi\ncat: missing: No such file or directory\n');
  });

  it('reads a file as standard input with <', () => {
    const sh = new Shell();
    sh.execute('echo fromfile > in.txt');
    expect(sh.execute('cat < in.txt').output).toBe('fromfile\n');
  });

  it('reports a missing input file for <', () => {
    const r = new Shell().execute('cat < nope.txt');
    expect(r.output).toBe('bash: nope.txt: No such file or directory\n');
    expect(r.exitCode).toBe(1);
  });

  it('discards writes to /dev/null and reads it back empty', () => {
    const sh = new Shell();
    expect(sh.execute('echo gone > /dev/null').output).toBe('');
    expect(sh.execute('cat /dev/null').output).toBe('');
  });

  it('suppresses a command-not-found error with 2>/dev/null', () => {
    const r = new Shell().execute('nope 2>/dev/null');
    expect(r.output).toBe('');
    expect(r.exitCode).toBe(127);
  });
});

describe('Shell command chaining', () => {
  it('runs both sides of ; regardless of exit code', () => {
    const r = new Shell().execute('echo one ; echo two');
    expect(r.output).toBe('one\ntwo\n');
  });

  it('runs the right of && only when the left succeeds', () => {
    expect(new Shell().execute('echo a && echo b').output).toBe('a\nb\n');
    // A failing command (cd into nothing) stops &&.
    const r = new Shell().execute('cd /nope && echo reached');
    expect(r.output).not.toContain('reached');
  });

  it('runs the right of || only when the left fails', () => {
    expect(new Shell().execute('echo a || echo b').output).toBe('a\n');
    expect(new Shell().execute('cd /nope || echo recovered').output).toContain('recovered');
  });

  it('carries the last command’s exit code', () => {
    expect(new Shell().execute('echo a ; nope').exitCode).toBe(127);
  });

  it('has true and false, which succeed and fail silently', () => {
    expect(new Shell().execute('true').output).toBe('');
    expect(new Shell().execute('true').exitCode).toBe(0);
    expect(new Shell().execute('false').exitCode).toBe(1);
    // The classic idiom: false falls through && to its ||.
    expect(new Shell().execute('false && echo no || echo yes').output).toBe('yes\n');
  });
});

describe('Shell history', () => {
  it('lists the commands run this session, numbered, including itself', () => {
    const shell = new Shell();
    shell.execute('whoami');
    shell.execute('ls /home');
    const out = shell.execute('history').output;
    expect(out).toBe('    1  whoami\n    2  ls /home\n    3  history\n');
  });

  it('history N shows only the last N, keeping their numbers', () => {
    const shell = new Shell();
    shell.execute('one');
    shell.execute('two');
    shell.execute('three');
    expect(shell.execute('history 2').output).toBe('    3  three\n    4  history 2\n');
  });

  it('history -c clears it', () => {
    const shell = new Shell();
    shell.execute('whoami');
    shell.execute('history -c');
    expect(shell.execute('history').output).toBe('    1  history\n');
  });

  it('can be filtered through a pipe (and shows itself, as bash does)', () => {
    const shell = new Shell();
    shell.execute('cat /etc/passwd');
    shell.execute('whoami');
    // grep matches the earlier entry and the `history | grep passwd` line itself.
    expect(shell.execute('history | grep passwd').output).toBe('    1  cat /etc/passwd\n    3  history | grep passwd\n');
  });
});

describe('Shell expansion', () => {
  it('expands $HOME, $USER and ${HOME}', () => {
    expect(new Shell().execute('echo $HOME').output).toBe('/home/newhire\n');
    expect(new Shell().execute('echo $USER').output).toBe('newhire\n');
    expect(new Shell().execute('echo ${HOME}/notes').output).toBe('/home/newhire/notes\n');
  });

  it('expands $? to the previous exit code', () => {
    const shell = new Shell();
    shell.execute('nope');
    expect(shell.execute('echo $?').output).toBe('127\n');
  });

  it('leaves an unset variable empty', () => {
    expect(new Shell().execute('echo [$NOPE]').output).toBe('[]\n');
  });

  it('does not expand inside single quotes', () => {
    expect(new Shell().execute("echo '$HOME'").output).toBe('$HOME\n');
  });

  it('expands variables inside double quotes', () => {
    expect(new Shell().execute('echo "home is $HOME"').output).toBe('home is /home/newhire\n');
  });

  it('expands a leading ~ to the home directory', () => {
    expect(new Shell().execute('echo ~').output).toBe('/home/newhire\n');
    expect(new Shell().execute('echo ~/work').output).toBe('/home/newhire/work\n');
  });

  it('globs * against the filesystem', () => {
    const shell = new Shell();
    shell.execute('echo a > one.log');
    shell.execute('echo b > two.log');
    shell.execute('echo c > notes.txt');
    expect(shell.execute('echo *.log').output).toBe('one.log two.log\n');
  });

  it('a glob that matches nothing stays literal', () => {
    expect(new Shell().execute('echo *.nothinghere').output).toBe('*.nothinghere\n');
  });

  it('* does not match names starting with a dot', () => {
    const shell = new Shell();
    shell.execute('echo x > visible.txt');
    // .bashrc and .profile exist in home but * should skip them.
    expect(shell.execute('echo *').output).toBe('visible.txt\n');
  });

  it('globs an absolute path and returns absolute matches', () => {
    expect(new Shell().execute('echo /etc/cron.*').output).toContain('/etc/cron.d');
  });
});
