import type { Challenge } from './challenge';
import type { SaveState } from './save';

/** One campaign challenge together with where the player stands on it. */
export interface CampaignEntry {
  challenge: Challenge;
  /** 1-based position in the campaign, for the "01", "02" labels. */
  number: number;
  /** The player may start it: it is the first, or the one before it is finished. */
  unlocked: boolean;
  /** Finished at least once (permanent), so it never re-locks after a replay. */
  solved: boolean;
  /** Has a saved run that is not finished. */
  inProgress: boolean;
}

/**
 * Walks the campaign in order and decides what is open. The first challenge is
 * always playable; every later one unlocks only once the one before it is
 * finished, so the difficulty ramp is played in sequence. Unlocking reads the
 * permanent "completed" record, so replaying or restarting a solved challenge
 * never takes the later ones away.
 */
export function campaignProgress(campaign: Challenge[], save: SaveState): CampaignEntry[] {
  let previousSolved = true; // nothing precedes the first challenge, so it is open.
  return campaign.map((challenge, index) => {
    const solved = save.completed.has(challenge.id);
    const unlocked = previousSolved;
    previousSolved = solved;
    const run = save.runs[challenge.id];
    return { challenge, number: index + 1, unlocked, solved, inProgress: !solved && run !== undefined };
  });
}

/** The next challenge the player should tackle: the first unlocked one not yet solved. */
export function nextUp(entries: CampaignEntry[]): CampaignEntry | undefined {
  return entries.find((e) => e.unlocked && !e.solved);
}
