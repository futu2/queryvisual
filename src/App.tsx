import {
  DocumentProvider,
  useDocumentContext,
} from "./app/state/DocumentContext";
import { getActiveGraph } from "./app/state/documentReducer";
import { useOutputRuntime } from "./features/output-runtime/outputRuntime";
import type { GraphDocument, GraphWorkspace } from "./domain/document/types";
import { DocumentToolbar } from "./features/document-storage/DocumentToolbar";
import { GraphCanvas } from "./features/graph-editor/GraphCanvas";
import { NodePalette } from "./features/graph-editor/NodePalette";

export function AppLayout() {
  const { state } = useDocumentContext();
  const activeGraph = getActiveGraph(state) ?? state.document;
  const outputRuntime = useOutputRuntime(activeGraph);

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
        <GraphCanvas outputRuntime={outputRuntime} />
      </main>
    </div>
  );
}

export function App({
  initialWorkspace,
  initialDocument,
}: {
  initialWorkspace?: GraphWorkspace;
  initialDocument?: GraphDocument;
}) {
  return (
    <DocumentProvider
      initialWorkspace={initialWorkspace}
      initialDocument={initialDocument}
    >
      <AppLayout />
    </DocumentProvider>
  );
}
