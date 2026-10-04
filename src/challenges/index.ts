import type { Challenge } from '../game/challenge';
import { practice } from './practice';
import { sandbox } from './sandbox';

/** Every challenge, in the order the title screen lists them. */
export const challenges: Challenge[] = [practice, sandbox];

/** Finds a challenge by its id, e.g. from a link's #anchor. */
export function challengeById(id: string): Challenge | undefined {
  return challenges.find((c) => c.id === id);
}
