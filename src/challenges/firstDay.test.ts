import { describe, expect, it } from 'vitest';
import { ChallengeRun } from '../game/ChallengeRun';
import { lookupTerm } from '../game/glossary';
import { firstDay } from './firstDay';

const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');
const run = (r: ChallengeRun, line: string) => strip(r.shell.execute(line).output);
const current = (r: ChallengeRun) => r.getSnapshot().objectives.find((o) => o.current)?.id;

function su(r: ChallengeRun, password: string) {
  const first = r.shell.execute('su mwalker');
  expect(first.input).toMatchObject({ prompt: 'Password: ', secret: true });
  return first.input!.submit(password);
}

describe('First Day on the Box', () => {
  it('plays start to finish the way a beginner would', () => {
    const r = new ChallengeRun(firstDay);
    expect(current(r)).toBe('whoami');
    expect(run(r, 'whoami')).toBe('newhire\n');
    expect(run(r, 'pwd')).toBe('/home/newhire\n');
    expect(run(r, 'ls')).toBe('welcome.txt\n');
    expect(run(r, 'cat welcome.txt')).toContain('Your first job: get into Marcus\'s account');
    expect(run(r, 'cd /home')).toBe('');
    expect(run(r, 'ls')).toBe('dortiz  mwalker  newhire\n');
    expect(current(r)).toBe('try-private');

    expect(run(r, 'cd dortiz')).toContain('Permission denied');
    expect(current(r)).toBe('try-private');
    run(r, 'cd mwalker');
    expect(run(r, 'ls')).toBe('private  scripts\n');
    expect(run(r, 'cd private')).toBe('bash: cd: private: Permission denied\n');
    expect(current(r)).toBe('hidden');

    expect(run(r, 'ls -a')).toBe('.  ..  .bash_history  .bashrc  .profile  private  scripts\n');
    expect(run(r, 'cat .bash_history')).toContain('sshpass -p Tidewater#22 rsync -a /var/backups/ mwalker@10.20.0.40:/srv/backups/harborline/');
    expect(current(r)).toBe('su');

    expect(su(r, 'letmein')).toMatchObject({ exitCode: 1 });
    expect(current(r)).toBe('su');
    expect(su(r, 'Tidewater#22')).toMatchObject({ exitCode: 0 });
    expect(r.shell.promptText()).toBe('mwalker@harborline:~$ ');

    expect(run(r, 'cat private/handover.txt')).toContain('Handover code: HARBOR-7741');
    expect(current(r)).toBe('submit');
    expect(run(r, 'submit HARBOR-7741')).toContain('Correct! Challenge complete.');
    expect(r.getSnapshot().solved).toBe(true);
  });

  it('accepts the shortcuts an experienced player takes', () => {
    const r = new ChallengeRun(firstDay);
    run(r, 'ls /home/mwalker/private');
    run(r, 'cat /home/mwalker/.bash_history');
    su(r, 'Tidewater#22');
    run(r, 'cat /home/mwalker/private/handover.txt');
    expect(run(r, 'submit harbor-7741')).toContain('Correct!');
    expect(r.getSnapshot().solved).toBe(true);
  });

  it('only counts the handover notes when read as Marcus', () => {
    const r = new ChallengeRun(firstDay);
    expect(run(r, 'cat /home/mwalker/private/handover.txt')).toContain('Permission denied');
    expect(r.getSnapshot().objectives.find((o) => o.id === 'handover')?.done).toBe(false);
  });

  it('shows the permissions the debrief talks about', () => {
    const r = new ChallengeRun(firstDay);
    const homes = run(r, 'ls -l /home');
    expect(homes).toMatch(/drwxr-x--- +\d+ dortiz +dortiz /);
    expect(homes).toMatch(/drwxr-xr-x +\d+ mwalker +mwalker /);
    expect(run(r, 'ls -la /home/mwalker')).toMatch(/-rw-r--r-- +1 mwalker +mwalker .* \.bash_history/);
    expect(run(r, 'ls -l /home/mwalker')).toMatch(/drwx------ +\d+ mwalker +mwalker .* private/);
  });

  it('gives every objective three hints and defines every glossary word it uses', () => {
    const texts = [firstDay.briefing, ...firstDay.debrief!.sections.map((s) => s.text)];
    for (const o of firstDay.objectives) {
      expect(o.hints, o.id).toHaveLength(3);
      texts.push(o.intro ?? '', o.outro ?? '');
    }
    const terms = texts.flatMap((t) => [...t.matchAll(/\[\[([^\]|]+)/g)].map((m) => m[1]));
    expect(terms.length).toBeGreaterThan(10);
    for (const term of terms) expect(lookupTerm(term), term).toBeDefined();
  });
});
