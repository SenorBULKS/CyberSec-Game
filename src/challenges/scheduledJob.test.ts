import { describe, expect, it } from 'vitest';
import { ChallengeRun } from '../game/ChallengeRun';
import { lookupTerm } from '../game/glossary';
import { scheduledJob } from './scheduledJob';

const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');
const run = (r: ChallengeRun, line: string) => strip(r.shell.execute(line).output);
const current = (r: ChallengeRun) => r.getSnapshot().objectives.find((o) => o.current)?.id;

/** Runs a line, answering the [sudo] password prompt if one appears. */
function sudo(r: ChallengeRun, line: string, password = 'harbor2026'): string {
  const first = r.shell.execute(line);
  return strip(first.input ? first.input.submit(password).output : first.output);
}

describe('The Scheduled Job', () => {
  it('plays start to finish the way the guided path intends', () => {
    const r = new ChallengeRun(scheduledJob);
    expect(current(r)).toBe('read-task');

    expect(run(r, 'cat task.txt')).toContain('putting that key back on a schedule');
    expect(current(r)).toBe('list-cron');

    const listing = run(r, 'ls /etc/cron.d');
    expect(listing).toContain('apt-compat');
    expect(listing).toContain('0rsync-backup');
    expect(current(r)).toBe('read-job');

    const job = run(r, 'cat /etc/cron.d/apt-compat');
    expect(job).toContain('*/5 * * * * root /usr/local/sbin/apt-compat');
    expect(current(r)).toBe('read-payload');

    const payload = run(r, 'cat /usr/local/sbin/apt-compat');
    expect(payload).toContain('authorized_keys');
    expect(payload).toContain('harbor-ops@fleet');
    expect(current(r)).toBe('weakness');

    // Seeing the directory is world-writable is the "how did they do it" step.
    expect(run(r, 'ls -ld /etc/cron.d')).toMatch(/^drwxrwxrwx/);
    expect(current(r)).toBe('remove-job');

    // Removing the rogue job needs sudo (a system file); the password is harbor2026.
    sudo(r, 'sudo rm /etc/cron.d/apt-compat');
    expect(r.shell.fs.lookup('/etc/cron.d/apt-compat').ok).toBe(false);
    expect(current(r)).toBe('submit');

    expect(run(r, 'submit harbor-ops@fleet')).toContain('Correct! Challenge complete.');
    expect(r.getSnapshot().solved).toBe(true);
  });

  it('lets an experienced player submit the key name straight away', () => {
    const r = new ChallengeRun(scheduledJob);
    // An expert who has read the script and knows the key name can report it directly.
    run(r, 'cat /usr/local/sbin/apt-compat');
    expect(run(r, 'submit harbor-ops@fleet')).toContain('Correct!');
    expect(r.getSnapshot().solved).toBe(true);
  });

  it('removes the job with a plain rm too, because the directory is world-writable', () => {
    const r = new ChallengeRun(scheduledJob);
    // newhire may delete inside /etc/cron.d without sudo: that is exactly the weakness.
    run(r, 'rm /etc/cron.d/apt-compat');
    expect(r.shell.fs.lookup('/etc/cron.d/apt-compat').ok).toBe(false);
  });

  it('accepts stat or find to spot the loose permission, not only ls -ld', () => {
    const withStat = new ChallengeRun(scheduledJob);
    run(withStat, 'cat task.txt');
    run(withStat, 'ls /etc/cron.d');
    run(withStat, 'cat /etc/cron.d/apt-compat');
    run(withStat, 'cat /usr/local/sbin/apt-compat');
    expect(current(withStat)).toBe('weakness');
    run(withStat, 'stat /etc/cron.d');
    expect(current(withStat)).toBe('remove-job');

    const withFind = new ChallengeRun(scheduledJob);
    run(withFind, 'cat task.txt');
    run(withFind, 'ls /etc/cron.d');
    run(withFind, 'cat /etc/cron.d/apt-compat');
    run(withFind, 'cat /usr/local/sbin/apt-compat');
    expect(current(withFind)).toBe('weakness');
    run(withFind, 'find /etc/cron.d -perm -0002');
    expect(current(withFind)).toBe('remove-job');
  });

  it('does not count statting the job file as finding the directory weakness', () => {
    const r = new ChallengeRun(scheduledJob);
    run(r, 'cat task.txt');
    run(r, 'ls /etc/cron.d');
    run(r, 'cat /etc/cron.d/apt-compat');
    run(r, 'cat /usr/local/sbin/apt-compat');
    expect(current(r)).toBe('weakness');
    // Statting the job file, not the directory, is not the weakness step.
    run(r, 'stat /etc/cron.d/apt-compat');
    expect(current(r)).toBe('weakness');
  });

  it('builds a world-writable /etc/cron.d with a rogue root job and a planted key', () => {
    const { machine } = scheduledJob.setup();
    const cronD = machine.fs.lookup('/etc/cron.d');
    expect(cronD.ok && (cronD.node.mode & 0o7777)).toBe(0o777);
    expect(cronD.ok && (cronD.node.mode & 0o002)).not.toBe(0);

    const job = machine.fs.lookup('/etc/cron.d/apt-compat');
    expect(job.ok && job.node.type === 'file' && job.node.content).toContain('root /usr/local/sbin/apt-compat');

    const payload = machine.fs.lookup('/usr/local/sbin/apt-compat');
    expect(payload.ok && payload.node.type === 'file' && payload.node.owner).toBe('root');

    const keys = machine.fs.lookup('/root/.ssh/authorized_keys');
    expect(keys.ok && keys.node.type === 'file' && keys.node.content).toContain('harbor-ops@fleet');
    expect(keys.ok && keys.node.mode).toBe(0o600);
  });

  it('keeps the auth log readable by the adm group, as on a real server', () => {
    const r = new ChallengeRun(scheduledJob);
    const node = r.shell.fs.lookup('/var/log/auth.log');
    expect(node.ok && node.node.type === 'file' && node.node.group).toBe('adm');
    // newhire is in adm, so the corroborating root logins are readable.
    expect(run(r, 'grep "Accepted publickey for root" /var/log/auth.log')).toContain('198.51.100.66');
  });

  it('starts after challenge 2 in the campaign timeline', () => {
    // 8 Oct 2026 is a Thursday, two days after challenge 2's Tuesday.
    expect(scheduledJob.setup().machine.clock.getTime()).toBe(new Date('2026-10-08T09:10:00').getTime());
    expect(scheduledJob.motd).toContain('Thu Oct  8');
  });

  it('defines the new glossary terms it introduces', () => {
    for (const term of ['cron', 'scheduled job', 'persistence', 'privilege escalation']) {
      expect(lookupTerm(term)).toBeTruthy();
    }
  });

  it('scopes the early triggers to their own files', () => {
    const r = new ChallengeRun(scheduledJob);
    // Reading an unrelated file does not tick "Read the note from Dana".
    run(r, 'cat /etc/hostname');
    expect(current(r)).toBe('read-task');
    run(r, 'cat task.txt');
    expect(current(r)).toBe('list-cron');
    // Listing some other directory does not satisfy the cron.d step.
    run(r, 'ls /etc');
    expect(current(r)).toBe('list-cron');
    run(r, 'ls /etc/cron.d');
    expect(current(r)).toBe('read-job');
  });
});
