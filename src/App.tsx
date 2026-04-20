import {
  DocumentProvider,
  useDocumentContext,
} from "./app/state/DocumentContext";
import { useMemo } from "react";
import { compileOutput } from "./domain/compile/compileOutput";
import { GraphCanvas } from "./features/graph-editor/GraphCanvas";
import { NodeEditorModal } from "./features/graph-editor/NodeEditorModal";
import { NodePalette } from "./features/graph-editor/NodePalette";

function AppLayout() {
  const { state, dispatch } = useDocumentContext();
  const editedNode =
    state.document.nodes.find((node) => node.id === state.editorNodeId) ?? null;
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
      {editedNode ? (
        <NodeEditorModal
          node={editedNode}
          onClose={() => dispatch({ type: "open-node-editor", nodeId: null })}
          onSave={(node) => {
            dispatch({ type: "replace-node", node });
            dispatch({ type: "open-node-editor", nodeId: null });
          }}
        />
      ) : null}
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
