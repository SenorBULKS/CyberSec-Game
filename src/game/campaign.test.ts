import { describe, expect, it } from 'vitest';
import { campaignProgress, nextUp } from './campaign';
import type { Challenge } from './challenge';
import type { SavedRun, SaveState } from './save';

function challenge(id: string): Challenge {
  return {
    id,
    title: id,
    summary: '',
    level: 'Beginner',
    setup: () => ({ machine: {} as never, user: 'newhire' }),
    motd: '',
    briefing: '',
    mentor: { name: 'Sam', role: 'Network team' },
    objectives: [],
    answer: '',
  };
}

function run(solved: boolean): SavedRun {
  return { mode: 'guided', log: [], solved, updatedAt: '2026-10-04T00:00:00.000Z' };
}

function state(runs: Record<string, SavedRun>, completed: string[] = []): SaveState {
  const fromRuns = Object.entries(runs)
    .filter(([, r]) => r.solved)
    .map(([id]) => id);
  return { runs, completed: new Set([...completed, ...fromRuns]) };
}

const [one, two, three] = [challenge('one'), challenge('two'), challenge('three')];
const campaign = [one, two, three];

describe('campaignProgress', () => {
  it('unlocks only the first challenge when nothing is solved', () => {
    const entries = campaignProgress(campaign, state({}));
    expect(entries.map((e) => e.unlocked)).toEqual([true, false, false]);
    expect(entries.map((e) => e.number)).toEqual([1, 2, 3]);
    expect(entries.every((e) => !e.solved)).toBe(true);
  });

  it('unlocks the next challenge once the current one is solved', () => {
    const entries = campaignProgress(campaign, state({ one: run(true) }));
    expect(entries.map((e) => e.unlocked)).toEqual([true, true, false]);
    expect(entries[0].solved).toBe(true);
  });

  it('does not unlock the next one while the current is only in progress', () => {
    const entries = campaignProgress(campaign, state({ one: run(false) }));
    expect(entries.map((e) => e.unlocked)).toEqual([true, false, false]);
    expect(entries[0].inProgress).toBe(true);
  });

  it('opens every challenge once all before it are solved', () => {
    const entries = campaignProgress(campaign, state({ one: run(true), two: run(true) }));
    expect(entries.map((e) => e.unlocked)).toEqual([true, true, true]);
  });

  it('keeps later challenges unlocked after an earlier one is replayed (no run, still completed)', () => {
    // Regression: finishing "one" then replaying it (its run cleared) must not re-lock "two".
    const entries = campaignProgress(campaign, { runs: {}, completed: new Set(['one']) });
    expect(entries.map((e) => e.unlocked)).toEqual([true, true, false]);
    expect(entries[0].solved).toBe(true);
  });
});

describe('nextUp', () => {
  it('is the first unlocked, unsolved challenge', () => {
    expect(nextUp(campaignProgress(campaign, state({ one: run(true) })))?.challenge.id).toBe('two');
  });

  it('is undefined when the campaign is finished', () => {
    const entries = campaignProgress(campaign, state({ one: run(true), two: run(true), three: run(true) }));
    expect(nextUp(entries)).toBeUndefined();
  });
});
