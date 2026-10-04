import { TerminalView } from './terminal/TerminalView';

export function App() {
  return (
    <div className="app">
      <header className="topbar">
        <span className="topbar-title">CyberSec Game</span>
      </header>
      <main className="workspace">
        <section className="terminal-pane" aria-label="Terminal">
          <TerminalView />
        </section>
        <aside className="mission-pane" aria-label="Mission">
          <h2>Mission</h2>
          <p className="muted">Your briefing and objectives will appear here.</p>
        </aside>
      </main>
    </div>
  );
}
