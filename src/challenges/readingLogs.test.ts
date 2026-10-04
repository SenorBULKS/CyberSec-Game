import { describe, expect, it } from 'vitest';
import { ChallengeRun } from '../game/ChallengeRun';
import { lookupTerm } from '../game/glossary';
import { readingLogs } from './readingLogs';

const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');
const run = (r: ChallengeRun, line: string) => strip(r.shell.execute(line).output);
const current = (r: ChallengeRun) => r.getSnapshot().objectives.find((o) => o.current)?.id;

describe('Reading the Logs', () => {
  it('plays start to finish the way a beginner would', () => {
    const r = new ChallengeRun(readingLogs);
    expect(current(r)).toBe('read-task');

    expect(run(r, 'cat task.txt')).toContain('failed SSH logins');
    expect(current(r)).toBe('list-logs');

    expect(run(r, 'ls /var/log')).toContain('auth.log');
    expect(current(r)).toBe('size');

    expect(run(r, 'wc -l /var/log/auth.log')).toMatch(/\d+ \/var\/log\/auth\.log/);
    expect(current(r)).toBe('tail');

    // The end of the log is the normal morning activity.
    expect(run(r, 'tail /var/log/auth.log')).toContain('newhire');
    expect(current(r)).toBe('failed');

    const failed = run(r, 'grep "Failed password" /var/log/auth.log');
    expect(failed).toContain('198.51.100.66');
    expect(failed).toContain('Failed password for mwalker');
    expect(current(r)).toBe('count');

    // 13 failed attempts in the burst.
    expect(run(r, 'grep "Failed password" /var/log/auth.log | wc -l')).toBe('13\n');
    expect(current(r)).toBe('accepted');

    const accepted = run(r, 'grep Accepted /var/log/auth.log');
    expect(accepted).toContain('Accepted password for mwalker from 198.51.100.66');
    expect(current(r)).toBe('submit');

    expect(run(r, 'submit 198.51.100.66')).toContain('Correct! Challenge complete.');
    expect(r.getSnapshot().solved).toBe(true);
  });

  it('lets an experienced player go straight to the answer', () => {
    const r = new ChallengeRun(readingLogs);
    // One grep for the successful login tells the whole story.
    expect(run(r, 'grep Accepted /var/log/auth.log')).toContain('mwalker from 198.51.100.66');
    expect(current(r)).toBe('submit');
    expect(run(r, 'submit 198.51.100.66')).toContain('Correct!');
    expect(r.getSnapshot().solved).toBe(true);
  });

  it('counts the failures with a pipe only when actually piped', () => {
    const r = new ChallengeRun(readingLogs);
    run(r, 'cat task.txt');
    run(r, 'ls /var/log');
    run(r, 'wc -l /var/log/auth.log');
    run(r, 'grep "Failed password" /var/log/auth.log');
    expect(current(r)).toBe('count');
    // A plain wc (not piped) does not satisfy the "count with a pipe" step.
    run(r, 'wc -l /var/log/auth.log');
    expect(current(r)).toBe('count');
    run(r, 'grep "Failed password" /var/log/auth.log | wc -l');
    expect(current(r)).toBe('accepted');
  });

  it('only the admin (adm group) can read the auth log', () => {
    const r = new ChallengeRun(readingLogs);
    // newhire is in adm, so this succeeds.
    expect(run(r, 'grep Accepted /var/log/auth.log')).toContain('mwalker');
    // A normal user without adm would be refused; check the file's protection directly.
    const node = r.shell.fs.lookup('/var/log/auth.log');
    expect(node.ok && node.node.type === 'file' && node.node.group).toBe('adm');
    expect(node.ok && node.node.mode).toBe(0o640);
  });

  it('defines the new glossary terms it introduces', () => {
    for (const term of ['log file', 'pipe', 'brute-force', 'monitoring', 'credential stuffing']) {
      expect(lookupTerm(term)).toBeTruthy();
    }
  });

  it('scopes the early triggers to their own files (QA)', () => {
    const r = new ChallengeRun(readingLogs);
    // Reading an unrelated file does not tick "Read the note from Dana".
    run(r, 'cat /etc/hostname');
    expect(current(r)).toBe('read-task');
    run(r, 'cat task.txt');
    expect(current(r)).toBe('list-logs');
    run(r, 'ls /var/log');
    expect(current(r)).toBe('size');
    // wc on some other file does not satisfy "see how big auth.log is".
    run(r, 'wc -l /etc/passwd');
    expect(current(r)).toBe('size');
    run(r, 'wc -l /var/log/auth.log');
    expect(current(r)).toBe('tail');
    // tail on some other file does not satisfy the auth.log glance.
    run(r, 'tail /etc/passwd');
    expect(current(r)).toBe('tail');
    run(r, 'tail /var/log/auth.log');
    expect(current(r)).toBe('failed');
  });

  it('keeps the clock, banner and log dates consistent (QA)', () => {
    const r = new ChallengeRun(readingLogs);
    // 5 Oct 2026 is a Monday; the banner must agree.
    expect(readingLogs.motd).toContain('Last login: Mon Oct  5');
    const log = run(r, 'cat /var/log/auth.log');
    // Challenge 2 runs the week after challenge 1, not the same morning.
    expect(log).not.toContain('Oct  2');
    // The evening-before activity (Mon) is dated before the overnight break-in (Tue).
    expect(log).toContain('Oct  5 22:30');
    expect(log).toContain('Oct  6 02:15:44 harborline sshd[2140]: Accepted password for mwalker');
    // Files show a time, not a year, because the clock sits just after them.
    const listing = run(r, 'ls -l /var/log/auth.log');
    expect(listing).toMatch(/\d\d:\d\d \/var\/log\/auth\.log/);
    expect(listing).not.toMatch(/2026 \/var\/log\/auth\.log/);
  });
});
