import type { ChallengeRun } from '../game/ChallengeRun';
import { RichText } from '../game/RichText';

interface Props {
  run: ChallengeRun;
  onBack: () => void;
  onMenu: () => void;
}

/** After the challenge: what the player just did, in real-world terms. */
export function DebriefScreen({ run, onBack, onMenu }: Props) {
  const { challenge } = run;
  const debrief = challenge.debrief;
  const { commands, hints } = run.stats();
  return (
    <main className="debrief" aria-labelledby="debrief-heading">
      <article className="debrief-inner">
        <p className="eyebrow">Debrief</p>
        <h1 id="debrief-heading">{challenge.title}: complete</h1>
        <dl className="debrief-stats">
          <div>
            <dt>Commands typed</dt>
            <dd>{commands}</dd>
          </div>
          <div>
            <dt>Hints used</dt>
            <dd>{hints}</dd>
          </div>
        </dl>
        {debrief && (
          <>
            <p className="debrief-summary">
              <RichText text={debrief.summary} />
            </p>
            {debrief.sections.map((s) => (
              <section key={s.title} className="debrief-section">
                <h2>{s.title}</h2>
                <p>
                  <RichText text={s.text} />
                </p>
              </section>
            ))}
          </>
        )}
        <div className="debrief-actions">
          <button type="button" className="primary-button" onClick={onMenu}>
            Back to the challenges
          </button>
          <button type="button" className="ghost-button" onClick={onBack}>
            Back to the terminal
          </button>
        </div>
      </article>
    </main>
  );
}
