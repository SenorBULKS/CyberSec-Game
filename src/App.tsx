export function App() {
  return (
    <div className="app">
      <header className="topbar">
        <span className="topbar-title">CyberSec Game</span>
      </header>
      <main className="workspace">
        <section className="terminal-pane" aria-label="Terminal">
          <div className="terminal-placeholder">
            <span className="prompt">newhire@harborline:~$</span>
            <span className="cursor" aria-hidden="true" />
          </div>
        </section>
        <aside className="mission-pane" aria-label="Mission">
          <h2>Mission</h2>
          <p className="muted">Your briefing and objectives will appear here.</p>
        </aside>
      </main>
    </div>
  );
}
