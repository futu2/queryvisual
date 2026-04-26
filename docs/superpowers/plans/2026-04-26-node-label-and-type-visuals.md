# Node Label And Type Visuals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make node names editable from the modal, guard every dirty-modal close or switch path, and give each node kind a clearer visual identity on the canvas without splitting the shared node renderer.

**Architecture:** Keep draft editing local to `NodeEditorModal`, but expose one guarded `requestClose` entry point so `Cancel`, backdrop click, `Escape`, pane click, and node-to-node switches all reuse the same discard-confirmation flow. Move modal ownership into `GraphCanvas` so editor-target transitions can be coordinated beside canvas interactions, then add a small `QueryNode` presentation map with family and kind hooks backed by CSS variants.

**Tech Stack:** Bun 1.3, React 19, TypeScript, `@xyflow/react`, Testing Library, Bun test, existing app CSS in `src/index.css` and `src/features/graph-editor/nodes/queryNode.css`

---

## File Structure

- Modify: `src/App.tsx`
  Remove the top-level modal mount once `GraphCanvas` owns editor transitions.
- Modify: `src/features/graph-editor/NodeEditorModal.tsx`
  Add an editable title input, dirty-state detection, discard-confirmation UI, `Escape` handling, and an imperative guarded-close handle for parent-driven transitions.
- Modify: `src/features/graph-editor/NodeEditorModal.test.tsx`
  Add rename-save coverage plus dirty-dismiss coverage for cancel, backdrop click, and `Escape`.
- Modify: `src/features/graph-editor/GraphCanvas.tsx`
  Render the modal locally, route node and pane interactions through guarded editor transitions, and keep position/runtime behavior intact.
- Modify: `src/features/graph-editor/GraphCanvas.test.tsx`
  Add integration coverage for switching nodes while dirty and for saved renames updating canvas node data.
- Modify: `src/features/graph-editor/nodes/QueryNode.tsx`
  Add per-kind presentation descriptors, glyph rendering, and family/kind classes while preserving current summary and handle behavior.
- Modify: `src/features/graph-editor/nodes/QueryNode.test.tsx`
  Add coverage for source/transform/terminal hooks plus selected/error state layering.
- Modify: `src/features/graph-editor/nodes/queryNode.css`
  Add family/kind shell styling, glyph layout, and silhouette variants while preserving selected/error emphasis.
- Modify: `src/index.css`
  Style the modal title input and the centered discard-confirmation dialog.

## Task 1: Make the Modal Title Editable and Guard Dirty Close Paths

**Files:**
- Modify: `src/features/graph-editor/NodeEditorModal.tsx`
- Modify: `src/features/graph-editor/NodeEditorModal.test.tsx`
- Modify: `src/index.css`
- Test: `src/features/graph-editor/NodeEditorModal.test.tsx`

- [ ] **Step 1: Write the failing modal tests**

```tsx
// src/features/graph-editor/NodeEditorModal.test.tsx
test("saves an edited node name from the modal header", async () => {
  const user = userEvent.setup();
  const onSave = mock();

  const node: GraphNode = {
    id: "select-orders-rename",
    kind: "select",
    label: "Project",
    position: { x: 0, y: 0 },
    data: {
      mappings: [{ name: "gross_total", expression: "total" }],
    },
  };

  renderModal({ node, onSave });

  await user.clear(screen.getByLabelText("Node name"));
  await user.type(screen.getByLabelText("Node name"), "Projected Orders");
  await user.click(screen.getByRole("button", { name: "Save" }));

  expect(onSave).toHaveBeenCalled();
  expect(onSave.mock.calls[0][0].label).toBe("Projected Orders");
});

test("cancel on a dirty modal asks for confirmation and keep editing preserves the draft", async () => {
  const user = userEvent.setup();
  const onClose = mock();

  const node: GraphNode = {
    id: "select-orders-dirty-cancel",
    kind: "select",
    label: "Project",
    position: { x: 0, y: 0 },
    data: {
      mappings: [{ name: "gross_total", expression: "total" }],
    },
  };

  renderModal({ node, onClose });

  await user.clear(screen.getByLabelText("Node name"));
  await user.type(screen.getByLabelText("Node name"), "Projected Orders");
  await user.click(screen.getByRole("button", { name: "Cancel" }));

  expect(onClose).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog", { name: "Discard changes" })).toBeTruthy();

  await user.click(screen.getByRole("button", { name: "Keep editing" }));

  expect(screen.queryByRole("dialog", { name: "Discard changes" })).toBeNull();
  expect((screen.getByLabelText("Node name") as HTMLInputElement).value).toBe(
    "Projected Orders",
  );
});

test("confirming discard after cancel closes the modal", async () => {
  const user = userEvent.setup();
  const onClose = mock();

  const node: GraphNode = {
    id: "select-orders-dirty-discard",
    kind: "select",
    label: "Project",
    position: { x: 0, y: 0 },
    data: {
      mappings: [{ name: "gross_total", expression: "total" }],
    },
  };

  renderModal({ node, onClose });

  await user.type(screen.getByLabelText("Node name"), " v2");
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  await user.click(screen.getByRole("button", { name: "Discard changes" }));

  expect(onClose).toHaveBeenCalledTimes(1);
});

test("backdrop click and Escape on a dirty modal show discard confirmation instead of closing", async () => {
  const user = userEvent.setup();
  const onClose = mock();

  const node: GraphNode = {
    id: "where-dirty-dismiss",
    kind: "where",
    label: "Where",
    position: { x: 0, y: 0 },
    data: {
      predicate: "total > 0",
    },
  };

  renderModal({ node, onClose });

  await user.type(screen.getByLabelText("Node name"), " v2");
  fireEvent.click(screen.getByTestId("node-editor-backdrop"));

  expect(onClose).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog", { name: "Discard changes" })).toBeTruthy();

  await user.click(screen.getByRole("button", { name: "Keep editing" }));
  fireEvent.keyDown(window, { key: "Escape" });

  expect(onClose).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog", { name: "Discard changes" })).toBeTruthy();
});
```

- [ ] **Step 2: Run the modal tests to verify they fail**

Run: `bun test src/features/graph-editor/NodeEditorModal.test.tsx`
Expected: FAIL in the new `Node name` and `Discard changes` assertions because the modal still renders a static heading and dismisses immediately on close actions.

- [ ] **Step 3: Implement the editable header, guarded close API, and discard dialog**

```tsx
// src/features/graph-editor/NodeEditorModal.tsx
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import type { GraphNode } from "../../domain/document/types";
import { useDocumentContext } from "../../app/state/DocumentContext";
import { inferNodeSchemas } from "../../domain/graph/inferSchemas";
import {
  renderNodeEditor,
  serializeNodeEditorDraft,
  useEditableNode,
} from "./nodeEditors";

export type NodeEditorModalHandle = {
  requestClose: (closeAction?: () => void) => void;
};

export const NodeEditorModal = forwardRef<
  NodeEditorModalHandle,
  {
    node: GraphNode;
    onClose: () => void;
    onSave: (node: GraphNode) => void;
  }
>(function NodeEditorModal({ node, onClose, onSave }, ref) {
  const {
    state: { document },
  } = useDocumentContext();
  const { draft, setDraft } = useEditableNode(node);
  const [pendingCloseAction, setPendingCloseAction] = useState<(() => void) | null>(
    null,
  );

  const schemaOverrides = useMemo(
    () => inferNodeSchemas(document, node.id),
    [document, node.id],
  );
  const serializedDraft = useMemo(
    () => serializeNodeEditorDraft(draft),
    [draft],
  );
  const isDirty =
    JSON.stringify(serializedDraft) !== JSON.stringify(node);

  const requestClose = useCallback(
    (closeAction: () => void = onClose) => {
      if (!isDirty) {
        closeAction();
        return;
      }

      setPendingCloseAction(() => closeAction);
    },
    [isDirty, onClose],
  );

  useImperativeHandle(ref, () => ({ requestClose }), [requestClose]);

  useEffect(() => {
    setPendingCloseAction(null);
  }, [node.id]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      requestClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [requestClose]);

  return (
    <div
      className="modal-backdrop"
      data-testid="node-editor-backdrop"
      role="presentation"
      onClick={() => requestClose()}
    >
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label={`${node.kind} editor`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div className="modal-kind">{node.kind}</div>
          <label className="modal-title-field">
            <span className="sr-only">Node name</span>
            <input
              className="modal-title-input"
              aria-label="Node name"
              value={draft.label}
              onChange={(event) =>
                setDraft({ ...draft, label: event.target.value })
              }
            />
          </label>
        </header>

        <section className="modal-body">
          {renderNodeEditor(draft, setDraft, document, schemaOverrides)}
        </section>

        <footer className="modal-footer">
          <button
            type="button"
            className="ghost-button"
            onClick={() => requestClose()}
          >
            Cancel
          </button>
          <button
            type="button"
            className="solid-button"
            onClick={() => onSave(serializedDraft)}
          >
            Save
          </button>
        </footer>
      </div>

      {pendingCloseAction ? (
        <div
          className="confirm-overlay"
          role="presentation"
          onClick={(event) => event.stopPropagation()}
        >
          <div
            className="confirm-card"
            role="dialog"
            aria-modal="true"
            aria-label="Discard changes"
          >
            <h3>Discard changes?</h3>
            <p>Your unsaved node edits will be lost.</p>
            <div className="confirm-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={() => setPendingCloseAction(null)}
              >
                Keep editing
              </button>
              <button
                type="button"
                className="solid-button"
                onClick={() => {
                  const action = pendingCloseAction;
                  setPendingCloseAction(null);
                  action?.();
                }}
              >
                Discard changes
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
});
```

```css
/* src/index.css */
.modal-title-field {
  display: block;
  margin-top: 8px;
}

.modal-title-input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid transparent;
  border-radius: 12px;
  background: transparent;
  font: inherit;
  font-size: 28px;
  font-weight: 700;
  line-height: 1.1;
  color: #1f1d1a;
}

.modal-title-input:focus {
  outline: none;
  border-color: rgba(154, 95, 25, 0.22);
  background: rgba(248, 241, 227, 0.72);
}

.confirm-overlay {
  position: fixed;
  inset: 0;
  z-index: 21;
  display: grid;
  place-items: center;
  background: rgba(20, 16, 11, 0.18);
}

.confirm-card {
  width: min(420px, calc(100vw - 48px));
  display: grid;
  gap: 12px;
  padding: 20px;
  border-radius: 18px;
  border: 1px solid rgba(95, 70, 43, 0.16);
  background: #fffdf8;
  box-shadow: 0 20px 48px rgba(28, 21, 14, 0.22);
}

.confirm-card h3,
.confirm-card p {
  margin: 0;
}

.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
```

- [ ] **Step 4: Run the modal tests to verify they pass**

Run: `bun test src/features/graph-editor/NodeEditorModal.test.tsx`
Expected: PASS with `32 pass, 0 fail`.

- [ ] **Step 5: Commit the modal editor guard work**

```bash
git add src/features/graph-editor/NodeEditorModal.tsx src/features/graph-editor/NodeEditorModal.test.tsx src/index.css
git commit -m "feat: guard dirty node editor closes"
```

## Task 2: Move Modal Ownership Into GraphCanvas and Guard Node-to-Node Switches

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/features/graph-editor/GraphCanvas.tsx`
- Modify: `src/features/graph-editor/GraphCanvas.test.tsx`
- Test: `src/features/graph-editor/GraphCanvas.test.tsx`

- [ ] **Step 1: Write the failing canvas integration tests**

```tsx
// src/features/graph-editor/GraphCanvas.test.tsx
import userEvent from "@testing-library/user-event";

function getFlowNode(nodeId: string) {
  const nodes = Array.isArray(reactFlowProps?.nodes) ? reactFlowProps.nodes : [];
  const node = nodes.find(
    (candidate) =>
      typeof candidate === "object" &&
      candidate !== null &&
      "id" in candidate &&
      candidate.id === nodeId,
  );

  if (!node) {
    throw new Error(`Missing flow node ${nodeId}`);
  }

  return node;
}

async function openFlowNode(nodeId: string) {
  const onNodeClick = reactFlowProps?.onNodeClick;
  if (typeof onNodeClick !== "function") {
    throw new Error("Missing onNodeClick handler");
  }

  act(() => {
    onNodeClick({} as never, getFlowNode(nodeId) as never);
  });
}

test("clicking another node while dirty requires discard confirmation before switching", async () => {
  const user = userEvent.setup();

  render(
    <DocumentProvider initialDocument={createSampleDocument()}>
      <GraphCanvas diagnostics={[]} />
    </DocumentProvider>,
  );

  await openFlowNode("select-orders");
  await user.clear(screen.getByLabelText("Node name"));
  await user.type(screen.getByLabelText("Node name"), "Projected Orders");

  await openFlowNode("output-orders");

  expect(screen.getByRole("dialog", { name: "Discard changes" })).toBeTruthy();

  await user.click(screen.getByRole("button", { name: "Keep editing" }));
  expect((screen.getByLabelText("Node name") as HTMLInputElement).value).toBe(
    "Projected Orders",
  );

  await openFlowNode("output-orders");
  await user.click(screen.getByRole("button", { name: "Discard changes" }));

  expect((screen.getByLabelText("Node name") as HTMLInputElement).value).toBe(
    "Orders Report",
  );
});

test("saving a renamed node updates the canvas node data label", async () => {
  const user = userEvent.setup();

  render(
    <DocumentProvider initialDocument={createSampleDocument()}>
      <GraphCanvas diagnostics={[]} />
    </DocumentProvider>,
  );

  await openFlowNode("select-orders");
  await user.clear(screen.getByLabelText("Node name"));
  await user.type(screen.getByLabelText("Node name"), "Projected Orders");
  await user.click(screen.getByRole("button", { name: "Save" }));

  expect(getFlowNode("select-orders")).toMatchObject({
    data: {
      node: {
        label: "Projected Orders",
      },
    },
  });
});
```

- [ ] **Step 2: Run the canvas tests to verify they fail**

Run: `bun test src/features/graph-editor/GraphCanvas.test.tsx`
Expected: FAIL because `GraphCanvas` does not render the modal yet, so the new `Node name` and `Discard changes` assertions cannot pass.

- [ ] **Step 3: Move the modal into GraphCanvas and reuse the guarded close handle for editor transitions**

```tsx
// src/features/graph-editor/GraphCanvas.tsx
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Connection,
  type NodeChange,
  type NodeMouseHandler,
} from "@xyflow/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useDocumentContext } from "../../app/state/DocumentContext";
import type { Diagnostic } from "../../domain/diagnostics/types";
import {
  toFlowEdges,
  toFlowNodes,
  type FlowNodeRuntime,
} from "./flowAdapter";
import {
  NodeEditorModal,
  type NodeEditorModalHandle,
} from "./NodeEditorModal";
import { QueryNode } from "./nodes/QueryNode";

export function GraphCanvas({ diagnostics }: { diagnostics: Diagnostic[] }) {
  const { state, dispatch } = useDocumentContext();
  const [nodeRuntimeById, setNodeRuntimeById] = useState<
    Record<string, FlowNodeRuntime>
  >({});
  const editorModalRef = useRef<NodeEditorModalHandle | null>(null);
  const editedNode =
    state.document.nodes.find((node) => node.id === state.editorNodeId) ?? null;

  function requestOpenNodeEditor(nodeId: string | null) {
    if (!editedNode || !editorModalRef.current) {
      dispatch({ type: "open-node-editor", nodeId });
      return;
    }

    editorModalRef.current.requestClose(() => {
      dispatch({ type: "open-node-editor", nodeId });
    });
  }

  const onNodeClick: NodeMouseHandler = (_, node) => {
    dispatch({ type: "select-node", nodeId: node.id });

    if (node.data.node.kind === "output") {
      dispatch({ type: "set-active-output", nodeId: node.id });
    }

    if (state.editorNodeId === node.id) {
      return;
    }

    requestOpenNodeEditor(node.id);
  };

  return (
    <div style={{ width: "100%", minHeight: 520, flex: 1 }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        viewport={state.document.viewport}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onPaneClick={() => {
          dispatch({ type: "select-node", nodeId: null });
          requestOpenNodeEditor(null);
        }}
        onNodesChange={onNodesChange}
        onViewportChange={(viewport) =>
          dispatch({ type: "set-viewport", viewport })
        }
      >
        <Background />
        <MiniMap />
        <Controls />
      </ReactFlow>

      {editedNode ? (
        <NodeEditorModal
          ref={editorModalRef}
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
```

```tsx
// src/App.tsx
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
```

- [ ] **Step 4: Run the canvas tests to verify they pass**

Run: `bun test src/features/graph-editor/GraphCanvas.test.tsx`
Expected: PASS with `4 pass, 0 fail`.

- [ ] **Step 5: Commit the guarded editor switching flow**

```bash
git add src/App.tsx src/features/graph-editor/GraphCanvas.tsx src/features/graph-editor/GraphCanvas.test.tsx
git commit -m "feat: guard dirty node switches"
```

## Task 3: Add Per-Kind Node Presentation Hooks and Canvas Styling

**Files:**
- Modify: `src/features/graph-editor/nodes/QueryNode.tsx`
- Modify: `src/features/graph-editor/nodes/QueryNode.test.tsx`
- Modify: `src/features/graph-editor/nodes/queryNode.css`
- Test: `src/features/graph-editor/nodes/QueryNode.test.tsx`

- [ ] **Step 1: Write the failing renderer tests**

```tsx
// src/features/graph-editor/nodes/QueryNode.test.tsx
test("adds source, transform, and terminal presentation hooks by node kind", () => {
  render(
    <ReactFlowProvider>
      <>
        <QueryNode
          id="from-orders"
          data={{
            node: {
              id: "from-orders",
              kind: "fromTable",
              label: "Orders",
              position: { x: 0, y: 0 },
              data: {
                tableRef: { schemaName: "sales", tableName: "orders" },
                columns: { order_id: "int", total: "float" },
              },
            },
            diagnostics: [],
          }}
          selected={false}
          dragging={false}
        />
        <QueryNode
          id="select-orders"
          data={{
            node: {
              id: "select-orders",
              kind: "select",
              label: "Project",
              position: { x: 0, y: 0 },
              data: {
                mappings: [{ name: "gross_total", expression: "total" }],
              },
            },
            diagnostics: [],
          }}
          selected={false}
          dragging={false}
        />
        <QueryNode
          id="output-orders"
          data={{
            node: {
              id: "output-orders",
              kind: "output",
              label: "Orders Report",
              position: { x: 0, y: 0 },
              data: {
                outputName: "orders_report",
              },
            },
            diagnostics: [],
          }}
          selected={false}
          dragging={false}
        />
      </>
    </ReactFlowProvider>,
  );

  const fromNode = screen.getByText("Orders").closest(".query-node");
  const selectNode = screen.getByText("Project").closest(".query-node");
  const outputNode = screen.getByText("Orders Report").closest(".query-node");

  expect(fromNode?.getAttribute("data-node-family")).toBe("source");
  expect(fromNode?.className).toContain("query-node--fromTable");

  expect(selectNode?.getAttribute("data-node-family")).toBe("transform");
  expect(selectNode?.className).toContain("query-node--select");

  expect(outputNode?.getAttribute("data-node-family")).toBe("terminal");
  expect(outputNode?.className).toContain("query-node--output");
});

test("keeps selected and error state classes alongside the type presentation hooks", () => {
  render(
    <ReactFlowProvider>
      <QueryNode
        id="where-1"
        data={{
          node: {
            id: "where-1",
            kind: "where",
            label: "Where",
            position: { x: 0, y: 0 },
            data: {
              predicate: "id > 0",
            },
          },
          diagnostics: [
            {
              level: "error",
              code: "where.invalid-expression",
              message: "Where predicate is invalid.",
              ref: { nodeId: "where-1", field: "predicate" },
            },
          ],
        }}
        selected={true}
        dragging={false}
      />
    </ReactFlowProvider>,
  );

  const node = screen.getByText("Where").closest(".query-node");

  expect(node?.className).toContain("query-node--where");
  expect(node?.className).toContain("is-selected");
  expect(node?.className).toContain("has-errors");
});
```

- [ ] **Step 2: Run the renderer tests to verify they fail**

Run: `bun test src/features/graph-editor/nodes/QueryNode.test.tsx`
Expected: FAIL because the shared node shell currently has one neutral class list and no family/kind presentation hooks.

- [ ] **Step 3: Add the presentation map, glyph slot, and CSS family/kind variants**

```tsx
// src/features/graph-editor/nodes/QueryNode.tsx
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { GraphNode } from "../../../domain/document/types";
import { formatTableRef } from "../../../domain/schema/types";
import type { FlowNodeData } from "../flowAdapter";
import "./queryNode.css";

type NodePresentation = {
  family: "source" | "transform" | "terminal";
  glyph: string;
};

const presentationByKind: Record<GraphNode["kind"], NodePresentation> = {
  graphInput: { family: "source", glyph: "IN" },
  fromTable: { family: "source", glyph: "TB" },
  join: { family: "transform", glyph: "JN" },
  where: { family: "transform", glyph: "WH" },
  select: { family: "transform", glyph: "SL" },
  aggregation: { family: "transform", glyph: "AG" },
  sort: { family: "transform", glyph: "SO" },
  limit: { family: "transform", glyph: "LM" },
  output: { family: "terminal", glyph: "OUT" },
};

export function QueryNode({ data, selected }: NodeProps<FlowNodeData>) {
  const hasErrors = data.diagnostics.some(
    (diagnostic) => diagnostic.level === "error",
  );
  const presentation = presentationByKind[data.node.kind];

  return (
    <div
      className={[
        "query-node",
        `query-node--family-${presentation.family}`,
        `query-node--${data.node.kind}`,
        selected ? "is-selected" : "",
        hasErrors ? "has-errors" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-node-kind={data.node.kind}
      data-node-family={presentation.family}
    >
      <TargetHandles node={data.node} />
      <div className="query-node__glyph" aria-hidden="true">
        {presentation.glyph}
      </div>
      <div className="query-node__kind">{data.node.kind}</div>
      <div className="query-node__title">{data.node.label}</div>
      <div className="query-node__summary">{summaryText(data.node)}</div>
      {hasErrors ? <span className="query-node__badge">error</span> : null}
      {data.node.kind === "output" ? null : (
        <Handle type="source" id="out" position={Position.Right} />
      )}
    </div>
  );
}
```

```css
/* src/features/graph-editor/nodes/queryNode.css */
.query-node {
  position: relative;
  min-width: 188px;
  padding: 14px 16px 14px 56px;
  border: 1px solid rgba(57, 47, 35, 0.18);
  border-radius: 18px;
  background: rgba(255, 253, 248, 0.96);
  box-shadow: 0 8px 20px rgba(68, 55, 40, 0.08);
}

.query-node__glyph {
  position: absolute;
  left: 14px;
  top: 14px;
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.query-node--family-source {
  background: linear-gradient(180deg, #fffaf0 0%, #fff5e4 100%);
}

.query-node--family-transform {
  background: linear-gradient(180deg, #fffdf8 0%, #f6efe2 100%);
}

.query-node--family-terminal {
  background: linear-gradient(180deg, #f9fbff 0%, #eef4ff 100%);
}

.query-node--graphInput {
  border-color: rgba(166, 113, 42, 0.26);
  border-radius: 24px 16px 16px 16px;
}

.query-node--fromTable {
  border-color: rgba(147, 92, 24, 0.28);
  border-radius: 16px 24px 16px 16px;
}

.query-node--join {
  border-color: rgba(62, 96, 148, 0.3);
  border-radius: 28px 16px 28px 16px;
}

.query-node--where {
  border-color: rgba(52, 108, 128, 0.28);
  border-style: dashed;
}

.query-node--select {
  border-color: rgba(84, 86, 154, 0.28);
  border-radius: 16px;
}

.query-node--aggregation {
  border-color: rgba(69, 102, 82, 0.3);
  border-radius: 16px 16px 26px 26px;
}

.query-node--sort {
  border-color: rgba(104, 82, 148, 0.28);
  border-radius: 26px 26px 16px 16px;
}

.query-node--limit {
  border-color: rgba(126, 79, 55, 0.28);
  border-radius: 16px 26px 16px 26px;
}

.query-node--output {
  border-color: rgba(44, 88, 138, 0.28);
  border-radius: 16px 28px 28px 16px;
}

.query-node--family-source .query-node__glyph {
  background: #f3d8aa;
  color: #71430f;
}

.query-node--family-transform .query-node__glyph {
  background: #d9e6ff;
  color: #294f91;
}

.query-node--family-terminal .query-node__glyph {
  background: #cfe0ff;
  color: #21436f;
}

.query-node.is-selected {
  border-color: #9a5f19;
  box-shadow: 0 10px 26px rgba(154, 95, 25, 0.18);
}

.query-node.has-errors {
  border-color: #ae3f2f;
}
```

- [ ] **Step 4: Run the renderer tests, then the full suite**

Run: `bun test src/features/graph-editor/nodes/QueryNode.test.tsx`
Expected: PASS with `4 pass, 0 fail`.

Run: `bun test`
Expected: PASS with `150 pass, 0 fail`.

- [ ] **Step 5: Commit the node presentation pass**

```bash
git add src/features/graph-editor/nodes/QueryNode.tsx src/features/graph-editor/nodes/QueryNode.test.tsx src/features/graph-editor/nodes/queryNode.css
git commit -m "feat: add node type presentation variants"
```
