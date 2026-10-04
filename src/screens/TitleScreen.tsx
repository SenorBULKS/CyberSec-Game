import { useState } from 'react';
import { campaign, warmup } from '../challenges';
import { campaignProgress } from '../game/campaign';
import type { Challenge } from '../game/challenge';
import type { PlayMode } from '../game/MissionPanel';
import { loadAll, type SavedRun } from '../game/save';
import { ConfirmButton } from './ConfirmButton';

export interface StartRequest {
  challenge: Challenge;
  mode: PlayMode;
  /** Pick up the saved game instead of starting fresh. */
  resume: boolean;
  /** Open straight onto the debrief (for finished challenges). */
  debrief?: boolean;
}

const MODES: { id: PlayMode; label: string; detail: string }[] = [
  {
    id: 'guided',
    label: 'Guided',
    detail: 'A mentor explains each step and every new word. Best if you are new to Linux or security.',
  },
  {
    id: 'expert',
    label: 'I already know Linux',
    detail: 'Just the mission and the objectives. Hints are still there if you want them.',
  },
];

export function TitleScreen({ onStart }: { onStart: (request: StartRequest) => void }) {
  const [saves] = useState(loadAll);
  const lastRun = saves.last ? saves.runs[saves.last] : undefined;
  const [mode, setMode] = useState<PlayMode>(lastRun?.mode ?? 'guided');
  const entries = campaignProgress(campaign, saves);
  const warmupSave = saves.runs[warmup.id];

  return (
    <main className="title-screen">
      <div className="title-inner">
        <header className="title-head">
          <p className="eyebrow">Hands-on security training</p>
          <h1>CyberSec Game</h1>
          <p className="tagline">
            Learn how attackers and defenders work by doing it yourself, on a simulated Linux server. Nothing to
            install, and nothing real is at risk.
          </p>
        </header>

        <section aria-labelledby="mode-heading" className="title-section">
          <h2 id="mode-heading">How do you want to play?</h2>
          <div className="mode-cards" role="radiogroup" aria-labelledby="mode-heading">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={mode === m.id}
                className={`mode-card${mode === m.id ? ' selected' : ''}`}
                onClick={() => setMode(m.id)}
              >
                <span className="mode-card-label">{m.label}</span>
                <span className="mode-card-detail">{m.detail}</span>
              </button>
            ))}
          </div>
        </section>

        <section aria-labelledby="warmup-heading" className="title-section">
          <h2 id="warmup-heading">New here?</h2>
          <ol className="challenge-list">
            <ChallengeCard
              challenge={warmup}
              saved={warmupSave}
              completed={saves.completed.has(warmup.id)}
              onStart={(resume, debrief) => onStart({ challenge: warmup, mode, resume, debrief })}
            />
          </ol>
        </section>

        <section aria-labelledby="challenges-heading" className="title-section">
          <h2 id="challenges-heading">Campaign</h2>
          <ol className="challenge-list">
            {entries.map((entry) => (
              <ChallengeCard
                key={entry.challenge.id}
                number={entry.number}
                challenge={entry.challenge}
                saved={saves.runs[entry.challenge.id]}
                completed={entry.solved}
                locked={!entry.unlocked}
                onStart={(resume, debrief) => onStart({ challenge: entry.challenge, mode, resume, debrief })}
              />
            ))}
          </ol>
          <p className="title-note">More challenges, on networking, the web and phishing, are on the way.</p>
        </section>
      </div>
    </main>
  );
}

function ChallengeCard({
  number,
  challenge,
  saved,
  completed = false,
  locked = false,
  onStart,
}: {
  number?: number;
  challenge: Challenge;
  saved?: SavedRun;
  /** Finished at least once; stays true across replays. */
  completed?: boolean;
  locked?: boolean;
  onStart: (resume: boolean, debrief?: boolean) => void;
}) {
  const inProgress = !completed && saved !== undefined;
  const status = completed ? 'Completed' : inProgress ? 'In progress' : 'Not started';
  return (
    <li className={`challenge-card${locked ? ' locked' : ''}`} aria-label={challenge.title}>
      <div className="challenge-meta">
        {number !== undefined && <span className="challenge-number">{String(number).padStart(2, '0')}</span>}
        <span className="challenge-level">{challenge.level}</span>
        {locked ? (
          <span className="challenge-status status-locked">Locked</span>
        ) : (
          <span className={`challenge-status status-${status.toLowerCase().replace(' ', '-')}`}>{status}</span>
        )}
      </div>
      <h3>{challenge.title}</h3>
      <p>{locked ? 'Finish the challenge before this one to unlock it.' : challenge.summary}</p>
      {!locked && (
        <div className="challenge-actions">
          {inProgress && (
            <>
              <button type="button" className="primary-button" onClick={() => onStart(true)}>
                Continue
              </button>
              <ConfirmButton
                label="Start over"
                question="Lose your progress?"
                confirmLabel="Start over"
                onConfirm={() => onStart(false)}
              />
            </>
          )}
          {completed && (
            <>
              {challenge.debrief && saved?.solved && (
                <button type="button" className="primary-button" onClick={() => onStart(true, true)}>
                  Read the debrief
                </button>
              )}
              <button type="button" className="ghost-button" onClick={() => onStart(false)}>
                Play again
              </button>
            </>
          )}
          {!completed && !inProgress && (
            <button type="button" className="primary-button" onClick={() => onStart(false)}>
              Start
            </button>
          )}
        </div>
      )}
    </li>
  );
}
