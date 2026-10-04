import type { Challenge } from './challenge';
import type { SavedRun } from './save';

/** One campaign challenge together with where the player stands on it. */
export interface CampaignEntry {
  challenge: Challenge;
  /** 1-based position in the campaign, for the "01", "02" labels. */
  number: number;
  /** The player may start it: it is the first, or the one before it is solved. */
  unlocked: boolean;
  solved: boolean;
}

/**
 * Walks the campaign in order and decides what is open. The first challenge is
 * always playable; every later one unlocks only once the one before it is
 * solved, so the difficulty ramp is played in sequence.
 */
export function campaignProgress(
  campaign: Challenge[],
  runs: Record<string, SavedRun | undefined>,
): CampaignEntry[] {
  let previousSolved = true; // nothing precedes the first challenge, so it is open.
  return campaign.map((challenge, index) => {
    const solved = runs[challenge.id]?.solved ?? false;
    const unlocked = previousSolved;
    previousSolved = solved;
    return { challenge, number: index + 1, unlocked, solved };
  });
}

/** The next challenge the player should tackle: the first unlocked one not yet solved. */
export function nextUp(entries: CampaignEntry[]): CampaignEntry | undefined {
  return entries.find((e) => e.unlocked && !e.solved);
}
