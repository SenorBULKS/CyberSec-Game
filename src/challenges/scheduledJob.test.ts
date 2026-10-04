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

    // The weakness is the world-writable, root-run backup script with the added block.
    const script = run(r, 'cat /usr/local/bin/backup.sh');
    expect(script).toContain('rsync');
    expect(script).toContain('/etc/cron.d/apt-compat');
    expect(current(r)).toBe('submit');

    const reported = run(r, 'submit harbor-ops@fleet');
    expect(reported).toContain('Correct');
    expect(reported).not.toContain('Challenge complete');
    // Reporting the key is not the end: the job still has to be removed.
    expect(r.getSnapshot().solved).toBe(false);
    expect(current(r)).toBe('remove-job');

    // /etc/cron.d is a normal 755, so removing the job needs root.
    sudo(r, 'sudo rm /etc/cron.d/apt-compat');
    expect(r.shell.fs.lookup('/etc/cron.d/apt-compat').ok).toBe(false);
    expect(r.getSnapshot().solved).toBe(true);
  });

  it('does not let a player win by reporting the key without stopping the job', () => {
    const r = new ChallengeRun(scheduledJob);
    // The two-command shortcut QA found: read the key, submit it.
    sudo(r, 'sudo cat /root/.ssh/authorized_keys');
    expect(run(r, 'submit harbor-ops@fleet')).toContain('Correct');
    // The earlier steps tick, but the job is still there and the challenge is not solved.
    expect(r.getSnapshot().solved).toBe(false);
    expect(current(r)).toBe('remove-job');
    expect(r.shell.fs.lookup('/etc/cron.d/apt-compat').ok).toBe(true);
    // Only removing it finishes the challenge.
    sudo(r, 'sudo rm /etc/cron.d/apt-compat');
    expect(r.getSnapshot().solved).toBe(true);
  });

  it('does not let a player win by removing the job without reporting the key (QA shortcut B)', () => {
    const r = new ChallengeRun(scheduledJob);
    // Removing the job first must not skip-complete "report the key": submit is noSkip.
    sudo(r, 'sudo rm /etc/cron.d/apt-compat');
    expect(r.shell.fs.lookup('/etc/cron.d/apt-compat').ok).toBe(false);
    expect(r.getSnapshot().solved).toBe(false);
    expect(current(r)).toBe('submit');
    // Reporting the key (which the player can only know by investigating) finishes it.
    expect(run(r, 'submit harbor-ops@fleet')).toContain('Correct! Challenge complete.');
    expect(r.getSnapshot().solved).toBe(true);
  });

  it('keeps the expert panel and hints correct after removing the job first (QA expert edge)', () => {
    const r = new ChallengeRun(scheduledJob, 'expert');
    sudo(r, 'sudo rm /etc/cron.d/apt-compat');
    expect(r.getSnapshot().solved).toBe(false);

    // The expert "report the key" goal maps to submit, so it must still read as
    // not done — the panel can't show every goal ticked while the run is unsolved.
    const done = new Map(r.getSnapshot().objectives.map((o) => [o.id, o.done]));
    const reportKey = scheduledJob.expertObjectives!.find((g) => g.id === 'report-key')!;
    expect(done.get(reportKey.doneWhen)).toBe(false);

    // And a hint is still available (not "every objective is done").
    expect(r.nextHint()).toBeTruthy();

    // Reporting the key finishes it.
    run(r, 'submit harbor-ops@fleet');
    expect(r.getSnapshot().solved).toBe(true);
  });

  it('refuses a plain rm of the job and requires sudo', () => {
    const r = new ChallengeRun(scheduledJob);
    // /etc/cron.d is root-writable only now, so newhire cannot remove the file directly.
    expect(run(r, 'rm /etc/cron.d/apt-compat')).toContain('Permission denied');
    expect(r.shell.fs.lookup('/etc/cron.d/apt-compat').ok).toBe(true);
    // With sudo it works.
    sudo(r, 'sudo rm /etc/cron.d/apt-compat');
    expect(r.shell.fs.lookup('/etc/cron.d/apt-compat').ok).toBe(false);
  });

  it('builds an accurate world: root-owned cron job, world-writable root-run script', () => {
    const { machine } = scheduledJob.setup();

    // /etc/cron.d is a normal 755 directory; cron would ignore a non-root drop-in anyway.
    const cronD = machine.fs.lookup('/etc/cron.d');
    expect(cronD.ok && (cronD.node.mode & 0o7777)).toBe(0o755);

    // The rogue job and payload are root-owned (installed by a root process).
    const job = machine.fs.lookup('/etc/cron.d/apt-compat');
    expect(job.ok && job.node.type === 'file' && job.node.owner).toBe('root');
    const payload = machine.fs.lookup('/usr/local/sbin/apt-compat');
    expect(payload.ok && payload.node.type === 'file' && payload.node.owner).toBe('root');

    // The actual weakness: a root-run script that is world-writable, carrying the injected block.
    const script = machine.fs.lookup('/usr/local/bin/backup.sh');
    expect(script.ok && (script.node.mode & 0o7777)).toBe(0o777);
    expect(script.ok && script.node.type === 'file' && script.node.owner).toBe('root');
    expect(script.ok && script.node.type === 'file' && script.node.content).toContain('/usr/local/sbin/apt-compat');

    // The real Ubuntu apt-compat lives in cron.daily, making the cron.d one a disguise.
    expect(machine.fs.lookup('/etc/cron.daily/apt-compat').ok).toBe(true);

    const keys = machine.fs.lookup('/root/.ssh/authorized_keys');
    expect(keys.ok && keys.node.type === 'file' && keys.node.content).toContain('harbor-ops@fleet');
    expect(keys.ok && keys.node.mode).toBe(0o600);
  });

  it('keeps the auth log consistent with challenge 2 and readable by the adm group', () => {
    const r = new ChallengeRun(scheduledJob);
    const node = r.shell.fs.lookup('/var/log/auth.log');
    expect(node.ok && node.node.type === 'file' && node.node.group).toBe('adm');

    const log = run(r, 'cat /var/log/auth.log');
    // Root key-logins only appear after the job was planted (Wed 7 Oct 02:00), not before.
    expect(log).toContain('Oct  7 02:21:37');
    expect(log).not.toContain('Oct  6 02:17');
    // Challenge 2's mwalker session pid (2140) must not be reused here.
    expect(log).not.toContain('2140');
    // newhire is in adm, so the corroborating root logins are readable.
    expect(run(r, 'grep "Accepted publickey for root" /var/log/auth.log')).toContain('198.51.100.66');
  });

  it('starts after challenge 2 in the campaign timeline, with a coherent banner', () => {
    expect(scheduledJob.setup().machine.clock.getTime()).toBe(new Date('2026-10-08T09:10:00').getTime());
    // "Last login" is the previous session (Wed 7 Oct), not the current 8 Oct login.
    expect(scheduledJob.motd).toContain('Wed Oct  7');
    expect(scheduledJob.motd).not.toContain('Oct  8');
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
