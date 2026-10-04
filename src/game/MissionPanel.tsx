import { useSyncExternalStore } from 'react';
import type { ChallengeRun } from './ChallengeRun';

export function MissionPanel({ run }: { run: ChallengeRun }) {
  const snapshot = useSyncExternalStore(run.subscribe, run.getSnapshot);
  return (
    <>
      <h2>{run.challenge.title}</h2>
      <p className="muted">{run.challenge.briefing}</p>
      <h3>Objectives</h3>
      <ol className="objectives">
        {snapshot.objectives.map((o) => (
          <li key={o.id} className={o.done ? 'done' : o.current ? 'current' : ''}>
            <span className="check" aria-hidden="true">
              {o.done ? '✔' : '○'}
            </span>
            <span>{o.title}</span>
            {o.done && <span className="visually-hidden"> (done)</span>}
          </li>
        ))}
      </ol>
      {snapshot.solved && <p className="solved">Challenge complete.</p>}
    </>
  );
}
