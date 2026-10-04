import { describe, expect, it } from 'vitest';
import { createBaseSystem } from '../../fs/baseSystem';
import { Shell } from '../Shell';

/** A shell on the base system with a few practice files, checked against real bash 5.1 / coreutils 8.32. */
function shell() {
  const fs = createBaseSystem('harborline');
  fs.mkdir('/home/newhire/projects', { owner: 'newhire', group: 'newhire' });
  fs.writeFile('/home/newhire/notes.txt', 'Remember to check the backups.\n', { owner: 'newhire' });
  fs.writeFile('/home/newhire/projects/todo.txt', 'one\ntwo\n', { owner: 'newhire' });
  fs.writeFile('/home/newhire/.hidden', 'secret\n');
  return new Shell({ fs });
}

const run = (sh: Shell, line: string) => sh.execute(line, { columns: 80 });

describe('pwd and cd', () => {
  it('starts in the home directory', () => {
    expect(run(shell(), 'pwd').output).toBe('/home/newhire\n');
  });

  it('moves with relative, absolute, .. and ~ paths, updating the prompt', () => {
    const sh = shell();
    run(sh, 'cd projects');
    expect(sh.promptText()).toBe('newhire@harborline:~/projects$ ');
    run(sh, 'cd ../..');
    expect(run(sh, 'pwd').output).toBe('/home\n');
    expect(sh.promptText()).toBe('newhire@harborline:/home$ ');
    run(sh, 'cd /etc');
    expect(run(sh, 'pwd').output).toBe('/etc\n');
    run(sh, 'cd ~/projects');
    expect(run(sh, 'pwd').output).toBe('/home/newhire/projects\n');
    run(sh, 'cd');
    expect(run(sh, 'pwd').output).toBe('/home/newhire\n');
  });

  it('goes back with cd - and prints where it went', () => {
    const sh = shell();
    expect(run(sh, 'cd -').output).toBe('bash: cd: OLDPWD not set\n');
    run(sh, 'cd /var/log');
    expect(run(sh, 'cd -').output).toBe('/home/newhire\n');
    expect(run(sh, 'cd -').output).toBe('/var/log\n');
  });

  it('uses the real bash error messages', () => {
    const sh = shell();
    expect(run(sh, 'cd nowhere')).toMatchObject({
      output: 'bash: cd: nowhere: No such file or directory\n',
      exitCode: 1,
    });
    expect(run(sh, 'cd notes.txt').output).toBe('bash: cd: notes.txt: Not a directory\n');
    expect(run(sh, 'cd notes.txt/x').output).toBe('bash: cd: notes.txt/x: Not a directory\n');
    expect(run(sh, 'cd a b').output).toBe('bash: cd: too many arguments\n');
    expect(run(sh, 'pwd').output).toBe('/home/newhire\n');
  });
});

describe('ls', () => {
  it('lists the current directory without hidden files, directories in blue', () => {
    expect(run(shell(), 'ls').output).toBe('notes.txt  \x1b[01;34mprojects\x1b[0m\n');
  });

  it('lists the root of the base system in sorted columns', () => {
    const out = run(shell(), 'ls /').output.replace(/\x1b\[[0-9;]*m/g, '');
    expect(out).toBe('bin   dev  home  media  opt   root  srv  tmp  var\nboot  etc  lib   mnt    proc  run   sys  usr\n');
  });

  it('narrows to more rows on a narrow terminal, matching GNU ls at 40 columns', () => {
    const out = shell().execute('ls /', { columns: 40 }).output.replace(/\x1b\[[0-9;]*m/g, '');
    expect(out).toBe(
      'bin   etc   media  proc  srv  usr\nboot  home  mnt    root  sys  var\ndev   lib   opt    run   tmp\n',
    );
  });

  it('shows /tmp with the sticky, world-writable colors and programs in green', () => {
    expect(run(shell(), 'ls /').output).toContain('\x1b[30;42mtmp\x1b[0m');
    expect(run(shell(), 'ls /usr/bin').output).toContain('\x1b[01;32mcat\x1b[0m');
  });

  it('prints a file operand by name', () => {
    expect(run(shell(), 'ls notes.txt').output).toBe('notes.txt\n');
  });

  it('lists several operands: files first, then each directory under a header', () => {
    const out = run(shell(), 'ls projects notes.txt /home').output.replace(/\x1b\[[0-9;]*m/g, '');
    expect(out).toBe('notes.txt\n\n/home:\nnewhire\n\nprojects:\ntodo.txt\n');
  });

  it('reports missing paths and keeps listing the rest', () => {
    const r = run(shell(), 'ls nope projects');
    expect(r.output).toBe("ls: cannot access 'nope': No such file or directory\nprojects:\ntodo.txt\n");
    expect(r.exitCode).toBe(2);
  });

  it('rejects options until they are supported', () => {
    expect(run(shell(), 'ls -z')).toMatchObject({
      output: "ls: invalid option -- 'z'\nTry 'ls --help' for more information.\n",
      exitCode: 2,
    });
  });

  it('prints an empty directory as nothing', () => {
    expect(run(shell(), 'ls /srv').output).toBe('');
  });
});

describe('cat', () => {
  it('prints a file', () => {
    expect(run(shell(), 'cat notes.txt').output).toBe('Remember to check the backups.\n');
  });

  it('joins several files in order', () => {
    expect(run(shell(), 'cat projects/todo.txt notes.txt').output).toBe(
      'one\ntwo\nRemember to check the backups.\n',
    );
  });

  it('reads real system files', () => {
    expect(run(shell(), 'cat /etc/hostname').output).toBe('harborline\n');
    expect(run(shell(), 'cat /etc/os-release').output).toContain('PRETTY_NAME="Ubuntu 22.04.4 LTS"');
  });

  it('uses the real cat error messages and keeps going', () => {
    const r = run(shell(), 'cat nope projects notes.txt');
    expect(r.output).toBe(
      'cat: nope: No such file or directory\ncat: projects: Is a directory\nRemember to check the backups.\n',
    );
    expect(r.exitCode).toBe(1);
  });
});
