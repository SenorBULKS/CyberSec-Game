import { describe, expect, it } from 'vitest';
import { practice } from '../challenges/practice';
import { firstDay } from '../challenges/firstDay';
import { ChallengeRun } from './ChallengeRun';
import { anyOf, becameUser, enteredDir, listedDir, ranCommand, readFile } from './challenge';
import type { GameEvent } from './events';

const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');
const run = (r: ChallengeRun, line: string) => strip(r.shell.execute(line).output);
const status = (r: ChallengeRun) => r.getSnapshot().objectives.map((o) => `${o.done ? 'x' : ' '}${o.current ? '>' : ' '}${o.id}`);

describe('ChallengeRun', () => {
  it('starts with the first objective current and its intro queued', () => {
    const r = new ChallengeRun(practice);
    expect(status(r)).toEqual([' >look', '  read', '  submit']);
    expect(r.messages).toEqual([{ kind: 'intro', objectiveId: 'look', text: expect.stringContaining('`ls`') }]);
  });

  it('ticks objectives off as the player plays', () => {
    const r = new ChallengeRun(practice);
    run(r, 'ls');
    expect(status(r)).toEqual(['x look', ' >read', '  submit']);
    expect(run(r, 'cat note.txt')).toBe('The practice code is PRACTICE-42.\n');
    expect(status(r)).toEqual(['x look', 'x read', ' >submit']);
  });

  it('does not count a failed attempt', () => {
    const r = new ChallengeRun(practice);
    run(r, 'cat notes.txt');
    run(r, 'ls /tmp');
    expect(status(r)).toEqual([' >look', '  read', '  submit']);
  });

  it('accepts the right answer, ignoring case and spaces, and finishes', () => {
    const r = new ChallengeRun(practice);
    expect(run(r, 'submit nope')).toContain('That is not the right code');
    expect(r.getSnapshot().solved).toBe(false);
    expect(run(r, 'submit  practice-42 ')).toContain('Correct! Challenge complete.');
    expect(r.getSnapshot().solved).toBe(true);
    expect(r.messages.at(-1)).toEqual({ kind: 'solved', text: 'Practice Run' });
  });

  it('ticks skipped objectives when a later one is done', () => {
    const r = new ChallengeRun(practice);
    run(r, 'cat note.txt');
    expect(status(r)).toEqual(['x look', 'x read', ' >submit']);
  });

  it('skipping ahead sends only the reached step’s outro, not every skipped one (QA #2)', () => {
    const r = new ChallengeRun(firstDay);
    // The player goes straight for the history, skipping the first seven steps.
    run(r, 'cat /home/mwalker/.bash_history');
    const outros = r.messages.filter((m) => m.kind === 'outro').map((m) => m.objectiveId);
    expect(outros).toEqual(['history']);
    // The feed shows just that outro and the next step's intro, not a wall of skipped notes.
    expect(r.getSnapshot().stepMessages.map((m) => `${m.kind}:${m.objectiveId ?? ''}`)).toEqual([
      'outro:history',
      'intro:su',
    ]);
  });

  it('explains how to use submit', () => {
    expect(run(new ChallengeRun(practice), 'submit')).toContain('Usage: submit <code>');
  });

  it('gives hints for the current objective, one level more each time', () => {
    const r = new ChallengeRun(practice);
    expect(run(r, 'hint')).toBe('Hint 1 of 3: Which command lists files?\n');
    expect(run(r, 'hint')).toBe('Hint 2 of 3: Type ls and press Enter.\n');
    expect(run(r, 'hint')).toBe('Hint 3 of 3 (last hint): Run: ls\n');
    expect(run(r, 'hint')).toBe('Hint 3 of 3 (last hint): Run: ls\n');
    expect(r.getSnapshot().hintsShown).toBe(3);
    run(r, 'ls');
    expect(r.getSnapshot().hintsShown).toBe(0);
    expect(run(r, 'hint')).toBe('Hint 1 of 3: Which command shows what is inside a file?\n');
  });

  it('notifies subscribers and message listeners', () => {
    const r = new ChallengeRun(practice);
    let updates = 0;
    const messages: string[] = [];
    r.subscribe(() => updates++);
    r.onMessage((m) => messages.push(m.kind));
    run(r, 'ls');
    expect(updates).toBe(1);
    expect(messages).toEqual(['outro', 'intro']);
  });

  it('builds a fresh world for every run', () => {
    const a = new ChallengeRun(practice);
    a.shell.fs.writeFile('/home/newhire/note.txt', 'changed');
    const b = new ChallengeRun(practice);
    expect(run(b, 'cat note.txt')).toBe('The practice code is PRACTICE-42.\n');
  });

  it('lists hint and submit in help as game commands', () => {
    const out = run(new ChallengeRun(practice), 'help');
    expect(out).toContain('hint      Get a hint for your current objective (game command)');
  });
});

describe('ChallengeRun expert-mode hints (QA)', () => {
  it('draws hints from the current expert goal, not the hidden granular step', () => {
    const r = new ChallengeRun(firstDay, 'expert');
    expect(r.getSnapshot().hintsTotal).toBe(3);
    expect(run(r, 'hint')).toContain("Marcus's home directory is wide open");
    expect(run(r, 'hint')).toContain('shell history');
    expect(run(r, 'hint')).toContain('.bash_history');
  });

  it('moves to the next expert goal once the first is reached', () => {
    const r = new ChallengeRun(firstDay, 'expert');
    run(r, 'cat /home/mwalker/.bash_history');
    r.shell.execute('su mwalker').input!.submit('Tidewater#22');
    expect(run(r, 'hint')).toContain('~/private');
  });

  it('guided mode still hints the step-by-step objectives', () => {
    const r = new ChallengeRun(firstDay, 'guided');
    expect(run(r, 'hint').toLowerCase()).toContain('who am i');
  });

  it('switching to expert mode re-points the hints and refreshes the snapshot', () => {
    const r = new ChallengeRun(firstDay); // guided by default
    let updates = 0;
    r.subscribe(() => updates++);
    r.setMode('expert');
    expect(updates).toBe(1);
    expect(run(r, 'hint')).toContain("Marcus's home directory is wide open");
  });
});

describe('triggers', () => {
  const cmd = (name: string, exitCode = 0, user = 'newhire'): GameEvent => ({
    type: 'command',
    name,
    args: [],
    exitCode,
    user,
    cwd: '/',
  });

  it('match only the events they describe', () => {
    expect(ranCommand('whoami')(cmd('whoami'))).toBe(true);
    expect(ranCommand('whoami')(cmd('whoami', 1))).toBe(false);
    expect(ranCommand('whoami', 'mwalker')(cmd('whoami'))).toBe(false);
    expect(readFile('/a')({ type: 'read', path: '/a', user: 'x' })).toBe(true);
    expect(listedDir('/h', { all: true })({ type: 'list', path: '/h', all: false, long: true, user: 'x' })).toBe(false);
    expect(enteredDir('/home')({ type: 'cd', path: '/home', user: 'x' })).toBe(true);
    expect(becameUser('mwalker')({ type: 'su', user: 'mwalker', from: 'newhire' })).toBe(true);
    expect(anyOf(enteredDir('/x'), readFile('/a'))({ type: 'read', path: '/a', user: 'x' })).toBe(true);
  });
});

describe('ChallengeRun.restore', () => {
  it('rebuilds the same state and screen from a saved log', () => {
    const played = new ChallengeRun(practice);
    played.shell.execute('ls');
    played.requestHint();
    played.shell.execute('hint');
    expect(played.log).toEqual([
      { kind: 'line', text: 'ls' },
      { kind: 'hint' },
      { kind: 'line', text: 'hint' },
    ]);

    const resumed = new ChallengeRun(practice);
    const screen = strip(resumed.restore(played.log));
    expect(resumed.getSnapshot().objectives).toEqual(played.getSnapshot().objectives);
    expect(resumed.getSnapshot().hintsShown).toBe(2);
    expect(resumed.messages).toEqual(played.messages);
    expect(resumed.log).toEqual(played.log);
    expect(screen).toBe(
      'newhire@harborline:~$ ls\nnote.txt\n' +
        'newhire@harborline:~$ hint\nHint 2 of 3: Use cat followed by the file name.\n',
    );
  });

  it('records answers to prompts and hides secret ones on screen', async () => {
    const { sandbox } = await import('../challenges/sandbox');
    const played = new ChallengeRun(sandbox);
    const r = played.shell.execute('su mwalker');
    r.input!.submit('letmein');
    played.shell.execute('whoami');

    const resumed = new ChallengeRun(sandbox);
    const screen = strip(resumed.restore(played.log));
    expect(resumed.shell.user).toBe('mwalker');
    expect(screen).toBe('newhire@harborline:~$ su mwalker\nPassword: \nmwalker@harborline:/home/newhire$ whoami\nmwalker\n');
    expect(screen).not.toContain('letmein');
  });

  it('shows ^C for a prompt that was abandoned', async () => {
    const { sandbox } = await import('../challenges/sandbox');
    const resumed = new ChallengeRun(sandbox);
    const screen = strip(resumed.restore([{ kind: 'line', text: 'su mwalker' }, { kind: 'line', text: 'pwd' }]));
    expect(screen).toBe('newhire@harborline:~$ su mwalker\nPassword: ^C\nnewhire@harborline:~$ pwd\n/home/newhire\n');
  });

  it('counts commands and hints for the debrief', () => {
    const r = new ChallengeRun(practice);
    r.shell.execute('hint');
    r.requestHint();
    r.shell.execute('ls');
    expect(r.stats()).toEqual({ commands: 2, hints: 2 });
  });
});
