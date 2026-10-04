import { describe, expect, it } from 'vitest';
import { campaign } from './index';

describe('campaign timeline', () => {
  it('runs each challenge at a later in-game time than the one before', () => {
    // The story moves forward: a challenge set earlier than its predecessor
    // would contradict "on your first day", "you have settled in", etc.
    const clocks = campaign.map((c) => ({ id: c.id, at: c.setup().machine.clock.getTime() }));
    for (let i = 1; i < clocks.length; i++) {
      expect(clocks[i].at, `${clocks[i].id} must be set after ${clocks[i - 1].id}`).toBeGreaterThan(clocks[i - 1].at);
    }
  });
});
