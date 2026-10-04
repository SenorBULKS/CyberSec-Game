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

/** A shell whose player (newhire) is a sudoer with a password, plus a root-only secret. */
function sudoShell() {
  const machine = new Machine('harborline');
  machine.addUser({ name: 'newhire', uid: 1001, password: 'hunter2', groups: ['sudo'] });
  machine.fs.writeFile('/root/secret.txt', 'top secret\n', { owner: 'root', group: 'root', mode: 0o600 });
  return new Shell({ machine, user: 'newhire' });
}

describe('sudo', () => {
  it('runs a command as root after the right password', () => {
    const sh = sudoShell();
    // Without sudo, newhire cannot read a root-only file.
    expect(sh.execute('cat /root/secret.txt').output).toContain('Permission denied');
    const first = sh.execute('sudo cat /root/secret.txt');
    expect(first.input).toMatchObject({ prompt: '[sudo] password for newhire: ', secret: true });
    const r = first.input!.submit('hunter2');
    expect(r.output).toBe('top secret\n');
    expect(r.exitCode).toBe(0);
    // The shell is back to newhire afterwards.
    expect(sh.user).toBe('newhire');
  });

  it('rejects a wrong password', () => {
    const sh = sudoShell();
    const r = sh.execute('sudo cat /root/secret.txt').input!.submit('wrong');
    expect(r.output).toContain('Sorry, try again.');
    expect(r.exitCode).toBe(1);
  });

  it('remembers the password for later sudo calls', () => {
    const sh = sudoShell();
    sh.execute('sudo cat /root/secret.txt').input!.submit('hunter2');
    // The second sudo does not prompt again.
    const second = sh.execute('sudo cat /root/secret.txt');
    expect(second.input).toBeUndefined();
    expect(second.output).toBe('top secret\n');
  });

  it('forgets the password with sudo -k', () => {
    const sh = sudoShell();
    sh.execute('sudo cat /root/secret.txt').input!.submit('hunter2');
    sh.execute('sudo -k');
    expect(sh.execute('sudo cat /root/secret.txt').input).toMatchObject({ prompt: '[sudo] password for newhire: ' });
  });

  it('asks a non-sudoer for their password first, then refuses them', () => {
    const machine = new Machine('harborline');
    machine.addUser({ name: 'guest', uid: 1005, password: 'x' });
    const sh = new Shell({ machine, user: 'guest' });
    const first = sh.execute('sudo cat /etc/shadow');
    // Real sudo prompts before telling you that you are not a sudoer.
    expect(first.input).toMatchObject({ prompt: '[sudo] password for guest: ', secret: true });
    const r = first.input!.submit('x');
    expect(r.output).toBe('guest is not in the sudoers file. This incident will be reported.\n');
    expect(r.exitCode).toBe(1);
  });

  it('lists the allowed commands for a sudoer with sudo -l', () => {
    const sh = sudoShell();
    const first = sh.execute('sudo -l');
    expect(first.input).toMatchObject({ prompt: '[sudo] password for newhire: ' });
    const r = first.input!.submit('hunter2');
    expect(r.output).toContain('User newhire may run the following commands on harborline:');
    expect(r.output).toContain('(ALL : ALL) ALL');
    expect(r.exitCode).toBe(0);
  });

  it('tells a non-sudoer they may not run sudo with sudo -l', () => {
    const machine = new Machine('harborline');
    machine.addUser({ name: 'guest', uid: 1005, password: 'x' });
    const sh = new Shell({ machine, user: 'guest' });
    const r = sh.execute('sudo -l').input!.submit('x');
    expect(r.output).toBe('Sorry, user guest may not run sudo on harborline.\n');
    expect(r.exitCode).toBe(1);
  });

  it('emits a command event for the elevated command, run as root', () => {
    const sh = sudoShell();
    const events: { name: string; user: string }[] = [];
    sh.onEvent((e) => {
      if (e.type === 'command') events.push({ name: e.name, user: e.user });
    });
    sh.execute('sudo cat /root/secret.txt').input!.submit('hunter2');
    expect(events).toContainEqual({ name: 'cat', user: 'root' });
  });

  it('reports usage with no command, and an unknown user with -u', () => {
    const sh = sudoShell();
    expect(sh.execute('sudo').output).toContain('usage: sudo');
    expect(sh.execute('sudo -u ghost whoami').output).toContain('unknown user: ghost');
  });

  it('root uses sudo with no password', () => {
    const machine = new Machine('harborline');
    machine.fs.writeFile('/root/secret.txt', 'top secret\n', { owner: 'root', group: 'root', mode: 0o600 });
    const root = new Shell({ machine, user: 'root' });
    const r = root.execute('sudo cat /root/secret.txt');
    expect(r.input).toBeUndefined();
    expect(r.output).toBe('top secret\n');
  });
});
