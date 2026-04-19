export function App() {
  return (
    <div className="app-shell">
      <aside className="pane sidebar">
        <h1>QueryVisual</h1>
        <p className="muted">Structured graph editor for DQL compilation.</p>
      </aside>

      <main className="pane canvas-pane">
        <div className="placeholder">Canvas</div>
      </main>

      <section className="pane debug-pane">
        <h2>Outputs</h2>
        <div className="placeholder">Compiler artifacts will appear here.</div>
      </section>
    </div>
  );
}
