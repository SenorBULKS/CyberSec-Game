import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { ChallengeRun, GameMessage } from './ChallengeRun';
import { RichText } from './RichText';

export type PlayMode = 'guided' | 'expert';

interface Props {
  run: ChallengeRun;
  mode: PlayMode;
  onModeChange: (mode: PlayMode) => void;
  /** Opens the debrief; shown once the challenge is solved. */
  onDebrief?: () => void;
}

/** In expert mode the mentor's teaching messages are hidden; hints and results stay. */
function visible(message: GameMessage, mode: PlayMode): boolean {
  return mode === 'guided' || message.kind === 'hint' || message.kind === 'solved';
}

export function MissionPanel({ run, mode, onModeChange, onDebrief }: Props) {
  const snapshot = useSyncExternalStore(run.subscribe, run.getSnapshot);
  const { challenge } = run;
  // Only the current step's messages: finishing an objective clears the earlier ones.
  const messages = snapshot.stepMessages.filter((m) => visible(m, mode));
  const feedEnd = useRef<HTMLDivElement>(null);
  const currentObjective = useRef<HTMLLIElement>(null);
  const foot = useRef<HTMLElement>(null);

  // Bring the newest message into view, but never scroll the current objective off the top.
  useEffect(() => {
    const end = feedEnd.current;
    const pane = end && scrollParent(end);
    if (!end || !pane) return;
    const top = pane.getBoundingClientRect().top - pane.scrollTop;
    const visibleHeight = pane.clientHeight - (foot.current?.offsetHeight ?? 0);
    const showNewest = end.getBoundingClientRect().bottom - top - visibleHeight;
    const keepObjective = currentObjective.current
      ? currentObjective.current.getBoundingClientRect().top - top - 8
      : Infinity;
    pane.scrollTop = Math.max(0, Math.min(showNewest, keepObjective));
  }, [messages.length, snapshot.stepMessages]);

  const hintsLeft = snapshot.hintsTotal - snapshot.hintsShown;

  return (
    <div className="mission">
      <header className="mission-head">
        <h2>{challenge.title}</h2>
        <div className="mode-switch" role="radiogroup" aria-label="Play mode">
          {(['guided', 'expert'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              className={mode === m ? 'active' : ''}
              onClick={() => onModeChange(m)}
            >
              {m === 'guided' ? 'Guided' : 'I know Linux'}
            </button>
          ))}
        </div>
      </header>

      <p className="briefing">
        <RichText text={challenge.briefing} />
      </p>

      {snapshot.objectives.length > 0 && (
        <section aria-labelledby="objectives-heading">
          <h3 id="objectives-heading">Objectives</h3>
          <ol className="objectives">
            {snapshot.objectives.map((o) => (
              <li
                key={o.id}
                ref={o.current ? currentObjective : undefined}
                className={o.done ? 'done' : o.current ? 'current' : ''}
              >
                <span className="check" aria-hidden="true">
                  {o.done ? '✔' : o.current ? '▸' : '○'}
                </span>
                <span>{o.title}</span>
                {o.done && <span className="visually-hidden"> (done)</span>}
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="feed" role="log" aria-live="polite" aria-label={`Messages from ${challenge.mentor.name}`}>
        {messages.map((m, i) => (
          <Message key={i} message={m} mentor={challenge.mentor} />
        ))}
        <div ref={feedEnd} />
      </section>

      {snapshot.solved && onDebrief && (
        <footer className="mission-foot" ref={foot}>
          <button type="button" className="primary-button" onClick={onDebrief}>
            Read the debrief
          </button>
        </footer>
      )}

      {!snapshot.solved && snapshot.hintsTotal > 0 && (
        <footer className="mission-foot" ref={foot}>
          <button type="button" className="hint-button" disabled={hintsLeft === 0} onClick={() => run.requestHint()}>
            {hintsLeft === 0
              ? 'No more hints for this step'
              : `Get a hint (${snapshot.hintsShown + 1} of ${snapshot.hintsTotal})`}
          </button>
          <p className="foot-note">
            You can also type <code>hint</code> in the terminal.
          </p>
        </footer>
      )}
    </div>
  );
}

/** The nearest ancestor that scrolls vertically: the pane the panel sits in. */
function scrollParent(element: HTMLElement): HTMLElement | null {
  for (let el = element.parentElement; el; el = el.parentElement) {
    const { overflowY } = getComputedStyle(el);
    if (overflowY === 'auto' || overflowY === 'scroll') return el;
  }
  return null;
}

function Message({ message, mentor }: { message: GameMessage; mentor: { name: string; role: string } }) {
  if (message.kind === 'hint') {
    return (
      <div className="msg msg-hint">
        <span className="msg-label">Hint</span>
        <RichText text={message.text} />
      </div>
    );
  }
  if (message.kind === 'solved') {
    return (
      <div className="msg msg-solved">
        <strong>Challenge complete.</strong> You finished “{message.text}”.
      </div>
    );
  }
  return (
    <div className="msg msg-mentor">
      <span className="msg-from">
        {mentor.name} <span className="msg-role">· {mentor.role}</span>
      </span>
      <RichText text={message.text} />
    </div>
  );
}
