import { describe, expect, it } from 'vitest';
import { Machine } from '../../system/Machine';
import { Shell } from '../Shell';

const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

function shell() {
  const machine = new Machine('harborline');
  machine.addUser({ name: 'newhire', uid: 1001, homeMode: 0o755 });
  const fs = machine.fs;
  fs.mkdir('/home/newhire/proj', { owner: 'newhire', group: 'newhire' });
  fs.writeFile('/home/newhire/proj/a.txt', 'a\n', { owner: 'newhire', group: 'newhire' });
  fs.mkdir('/home/newhire/proj/sub', { owner: 'newhire', group: 'newhire' });
  fs.writeFile('/home/newhire/proj/sub/b.txt', 'b\n', { owner: 'newhire', group: 'newhire' });
  return new Shell({ machine, user: 'newhire', cwd: '/home/newhire' });
}

describe('ls -R (recursive)', () => {
  it('lists a directory and each subdirectory under its own header', () => {
    const out = strip(shell().execute('ls -R proj').output);
    expect(out).toContain('proj:');
    expect(out).toContain('proj/sub:');
    // The parent is listed first, then the engine recurses into the child.
    expect(out.indexOf('proj:')).toBeLessThan(out.indexOf('proj/sub:'));
    expect(out).toContain('a.txt');
    expect(out).toContain('b.txt');
  });

  it('does not recurse without -R', () => {
    const out = strip(shell().execute('ls proj').output);
    expect(out).toContain('a.txt');
    expect(out).not.toContain('proj/sub:');
    expect(out).not.toContain('b.txt');
  });
});

describe('ls --color', () => {
  it('strips colour with --color=never', () => {
    expect(shell().execute('ls /home/newhire').output).toContain('\x1b[01;34m'); // proj is a blue dir
    expect(shell().execute('ls --color=never /home/newhire').output).not.toContain('\x1b[');
  });

  it('forces colour with --color=always even when piped', () => {
    expect(shell().execute('ls --color=always /home/newhire | cat').output).toContain('\x1b[01;34m');
  });

  it('rejects an unknown --color argument', () => {
    const r = shell().execute('ls --color=purple');
    expect(r.output).toContain("invalid argument 'purple'");
    expect(r.exitCode).toBe(2);
  });
});

describe('ls -l /dev/null', () => {
  it('shows it as a character device, not a regular empty file', () => {
    const out = strip(new Shell().execute('ls -l /dev/null').output);
    expect(out).toMatch(/^crw-rw-rw- 1 root root +1, 3 /);
  });
});
