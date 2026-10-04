import { describe, expect, it } from 'vitest';
import { campaignProgress, nextUp } from './campaign';
import type { Challenge } from './challenge';
import type { SavedRun } from './save';

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

function solved(mode: 'guided' = 'guided'): SavedRun {
  return { mode, log: [], solved: true, updatedAt: '2026-10-04T00:00:00.000Z' };
}

function inProgress(): SavedRun {
  return { mode: 'guided', log: [], solved: false, updatedAt: '2026-10-04T00:00:00.000Z' };
}

const [one, two, three] = [challenge('one'), challenge('two'), challenge('three')];
const campaign = [one, two, three];

describe('campaignProgress', () => {
  it('unlocks only the first challenge when nothing is solved', () => {
    const entries = campaignProgress(campaign, {});
    expect(entries.map((e) => e.unlocked)).toEqual([true, false, false]);
    expect(entries.map((e) => e.number)).toEqual([1, 2, 3]);
    expect(entries.every((e) => !e.solved)).toBe(true);
  });

  it('unlocks the next challenge once the current one is solved', () => {
    const entries = campaignProgress(campaign, { one: solved() });
    expect(entries.map((e) => e.unlocked)).toEqual([true, true, false]);
    expect(entries[0].solved).toBe(true);
  });

  it('does not unlock the next one while the current is only in progress', () => {
    const entries = campaignProgress(campaign, { one: inProgress() });
    expect(entries.map((e) => e.unlocked)).toEqual([true, false, false]);
  });

  it('opens every challenge once all before it are solved', () => {
    const entries = campaignProgress(campaign, { one: solved(), two: solved() });
    expect(entries.map((e) => e.unlocked)).toEqual([true, true, true]);
  });
});

describe('nextUp', () => {
  it('is the first unlocked, unsolved challenge', () => {
    const entries = campaignProgress(campaign, { one: solved() });
    expect(nextUp(entries)?.challenge.id).toBe('two');
  });

  it('is undefined when the campaign is finished', () => {
    const entries = campaignProgress(campaign, { one: solved(), two: solved(), three: solved() });
    expect(nextUp(entries)).toBeUndefined();
  });
});
