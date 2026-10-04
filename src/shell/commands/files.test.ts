import { describe, expect, it } from 'vitest';
import { Machine } from '../../system/Machine';
import { modeString } from '../../fs/permissions';
import { Shell } from '../Shell';
import { applyMode } from './files';

function setup(): { shell: Shell; machine: Machine } {
  const machine = new Machine('harborline');
  machine.addUser({ name: 'newhire', uid: 1001 });
  const fs = machine.fs;
  machine.fs.mkdir('/home/newhire/work', { owner: 'newhire', group: 'newhire', mode: 0o755 });
  fs.writeFile('/home/newhire/work/report.txt', 'quarterly numbers\n', { owner: 'newhire', group: 'newhire', mode: 0o644 });
  fs.writeFile('/home/newhire/work/notes.md', '# notes\n', { owner: 'newhire', group: 'newhire', mode: 0o600 });
  fs.writeFile('/home/newhire/secret.key', 'KEY\n', { owner: 'newhire', group: 'newhire', mode: 0o644 });
  return { shell: new Shell({ machine, user: 'newhire', cwd: '/home/newhire' }), machine };
}

describe('applyMode', () => {
  it('reads octal modes, including the special bits', () => {
    expect(applyMode('644', 0o600)).toBe(0o644);
    expect(applyMode('4755', 0)).toBe(0o4755);
  });

  it('applies symbolic changes on top of the current mode', () => {
    expect(applyMode('o-r', 0o644)).toBe(0o640);
    expect(applyMode('u+x', 0o644)).toBe(0o744);
    expect(applyMode('a=r', 0o777)).toBe(0o444);
    expect(applyMode('g+w,o-rwx', 0o644)).toBe(0o660);
  });

  it('rejects nonsense', () => {
    expect(applyMode('zzz', 0o644)).toBeNull();
    expect(applyMode('9', 0o644)).toBeNull();
  });
});

describe('find', () => {
  it('lists everything under a path by default', () => {
    const out = setup().shell.execute('find work').output;
    expect(out.split('\n')).toContain('work');
    expect(out).toContain('work/report.txt');
    expect(out).toContain('work/notes.md');
  });

  it('filters by -name with a glob', () => {
    const out = setup().shell.execute('find work -name "*.txt"').output;
    expect(out).toBe('work/report.txt\n');
  });

  it('filters by -type', () => {
    const out = setup().shell.execute('find work -type d').output;
    expect(out).toBe('work\n');
  });

  it('filters by -perm exact bits', () => {
    const out = setup().shell.execute('find work -perm 600').output;
    expect(out).toBe('work/notes.md\n');
  });

  it('filters by -user', () => {
    const { shell } = setup();
    shell.fs.writeFile('/home/newhire/work/root-owned', 'x\n', { owner: 'root', group: 'root', mode: 0o644 });
    const out = shell.execute('find work -user root').output;
    expect(out).toBe('work/root-owned\n');
  });

  it('finds recently changed files with -mmin', () => {
    const { shell, machine } = setup();
    // report.txt keeps the default old mtime; touch a fresh one via a redirect.
    shell.execute('echo hi > work/fresh.log');
    machine.fs.lookup('/home/newhire/work/fresh.log'); // written with machine.clock
    const out = shell.execute('find work -mmin -60 -name "*.log"').output;
    expect(out).toBe('work/fresh.log\n');
  });

  it('reports a directory it may not read', () => {
    const { shell } = setup();
    shell.fs.mkdir('/home/newhire/work/locked', { owner: 'root', group: 'root', mode: 0o700 });
    const r = shell.execute('find work');
    expect(r.output).toContain('work/locked');
    expect(r.exitCode).toBe(1);
  });
});

describe('stat', () => {
  it('shows size, octal and symbolic mode, owner and group', () => {
    const out = setup().shell.execute('stat work/report.txt').output;
    expect(out).toContain('File: /home/newhire/work/report.txt');
    expect(out).toContain('(0644/-rw-r--r--)');
    expect(out).toContain('newhire');
    expect(out).toMatch(/Size: 18/);
  });

  it('reports a missing file', () => {
    const r = setup().shell.execute('stat nope');
    expect(r.output).toContain("cannot statx 'nope'");
    expect(r.exitCode).toBe(1);
  });
});

describe('chmod', () => {
  it('changes a file you own and emits an event', () => {
    const { shell, machine } = setup();
    const events: number[] = [];
    shell.onEvent((e) => e.type === 'chmod' && events.push(e.mode));
    expect(shell.execute('chmod 600 secret.key').exitCode).toBe(0);
    expect(machine.fs.lookup('/home/newhire/secret.key').ok && (machine.fs.lookup('/home/newhire/secret.key') as any).node.mode).toBe(0o600);
    expect(events).toEqual([0o600]);
  });

  it('accepts symbolic modes', () => {
    const { shell, machine } = setup();
    shell.execute('chmod o-r work/report.txt');
    const node = machine.fs.lookup('/home/newhire/work/report.txt');
    expect(node.ok && modeString('file', (node as any).node.mode)).toBe('-rw-r-----');
  });

  it('refuses a file you do not own', () => {
    const { shell } = setup();
    shell.fs.writeFile('/home/newhire/root.cfg', 'x\n', { owner: 'root', group: 'root', mode: 0o644 });
    const r = shell.execute('chmod 600 root.cfg');
    expect(r.output).toContain('Operation not permitted');
    expect(r.exitCode).toBe(1);
  });

  it('-R changes a whole tree', () => {
    const { shell, machine } = setup();
    shell.execute('chmod -R 700 work');
    expect((machine.fs.lookup('/home/newhire/work') as any).node.mode).toBe(0o700);
    expect((machine.fs.lookup('/home/newhire/work/report.txt') as any).node.mode).toBe(0o700);
  });

  it('rejects an invalid mode', () => {
    const r = setup().shell.execute('chmod zzz work/report.txt');
    expect(r.output).toContain('invalid mode');
    expect(r.exitCode).toBe(1);
  });
});

describe('chown', () => {
  it('needs root', () => {
    const r = setup().shell.execute('chown root secret.key');
    expect(r.output).toContain('Operation not permitted');
    expect(r.exitCode).toBe(1);
  });

  it('root changes owner and group and emits an event', () => {
    const { machine } = setup();
    machine.fs.writeFile('/root/x', 'x\n', { owner: 'root', group: 'root', mode: 0o644 });
    const root = new Shell({ machine, user: 'root', cwd: '/root' });
    const events: { owner: string; group?: string }[] = [];
    root.onEvent((e) => e.type === 'chown' && events.push({ owner: e.owner, group: e.group }));
    expect(root.execute('chown newhire:newhire x').exitCode).toBe(0);
    const node = machine.fs.lookup('/root/x') as any;
    expect(node.node.owner).toBe('newhire');
    expect(node.node.group).toBe('newhire');
    expect(events).toEqual([{ owner: 'newhire', group: 'newhire' }]);
  });

  it('rejects an unknown user', () => {
    const { machine } = setup();
    const root = new Shell({ machine, user: 'root', cwd: '/root' });
    machine.fs.writeFile('/root/x', 'x\n', { owner: 'root', group: 'root' });
    const r = root.execute('chown ghost x');
    expect(r.output).toContain('invalid user');
    expect(r.exitCode).toBe(1);
  });
});

describe('rm', () => {
  it('removes a file you own and emits an event', () => {
    const { shell, machine } = setup();
    const removed: string[] = [];
    shell.onEvent((e) => e.type === 'remove' && removed.push(e.path));
    expect(shell.execute('rm secret.key').exitCode).toBe(0);
    expect(machine.fs.lookup('/home/newhire/secret.key').ok).toBe(false);
    expect(removed).toEqual(['/home/newhire/secret.key']);
  });

  it('will not remove a directory without -r', () => {
    const r = setup().shell.execute('rm work');
    expect(r.output).toContain('Is a directory');
    expect(r.exitCode).toBe(1);
  });

  it('-r removes a directory and its contents', () => {
    const { shell, machine } = setup();
    expect(shell.execute('rm -r work').exitCode).toBe(0);
    expect(machine.fs.lookup('/home/newhire/work').ok).toBe(false);
  });

  it('a missing file is an error, but -f stays quiet', () => {
    const { shell } = setup();
    expect(shell.execute('rm nope').exitCode).toBe(1);
    const forced = shell.execute('rm -f nope');
    expect(forced.exitCode).toBe(0);
    expect(forced.output).toBe('');
  });

  it('will not remove a file in a directory you cannot write', () => {
    const { shell, machine } = setup();
    machine.fs.mkdir('/opt/app', { owner: 'root', group: 'root', mode: 0o755 });
    machine.fs.writeFile('/opt/app/config', 'x\n', { owner: 'root', group: 'root', mode: 0o644 });
    const r = shell.execute('rm /opt/app/config');
    expect(r.output).toContain('Permission denied');
    expect(r.exitCode).toBe(1);
    expect(machine.fs.lookup('/opt/app/config').ok).toBe(true);
  });

  it('honours the sticky bit: only remove what you own in /tmp', () => {
    const { shell, machine } = setup();
    machine.fs.writeFile('/tmp/theirs', 'x\n', { owner: 'root', group: 'root', mode: 0o666 });
    const r = shell.execute('rm /tmp/theirs');
    expect(r.output).toContain('Operation not permitted');
    expect(machine.fs.lookup('/tmp/theirs').ok).toBe(true);
  });
});

describe('writing a file emits a write event', () => {
  it('reports a redirect as a write and keeps the owner on append', () => {
    const { shell, machine } = setup();
    const writes: string[] = [];
    shell.onEvent((e) => e.type === 'write' && writes.push(e.path));
    shell.execute('echo new > work/created.txt');
    shell.execute('echo more >> work/report.txt');
    expect(writes).toEqual(['/home/newhire/work/created.txt', '/home/newhire/work/report.txt']);
    const report = machine.fs.lookup('/home/newhire/work/report.txt') as any;
    expect(report.node.content).toBe('quarterly numbers\nmore\n');
    expect(report.node.owner).toBe('newhire');
  });
});
