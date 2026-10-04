import { useEffect, useState } from 'react';
import { challengeById } from './challenges';
import { ChallengeRun } from './game/ChallengeRun';
import { MissionPanel, type PlayMode } from './game/MissionPanel';
import { clearRun, loadRun, saveRun } from './game/save';
import { ConfirmButton } from './screens/ConfirmButton';
import { DebriefScreen } from './screens/DebriefScreen';
import { TitleScreen, type StartRequest } from './screens/TitleScreen';
import { TerminalView } from './terminal/TerminalView';

/** True for keys that type a character, as opposed to Tab, arrows or shortcuts. */
function isTypingKey(event: KeyboardEvent): boolean {
  return event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
}

type Screen = { name: 'title' } | { name: 'play'; request: StartRequest; key: number };

export function App() {
  const [screen, setScreen] = useState<Screen>(() => {
    // A link like #practice opens that challenge directly, picking up any saved game.
    const challenge = challengeById(window.location.hash.replace(/^#/, ''));
    return challenge
      ? { name: 'play', request: { challenge, mode: loadRun(challenge.id)?.mode ?? 'guided', resume: true }, key: 0 }
      : { name: 'title' };
  });

  const start = (request: StartRequest) => {
    if (!request.resume) clearRun(request.challenge.id);
    setScreen((s) => ({ name: 'play', request, key: (s.name === 'play' ? s.key : 0) + 1 }));
  };

  const menu = () => {
    // Drop a #challenge anchor so a reload stays on the title screen.
    try {
      if (window.location.hash) window.history.replaceState(null, '', window.location.pathname + window.location.search);
    } catch {
      // Some embedded viewers refuse history changes; the anchor then simply stays.
    }
    setScreen({ name: 'title' });
  };

  if (screen.name === 'title') return <TitleScreen onStart={start} />;
  return (
    <Game
      key={screen.key}
      request={screen.request}
      onMenu={menu}
      onRestart={() => start({ ...screen.request, resume: false, debrief: false })}
    />
  );
}

interface GameProps {
  request: StartRequest;
  onMenu: () => void;
  onRestart: () => void;
}

/** One challenge being played: terminal and mission panel, or the debrief once it is solved. */
function Game({ request, onMenu, onRestart }: GameProps) {
  const { challenge } = request;
  const [setup] = useState(() => {
    const saved = request.resume ? loadRun(challenge.id) : undefined;
    const mode = saved?.mode ?? request.mode;
    // The run needs the mode before replaying the log, so expert hints replay from
    // the expert goals, not the granular steps.
    const run = new ChallengeRun(challenge, mode);
    let motd = challenge.motd;
    let history: string[] = [];
    if (saved) {
      motd += run.restore(saved.log);
      history = saved.log.flatMap((e) => (e.kind === 'line' ? [e.text] : []));
    }
    return { run, motd, history, mode };
  });
  const { run } = setup;
  const [mode, setMode] = useState<PlayMode>(setup.mode);

  // Keep the run's mode in step with the toggle, so hints follow the shown objectives.
  useEffect(() => {
    run.setMode(mode);
  }, [run, mode]);
  const [view, setView] = useState<'terminal' | 'debrief'>(
    request.debrief && run.getSnapshot().solved ? 'debrief' : 'terminal',
  );

  // Save after every command, hint and change of mode, so closing the window loses nothing.
  useEffect(() => {
    const save = () => saveRun(challenge.id, { mode, log: run.log, solved: run.getSnapshot().solved });
    if (run.log.length > 0) save();
    const stopLog = run.onLog(save);
    const stopState = run.subscribe(save);
    return () => {
      stopLog();
      stopState();
    };
  }, [challenge.id, run, mode]);

  // Typing while the mission panel has focus sends the keys back to the terminal,
  // so a click on a hint never leaves the player typing into nothing.
  useEffect(() => {
    if (view !== 'terminal') return;
    const onKeyDown = (event: KeyboardEvent) => {
      const terminalInput = document.querySelector<HTMLTextAreaElement>('.xterm-helper-textarea');
      const target = event.target as HTMLElement | null;
      if (!terminalInput || target === terminalInput || !isTypingKey(event)) return;
      if (target?.closest('input, textarea, select, [contenteditable]')) return;
      if (target?.tagName === 'BUTTON' && event.key === ' ') return;
      terminalInput.focus();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [view]);

  return (
    <div className="app">
      <header className="topbar">
        <span className="topbar-title">CyberSec Game</span>
        <span className="topbar-challenge">{challenge.title}</span>
        <nav className="topbar-actions" aria-label="Game">
          <ConfirmButton
            label="Restart"
            question="Restart and lose your progress?"
            confirmLabel="Restart"
            onConfirm={onRestart}
          />
          <button type="button" className="ghost-button" onClick={onMenu}>
            Menu
          </button>
        </nav>
      </header>
      {view === 'debrief' ? (
        <DebriefScreen run={run} onBack={() => setView('terminal')} onMenu={onMenu} />
      ) : (
        <main className="workspace">
          <section className="terminal-pane" aria-label="Terminal">
            <TerminalView shell={run.shell} motd={setup.motd} history={setup.history} />
          </section>
          <aside className="mission-pane" aria-label="Mission">
            <MissionPanel
              run={run}
              mode={mode}
              onModeChange={setMode}
              onDebrief={challenge.debrief ? () => setView('debrief') : undefined}
            />
          </aside>
        </main>
      )}
    </div>
  );
}
