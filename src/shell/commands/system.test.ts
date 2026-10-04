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

describe('cron', () => {
  it('ships a readable system crontab and drop-in directory', () => {
    const { shell: sh } = shell();
    expect(sh.execute('cat /etc/crontab').output).toContain('run-parts --report /etc/cron.hourly');
    expect(sh.execute('ls /etc/cron.d').exitCode).toBe(0);
  });

  it('crontab -l shows the user’s own jobs', () => {
    const { shell: sh, machine } = shell();
    machine.setCrontab('newhire', '30 2 * * * /home/newhire/backup.sh\n');
    expect(sh.execute('crontab -l').output).toBe('30 2 * * * /home/newhire/backup.sh\n');
  });

  it('says there is no crontab when the user has none', () => {
    const { shell: sh } = shell();
    const r = sh.execute('crontab -l');
    expect(r.output).toBe('no crontab for newhire\n');
    expect(r.exitCode).toBe(1);
  });

  it('refuses -u for a non-root user', () => {
    const { shell: sh, machine } = shell();
    machine.setCrontab('root', '0 3 * * * /root/job.sh\n');
    const r = sh.execute('crontab -l -u root');
    expect(r.output).toContain('must be privileged to use -u');
    expect(r.exitCode).toBe(1);
  });
});

describe('kill', () => {
  it('stops a process the player owns and drops its sockets', () => {
    const { shell: sh, machine } = shell();
    const pid = machine.addProcess({ user: 'newhire', command: '/tmp/beacon' });
    machine.addSocket({ proto: 'tcp', address: '0.0.0.0', port: 4444, process: 'beacon', pid });
    const events: string[] = [];
    sh.onEvent((e) => e.type === 'kill' && events.push(`kill ${e.pid} sig ${e.signal}`));
    const r = sh.execute(`kill ${pid}`);
    expect(r.exitCode).toBe(0);
    expect(r.output).toBe('');
    expect(machine.process(pid)).toBeUndefined();
    expect(sh.execute('ss -tlnp').output).not.toContain('4444');
    expect(events).toEqual([`kill ${pid} sig 15`]);
  });

  it('reads -9 and -KILL as SIGKILL', () => {
    const { shell: sh, machine } = shell();
    const pid = machine.addProcess({ user: 'newhire', command: '/tmp/beacon' });
    const signals: number[] = [];
    sh.onEvent((e) => e.type === 'kill' && signals.push(e.signal));
    sh.execute(`kill -9 ${pid}`);
    const pid2 = machine.addProcess({ user: 'newhire', command: '/tmp/beacon' });
    sh.execute(`kill -KILL ${pid2}`);
    expect(signals).toEqual([9, 9]);
  });

  it('will not let a user kill another user’s process', () => {
    const { shell: sh, machine } = shell();
    const pid = machine.addProcess({ user: 'root', command: '/usr/sbin/sshd -D' });
    const r = sh.execute(`kill ${pid}`);
    expect(r.output).toContain('Operation not permitted');
    expect(r.exitCode).toBe(1);
    expect(machine.process(pid)).toBeDefined();
  });

  it('root can kill any process', () => {
    const { machine } = shell();
    const pid = machine.addProcess({ user: 'www-data', command: '/tmp/rogue' });
    const root = new Shell({ machine, user: 'root' });
    expect(root.execute(`kill ${pid}`).exitCode).toBe(0);
    expect(machine.process(pid)).toBeUndefined();
  });

  it('reports an unknown pid', () => {
    const r = shell().shell.execute('kill 99999');
    expect(r.output).toContain('(99999) - No such process');
    expect(r.exitCode).toBe(1);
  });

  it('STOP pauses without ending the process', () => {
    const { shell: sh, machine } = shell();
    const pid = machine.addProcess({ user: 'newhire', command: '/tmp/beacon' });
    expect(sh.execute(`kill -STOP ${pid}`).exitCode).toBe(0);
    expect(machine.process(pid)).toBeDefined();
  });
});
