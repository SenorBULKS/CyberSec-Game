import type { Challenge } from '../game/challenge';
import { firstDay } from './firstDay';
import { practice } from './practice';
import { sandbox } from './sandbox';

/** A short, optional warm-up that teaches the controls, outside the campaign ramp. */
export const warmup: Challenge = practice;

/**
 * The campaign: the challenges that make up the game, in the order they are
 * played and unlocked. More are added here as they are built.
 */
export const campaign: Challenge[] = [firstDay];

/** Free play with no objectives, reached from its #sandbox link. */
export const freePlay: Challenge = sandbox;

/** Every challenge there is, for lookups by id. */
export const challenges: Challenge[] = [warmup, ...campaign, freePlay];

/** Finds a challenge by its id, e.g. from a link's #anchor. */
export function challengeById(id: string): Challenge | undefined {
  return challenges.find((c) => c.id === id);
}
