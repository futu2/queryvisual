import {
  DocumentProvider,
  useDocumentContext,
} from "./app/state/DocumentContext";
import { useOutputRuntime } from "./features/output-runtime/outputRuntime";
import type { GraphDocument } from "./domain/document/types";
import { DocumentToolbar } from "./features/document-storage/DocumentToolbar";
import { GraphCanvas } from "./features/graph-editor/GraphCanvas";
import { NodePalette } from "./features/graph-editor/NodePalette";

export function AppLayout() {
  const { state } = useDocumentContext();
  const outputRuntime = useOutputRuntime(state.document);

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

export function App({ initialDocument }: { initialDocument?: GraphDocument }) {
  return (
    <DocumentProvider initialDocument={initialDocument}>
      <AppLayout />
    </DocumentProvider>
  );
}
