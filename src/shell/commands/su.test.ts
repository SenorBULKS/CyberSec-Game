import { describe, expect, it } from 'vitest';
import { Machine } from '../../system/Machine';
import { Shell } from '../Shell';
import { SU_FAIL_DELAY_MS } from './su';

function shell() {
  const machine = new Machine('harborline');
  machine.addUser({ name: 'mwalker', uid: 1000, password: 'Tide!Pool2024', groups: ['sudo'], homeMode: 0o755 });
  machine.addUser({ name: 'newhire', uid: 1001 });
  machine.fs.mkdir('/home/mwalker/private', { owner: 'mwalker', group: 'mwalker', mode: 0o700 });
  machine.fs.writeFile('/home/mwalker/private/handover.txt', 'notes\n', { owner: 'mwalker', mode: 0o600 });
  return new Shell({ machine });
}

/** Runs `su ...` and answers its password prompt. Messages match util-linux su on Ubuntu. */
function su(sh: Shell, line: string, password: string) {
  const first = sh.execute(line);
  expect(first.input).toMatchObject({ prompt: 'Password: ', secret: true });
  return first.input!.submit(password);
}

describe('su', () => {
  it('switches user with the right password, keeping the current directory', () => {
    const sh = shell();
    const r = su(sh, 'su mwalker', 'Tide!Pool2024');
    expect(r).toMatchObject({ output: '', exitCode: 0, delayMs: 0 });
    expect(sh.user).toBe('mwalker');
    expect(sh.cwd).toBe('/home/newhire');
    expect(sh.promptText()).toBe('mwalker@harborline:/home/newhire$ ');
    expect(sh.execute('cd').exitCode).toBe(0);
    expect(sh.execute('pwd').output).toBe('/home/mwalker\n');
  });

  it('gains the new user\'s permissions', () => {
    const sh = shell();
    expect(sh.execute('cat /home/mwalker/private/handover.txt').output).toContain('Permission denied');
    su(sh, 'su mwalker', 'Tide!Pool2024');
    expect(sh.execute('cat /home/mwalker/private/handover.txt').output).toBe('notes\n');
    expect(sh.execute('id').output).toBe('uid=1000(mwalker) gid=1000(mwalker) groups=1000(mwalker),27(sudo)\n');
  });

  it('moves to the home directory with su -', () => {
    const sh = shell();
    su(sh, 'su - mwalker', 'Tide!Pool2024');
    expect(sh.promptText()).toBe('mwalker@harborline:~$ ');
  });

  it('fails slowly with a wrong password and stays the same user', () => {
    const sh = shell();
    const r = su(sh, 'su mwalker', 'tide!pool2024');
    expect(r).toMatchObject({ output: 'su: Authentication failure\n', exitCode: 1, delayMs: SU_FAIL_DELAY_MS });
    expect(sh.user).toBe('newhire');
  });

  it('cannot become root: the root account has no password on Ubuntu', () => {
    const sh = shell();
    expect(su(sh, 'su', '').output).toBe('su: Authentication failure\n');
    expect(su(sh, 'su root', 'root').output).toBe('su: Authentication failure\n');
  });

  it('reports unknown users without asking for a password', () => {
    const r = shell().execute('su nosuch');
    expect(r.input).toBeUndefined();
    expect(r.output).toBe(
      'su: user nosuch does not exist or the user entry does not contain all the required fields\n',
    );
  });

  it('returns to the previous user and directory with exit', () => {
    const sh = shell();
    sh.execute('cd /tmp');
    su(sh, 'su - mwalker', 'Tide!Pool2024');
    expect(sh.execute('exit').output).toBe('exit\n');
    expect(sh.user).toBe('newhire');
    expect(sh.cwd).toBe('/tmp');
  });

  it('explains that exit in the first shell has nowhere to go', () => {
    const sh = shell();
    expect(sh.execute('exit').output).toContain('nothing to exit back to');
    expect(sh.user).toBe('newhire');
  });

  it('lets root become anyone without a password, with a # prompt', () => {
    const machine = new Machine('harborline');
    machine.addUser({ name: 'newhire', uid: 1001 });
    const sh = new Shell({ machine, user: 'root', cwd: '/root' });
    expect(sh.promptText()).toBe('root@harborline:~# ');
    const r = sh.execute('su newhire');
    expect(r.input).toBeUndefined();
    expect(sh.user).toBe('newhire');
  });

  it('shows su as a setuid program', () => {
    const out = shell().execute('ls -l /usr/bin/su').output;
    expect(out.startsWith('-rwsr-xr-x 1 root root')).toBe(true);
  });
});

describe('/etc/shadow', () => {
  it('holds password hashes that only root and the shadow group can read', () => {
    const sh = shell();
    expect(sh.execute('cat /etc/shadow').output).toBe('cat: /etc/shadow: Permission denied\n');
    expect(sh.execute('ls -l /etc/shadow').output).toMatch(/^-rw-r----- 1 root shadow /);
    const root = new Shell({ machine: sh.machine, user: 'root', cwd: '/root' });
    const shadow = root.execute('cat /etc/shadow').output;
    expect(shadow).toMatch(/^root:\*:/);
    expect(shadow).toMatch(/\nmwalker:\$y\$j9T\$[./0-9A-Za-z]{22}\$[./0-9A-Za-z]{43}:/);
    expect(shadow).toContain('\nnewhire:!:');
    expect(shadow).not.toContain('Tide!Pool2024');
  });
});
