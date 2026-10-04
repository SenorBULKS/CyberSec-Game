import { useState } from 'react';
import { challengeFromHash } from './challenges';
import { ChallengeRun } from './game/ChallengeRun';
import { MissionPanel } from './game/MissionPanel';
import { TerminalView } from './terminal/TerminalView';

export function App() {
  const [run] = useState(() => new ChallengeRun(challengeFromHash(window.location.hash)));
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
          <MissionPanel run={run} />
        </aside>
      </main>
    </div>
  );
}
