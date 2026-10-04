import type { LogEntry } from './ChallengeRun';
import type { PlayMode } from './MissionPanel';

/** One challenge's saved progress. */
export interface SavedRun {
  mode: PlayMode;
  log: LogEntry[];
  solved: boolean;
  updatedAt: string;
}

interface SaveFile {
  version: 1;
  /** The challenge played most recently, for the title screen's Continue button. */
  last?: string;
  runs: Record<string, SavedRun>;
  /**
   * Challenges the player has ever finished. This is permanent: restarting or
   * replaying a challenge clears its run but never its place here, so the
   * campaign stays unlocked once it has been earned.
   */
  completed?: string[];
}

/** Everything the title screen needs: the current runs and the permanent record of what is finished. */
export interface SaveState {
  last?: string;
  runs: Record<string, SavedRun>;
  completed: Set<string>;
}

const KEY = 'cybersec-game:save';
const EMPTY: SaveFile = { version: 1, runs: {} };

// Browser storage can be missing or blocked (private windows, strict settings),
// so every access is guarded and the game simply plays without saving.

function readFile(): SaveFile {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY, runs: {} };
    const parsed = JSON.parse(raw) as SaveFile;
    return parsed.version === 1 && parsed.runs ? parsed : { ...EMPTY, runs: {} };
  } catch {
    return { ...EMPTY, runs: {} };
  }
}

function writeFile(file: SaveFile) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(file));
  } catch {
    // Saving is a convenience; play goes on without it.
  }
}

/** The set of finished challenges, counting both the permanent record and any run still marked solved. */
function completedSet(file: SaveFile): Set<string> {
  const ids = new Set(file.completed ?? []);
  for (const [id, run] of Object.entries(file.runs)) if (run.solved) ids.add(id);
  return ids;
}

export function loadRun(challengeId: string): SavedRun | undefined {
  return readFile().runs[challengeId];
}

export function loadAll(): SaveState {
  const file = readFile();
  return { last: file.last, runs: file.runs, completed: completedSet(file) };
}

export function saveRun(challengeId: string, run: Omit<SavedRun, 'updatedAt'>) {
  const file = readFile();
  file.runs[challengeId] = { ...run, updatedAt: new Date().toISOString() };
  file.last = challengeId;
  if (run.solved) {
    const completed = new Set(file.completed ?? []);
    completed.add(challengeId);
    file.completed = [...completed];
  }
  writeFile(file);
}

export function clearRun(challengeId: string) {
  const file = readFile();
  delete file.runs[challengeId];
  if (file.last === challengeId) delete file.last;
  // Deliberately leaves `completed` untouched: finishing a challenge is permanent.
  writeFile(file);
}
