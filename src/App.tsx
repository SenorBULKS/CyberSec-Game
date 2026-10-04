import { useEffect, useState } from 'react';
import { challengeFromHash } from './challenges';
import { ChallengeRun } from './game/ChallengeRun';
import { MissionPanel, type PlayMode } from './game/MissionPanel';
import { TerminalView } from './terminal/TerminalView';

/** True for keys that type a character, as opposed to Tab, arrows or shortcuts. */
function isTypingKey(event: KeyboardEvent): boolean {
  return event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
}

export function App() {
  const [run] = useState(() => new ChallengeRun(challengeFromHash(window.location.hash)));
  const [mode, setMode] = useState<PlayMode>('guided');

  // Typing while the mission panel has focus sends the keys back to the terminal,
  // so a click on a hint never leaves the player typing into nothing.
  useEffect(() => {
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
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <span className="topbar-title">CyberSec Game</span>
      </header>
      <main className="workspace">
        <section className="terminal-pane" aria-label="Terminal">
          <TerminalView shell={run.shell} motd={run.challenge.motd} />
        </section>
        <aside className="mission-pane" aria-label="Mission">
          <MissionPanel run={run} mode={mode} onModeChange={setMode} />
        </aside>
      </main>
    </div>
  );
}
