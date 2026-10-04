import { beforeEach, describe, expect, it } from 'vitest';
import { clearRun, loadAll, loadRun, saveRun } from './save';

beforeEach(() => {
  window.localStorage.clear();
});

const solved = { mode: 'guided' as const, log: [], solved: true };
const started = { mode: 'guided' as const, log: [], solved: false };

describe('save', () => {
  it('records a finished challenge in the permanent completed set', () => {
    saveRun('first-day', solved);
    expect(loadAll().completed.has('first-day')).toBe(true);
  });

  it('keeps the completed record after the run is cleared (replay or restart)', () => {
    saveRun('first-day', solved);
    clearRun('first-day');
    expect(loadRun('first-day')).toBeUndefined();
    // The run is gone, but the challenge is still counted as finished.
    expect(loadAll().completed.has('first-day')).toBe(true);
  });

  it('does not add an unfinished run to completed', () => {
    saveRun('first-day', started);
    expect(loadAll().completed.has('first-day')).toBe(false);
  });

  it('counts an older solved run with no completed list (migration)', () => {
    window.localStorage.setItem(
      'cybersec-game:save',
      JSON.stringify({ version: 1, runs: { 'first-day': { ...solved, updatedAt: 'x' } } }),
    );
    expect(loadAll().completed.has('first-day')).toBe(true);
  });
});
