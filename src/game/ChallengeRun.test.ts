import { describe, expect, it } from 'vitest';
import { practice } from '../challenges/practice';
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

  it('explains how to use submit', () => {
    expect(run(new ChallengeRun(practice), 'submit')).toContain('Usage: submit <code>');
  });

  it('gives hints for the current objective, one level more each time', () => {
    const r = new ChallengeRun(practice);
    expect(run(r, 'hint')).toBe('Hint 1 of 3: Which command lists files?\n');
    expect(run(r, 'hint')).toBe('Hint 2 of 3: Type `ls` and press Enter.\n');
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
    expect(messages).toEqual(['outro']);
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
