import {
  DocumentProvider,
  useDocumentContext,
} from "./app/state/DocumentContext";
import { useMemo } from "react";
import { compileOutput } from "./domain/compile/compileOutput";
import { DebugPanel } from "./features/debug/DebugPanel";
import { DocumentToolbar } from "./features/document-storage/DocumentToolbar";
import { GraphCanvas } from "./features/graph-editor/GraphCanvas";
import { NodePalette } from "./features/graph-editor/NodePalette";

function AppLayout() {
  const { state, dispatch } = useDocumentContext();
  const outputs = useMemo(
    () =>
      state.document.nodes
        .filter((node) => node.kind === "output")
        .map((node) => ({ id: node.id, name: node.data.outputName })),
    [state.document.nodes],
  );
  const compileResult = useMemo(() => {
    if (!state.activeOutputId) {
      return null;
    }

    return compileOutput(state.document, state.activeOutputId);
  }, [state.activeOutputId, state.document.edges, state.document.nodes]);
  const diagnostics = compileResult?.semantic.diagnostics ?? [];

  return (
    <div className="app-shell">
      <aside className="pane sidebar">
        <h1>QueryVisual</h1>
        <p className="muted">Structured graph editor for DQL compilation.</p>
        <DocumentToolbar />
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
        <DebugPanel
          result={compileResult}
          outputs={outputs}
          activeOutputId={state.activeOutputId}
          onSelectOutput={(outputId) =>
            dispatch({ type: "set-active-output", nodeId: outputId })
          }
        />
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
