import {
  DocumentProvider,
  useDocumentContext,
} from "./app/state/DocumentContext";
import { compileOutput } from "./domain/compile/compileOutput";
import { GraphCanvas } from "./features/graph-editor/GraphCanvas";
import { NodePalette } from "./features/graph-editor/NodePalette";

function AppLayout() {
  const { state } = useDocumentContext();
  const diagnostics = state.activeOutputId
    ? compileOutput(state.document, state.activeOutputId).semantic.diagnostics
    : [];

  return (
    <div className="app-shell">
      <aside className="pane sidebar">
        <h1>QueryVisual</h1>
        <p className="muted">Structured graph editor for DQL compilation.</p>
        <NodePalette />
      </aside>

      <main
        className="pane canvas-pane"
        style={{ display: "flex", flexDirection: "column", gap: 12 }}
      >
        <h2>Canvas</h2>
        <GraphCanvas diagnostics={diagnostics} />
      </main>

      <section className="pane debug-pane">
        <h2>Outputs</h2>
        <div className="placeholder">Compiler artifacts will appear here.</div>
      </section>
    </div>
  );
}

export function App() {
  return (
    <DocumentProvider>
      <AppLayout />
    </DocumentProvider>
  );
}
