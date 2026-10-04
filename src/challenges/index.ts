import type { Challenge } from '../game/challenge';
import { practice } from './practice';
import { sandbox } from './sandbox';

export const challenges: Challenge[] = [practice, sandbox];

/** Picks the challenge named in the page's #anchor, or the first one. */
export function challengeFromHash(hash: string): Challenge {
  const id = hash.replace(/^#/, '');
  return challenges.find((c) => c.id === id) ?? challenges[0];
}
