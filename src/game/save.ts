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

export function loadRun(challengeId: string): SavedRun | undefined {
  return readFile().runs[challengeId];
}

export function loadAll(): { last?: string; runs: Record<string, SavedRun> } {
  return readFile();
}

export function saveRun(challengeId: string, run: Omit<SavedRun, 'updatedAt'>) {
  const file = readFile();
  file.runs[challengeId] = { ...run, updatedAt: new Date().toISOString() };
  file.last = challengeId;
  writeFile(file);
}

export function clearRun(challengeId: string) {
  const file = readFile();
  delete file.runs[challengeId];
  if (file.last === challengeId) delete file.last;
  writeFile(file);
}
