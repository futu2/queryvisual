import {
  DocumentProvider,
  useDocumentContext,
} from "./app/state/DocumentContext";
import { useEffect, useMemo, useState } from "react";
import { compileOutput } from "./domain/compile/compileOutput";
import type { GraphDocument } from "./domain/document/types";
import { DebugPanel } from "./features/debug/DebugPanel";
import { DocumentToolbar } from "./features/document-storage/DocumentToolbar";
import { GraphCanvas } from "./features/graph-editor/GraphCanvas";
import { NodePalette } from "./features/graph-editor/NodePalette";

export function AppLayout() {
  const { state } = useDocumentContext();
  const outputs = useMemo(
    () =>
      state.document.nodes
        .filter((node) => node.kind === "output")
        .map((node) => ({ id: node.id, name: node.data.outputName })),
    [state.document.nodes],
  );
  const [activeOutputId, setActiveOutputId] = useState<string | null>(null);

  useEffect(() => {
    if (outputs.length === 0) {
      setActiveOutputId(null);
      return;
    }

    setActiveOutputId((current) => {
      if (current && outputs.some((output) => output.id === current)) {
        return current;
      }

      return outputs[0]?.id ?? null;
    });
  }, [outputs]);

  useEffect(() => {
    const candidateOutputId = [state.editorNodeId, state.selectedNodeId].find(
      (nodeId) =>
        nodeId !== null &&
        state.document.nodes.some(
          (node) => node.id === nodeId && node.kind === "output",
        ),
    );

    if (candidateOutputId) {
      setActiveOutputId(candidateOutputId);
    }
  }, [state.document.nodes, state.editorNodeId, state.selectedNodeId]);

  const compileResult = useMemo(() => {
    if (!activeOutputId) {
      return null;
    }

    return compileOutput(state.document, activeOutputId);
  }, [activeOutputId, state.document.edges, state.document.nodes]);
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
          activeOutputId={activeOutputId}
          onSelectOutput={setActiveOutputId}
        />
      </section>
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
