import { describe, expect, it } from 'vitest';
import { Machine } from '../../system/Machine';
import { Shell } from '../Shell';

function shell(): { shell: Shell; machine: Machine } {
  const machine = new Machine('harborline');
  machine.addUser({ name: 'newhire', uid: 1001 });
  return { shell: new Shell({ machine, user: 'newhire' }), machine };
}

describe('ps', () => {
  it('with no args shows only the session’s own processes', () => {
    const out = shell().shell.execute('ps').output;
    expect(out).toContain('PID TTY');
    expect(out).toContain('bash');
    expect(out).toContain('ps');
    // Daemons are not listed without "aux".
    expect(out).not.toContain('sshd');
  });

  it('ps aux lists every process with its owner', () => {
    const out = shell().shell.execute('ps aux').output;
    expect(out).toContain('USER');
    expect(out).toContain('/usr/sbin/sshd -D');
    expect(out).toMatch(/root\s+1\s+\?\s+Ss\s+\/sbin\/init/);
  });

  it('ps -ef also shows everything', () => {
    expect(shell().shell.execute('ps -ef').output).toContain('/usr/sbin/cron -f');
  });

  it('shows a process a challenge added', () => {
    const { shell: sh, machine } = shell();
    machine.addProcess({ user: 'root', command: '/usr/local/bin/backdoor --listen 4444' });
    expect(sh.execute('ps aux').output).toContain('/usr/local/bin/backdoor --listen 4444');
  });
});

describe('ss', () => {
  it('lists the listening sockets', () => {
    const out = shell().shell.execute('ss -tln').output;
    expect(out).toContain('Local Address:Port');
    expect(out).toContain('0.0.0.0:22');
  });

  it('-p shows the process holding the socket', () => {
    expect(shell().shell.execute('ss -tlnp').output).toContain('users:(("sshd",pid=788))');
  });

  it('shows a socket a challenge opened', () => {
    const { shell: sh, machine } = shell();
    machine.addSocket({ proto: 'tcp', address: '0.0.0.0', port: 4444, process: 'backdoor', pid: 3030 });
    const out = sh.execute('ss -tlnp').output;
    expect(out).toContain('0.0.0.0:4444');
    expect(out).toContain('backdoor');
  });

  it('-u with no -t limits it to UDP (none here by default)', () => {
    const out = shell().shell.execute('ss -uln').output;
    expect(out).not.toContain(':22');
  });
});
