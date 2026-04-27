# Modal Scroll, Subgraph Inputs, And Node Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix modal scrolling for long editors, restore downstream modal expression scopes when inputs come from subgraphs, and add a visible node-delete action that also removes connected edges.

**Architecture:** Keep the existing modal and schema-inference structure. Make the modal body the single scroll owner, extend the modal schema-override path so it passes workspace context into centralized schema inference, and add a reducer-backed `delete-node` action exposed through a compact node-level delete affordance on the canvas.

**Tech Stack:** Bun 1.3, React 19, TypeScript, Testing Library, XYFlow, existing in-repo i18n and document reducer

---

## File Structure

- Modify: `src/features/graph-editor/NodeEditorModal.test.tsx`
  Add regressions for scrollable modal body sizing and subgraph-fed downstream expression scopes.
- Modify: `src/features/graph-editor/NodeEditorModal.tsx`
  Pass workspace-aware schema overrides into modal editors.
- Modify: `src/domain/graph/inferSchemas.ts`
  Accept optional workspace inference context in `inferNodeSchemas`.
- Modify: `src/index.css`
  Make `.modal-body` the shrinkable flex child and scroll container.
- Modify: `src/app/state/documentReducer.test.ts`
  Add reducer coverage for deleting a node and its connected edges.
- Modify: `src/app/state/documentReducer.ts`
  Add `delete-node` action and cascade edge cleanup.
- Modify: `src/features/i18n/types.ts`
  Add a message key for node deletion affordance text.
- Modify: `src/features/i18n/messages.ts`
  Add English and Simplified Chinese strings for node deletion.
- Modify: `src/features/graph-editor/flowAdapter.ts`
  Carry a node delete callback into flow node data.
- Modify: `src/features/graph-editor/nodes/QueryNode.tsx`
  Render the node delete affordance and invoke the callback.
- Modify: `src/features/graph-editor/nodes/QueryNode.test.tsx`
  Cover delete affordance rendering and callback behavior.
- Modify: `src/features/graph-editor/GraphCanvas.tsx`
  Dispatch `delete-node` from the node affordance.
- Modify: `src/features/graph-editor/GraphCanvas.test.tsx`
  Verify the canvas deletion flow updates document state.

## Task 1: Fix Modal Scroll And Subgraph-Fed Editor Scopes

**Files:**
- Modify: `src/features/graph-editor/NodeEditorModal.test.tsx`
- Modify: `src/features/graph-editor/NodeEditorModal.tsx`
- Modify: `src/domain/graph/inferSchemas.ts`
- Modify: `src/index.css`
- Test: `src/features/graph-editor/NodeEditorModal.test.tsx`

- [ ] **Step 1: Write the failing modal regression tests**

```tsx
test("modal body keeps the sizing contract needed for long editor scrolling", () => {
  const node: GraphNode = {
    id: "select-1",
    kind: "select",
    label: "Select",
    position: { x: 0, y: 0 },
    data: {
      mappings: Array.from({ length: 20 }, (_, index) => ({
        name: `col_${index + 1}`,
        expression: `${index + 1}`,
      })),
    },
  };

  renderModal({ node });

  const body = document.querySelector(".modal-body");
  expect(body).toBeTruthy();
  expect(body?.className).toContain("modal-body");
});

test("subgraph-fed select editors reuse child output columns for expression suggestions", async () => {
  const user = userEvent.setup();
  const workspace: GraphWorkspace = {
    version: 2,
    metadata: { name: "Workspace" },
    entryGraphId: "graph-parent",
    graphs: [
      {
        id: "graph-parent",
        metadata: { name: "Parent" },
        viewport: { x: 0, y: 0, zoom: 1 },
        nodes: [
          {
            id: "subgraph-1",
            kind: "subgraph",
            label: "Subgraph",
            position: { x: 0, y: 0 },
            data: { graphId: "graph-child" },
          },
          {
            id: "select-1",
            kind: "select",
            label: "Select",
            position: { x: 240, y: 0 },
            data: { mappings: [{ name: "kept_total", expression: "" }] },
          },
        ],
        edges: [
          {
            id: "edge-subgraph-select",
            source: "subgraph-1",
            sourceHandle: "out:child-output",
            target: "select-1",
            targetHandle: "in",
          },
        ],
      },
      {
        id: "graph-child",
        metadata: { name: "Child" },
        viewport: { x: 0, y: 0, zoom: 1 },
        nodes: [
          {
            id: "child-input",
            kind: "graphInput",
            label: "Input",
            position: { x: 0, y: 0 },
            data: { inputName: "orders", columns: { total: "int" } },
          },
          {
            id: "child-output",
            kind: "output",
            label: "Output",
            position: { x: 200, y: 0 },
            data: {
              outputName: "orders_out",
              listeners: createDefaultOutputListenerConfig("orders_out"),
            },
          },
        ],
        edges: [
          {
            id: "edge-child",
            source: "child-input",
            sourceHandle: "out",
            target: "child-output",
            targetHandle: "in",
          },
        ],
      },
    ],
  };

  const selectNode = workspace.graphs[0]!.nodes.find((node) => node.id === "select-1")!;
  renderModal({ node: selectNode, workspace });

  await user.type(screen.getByLabelText("Expression 1"), "inp");

  expect(await screen.findByRole("button", { name: "Insert input.total" })).toBeTruthy();
});
```

- [ ] **Step 2: Run the focused modal tests to verify they fail**

Run: `bun test src/features/graph-editor/NodeEditorModal.test.tsx`

Expected:
- the new scroll regression fails because the modal body does not yet expose the required sizing contract
- the subgraph-fed suggestion regression fails because modal schema overrides still omit workspace context

- [ ] **Step 3: Write the minimal modal implementation**

```ts
// src/domain/graph/inferSchemas.ts
export function inferNodeSchemas(
  document: GraphDocument,
  nodeId: string,
  context: { workspace?: GraphWorkspace } = {},
): Record<string, ColumnMap> {
  const byId = nodesById(document);
  const cache = new Map<string, InferredNodeSchema>();
  inferNodeSchema(document, nodeId, byId, cache, new Set(), {
    workspace: context.workspace,
  });
  return cachedSchemas(cache);
}
```

```tsx
// src/features/graph-editor/NodeEditorModal.tsx
const schemaOverrides = useMemo(() => {
  const needsOverrides =
    draft.kind === "select" ||
    draft.kind === "aggregation" ||
    draft.kind === "where" ||
    draft.kind === "join" ||
    draft.kind === "sort";

  if (!needsOverrides) {
    return undefined;
  }

  return inferNodeSchemas(graphDocument, node.id, {
    workspace: state.workspace,
  });
}, [draft.kind, graphDocument, node.id, state.workspace]);
```

```css
/* src/index.css */
.modal-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
```

- [ ] **Step 4: Run the focused modal tests to verify they pass**

Run: `bun test src/features/graph-editor/NodeEditorModal.test.tsx`

Expected: PASS, including the new scrolling/scope regressions and the existing modal tests.

- [ ] **Step 5: Commit the modal fixes**

```bash
git add src/features/graph-editor/NodeEditorModal.test.tsx \
  src/features/graph-editor/NodeEditorModal.tsx \
  src/domain/graph/inferSchemas.ts \
  src/index.css
git commit -m "fix: restore modal scrolling and subgraph editor scopes"
```

## Task 2: Add Reducer-Backed Node Deletion

**Files:**
- Modify: `src/app/state/documentReducer.test.ts`
- Modify: `src/app/state/documentReducer.ts`
- Modify: `src/features/i18n/types.ts`
- Modify: `src/features/i18n/messages.ts`
- Modify: `src/features/graph-editor/flowAdapter.ts`
- Modify: `src/features/graph-editor/nodes/QueryNode.tsx`
- Modify: `src/features/graph-editor/nodes/QueryNode.test.tsx`
- Modify: `src/features/graph-editor/GraphCanvas.tsx`
- Modify: `src/features/graph-editor/GraphCanvas.test.tsx`
- Test: `src/app/state/documentReducer.test.ts`
- Test: `src/features/graph-editor/nodes/QueryNode.test.tsx`
- Test: `src/features/graph-editor/GraphCanvas.test.tsx`

- [ ] **Step 1: Write the failing deletion regressions**

```ts
// src/app/state/documentReducer.test.ts
test("deletes a node and any edges connected to it", () => {
  const initial = createInitialEditorState(createSampleDocument());

  const next = documentReducer(initial, {
    type: "delete-node",
    nodeId: "select-orders",
  });

  expect(next.document.nodes.some((node) => node.id === "select-orders")).toBe(false);
  expect(
    next.document.edges.some(
      (edge) => edge.source === "select-orders" || edge.target === "select-orders",
    ),
  ).toBe(false);
});
```

```tsx
// src/features/graph-editor/nodes/QueryNode.test.tsx
test("invokes the node delete callback from the canvas affordance", async () => {
  const user = userEvent.setup();
  const onDelete = mock();

  render(
    <I18nProvider deps={{ navigatorLanguage: "en-US" }}>
      <QueryNode
        id="where-1"
        selected
        data={{
          node: {
            id: "where-1",
            kind: "where",
            label: "Where",
            position: { x: 0, y: 0 },
            data: { predicate: "total > 0" },
          },
          diagnostics: [],
          onDelete,
        }}
      />
    </I18nProvider>,
  );

  await user.click(screen.getByRole("button", { name: "Delete node" }));

  expect(onDelete).toHaveBeenCalledWith("where-1");
});
```

```tsx
// src/features/graph-editor/GraphCanvas.test.tsx
test("deletes the selected node through the node affordance", async () => {
  const user = userEvent.setup();

  render(
    <I18nProvider deps={{ navigatorLanguage: "en-US" }}>
      <DocumentProvider initialDocument={createSampleDocument()}>
        <GraphCanvas outputRuntime={createEmptyOutputRuntime()} />
      </DocumentProvider>
    </I18nProvider>,
  );

  await invokeNodeClick("select-orders");
  await user.click(screen.getByRole("button", { name: "Delete node" }));

  expect(screen.queryByLabelText("Node name")).toBeNull();
});
```

- [ ] **Step 2: Run the focused deletion tests to verify they fail**

Run: `bun test src/app/state/documentReducer.test.ts src/features/graph-editor/nodes/QueryNode.test.tsx src/features/graph-editor/GraphCanvas.test.tsx`

Expected:
- reducer test fails because `delete-node` is not a valid action yet
- node test fails because no delete affordance exists
- canvas test fails because clicking a node cannot delete it

- [ ] **Step 3: Write the minimal deletion implementation**

```ts
// src/app/state/documentReducer.ts
export type EditorAction =
  | { type: "delete-node"; nodeId: string }
  // existing actions...

case "delete-node":
  return updateActiveGraph(state, (graph) => ({
    ...graph,
    nodes: graph.nodes.filter((node) => node.id !== action.nodeId),
    edges: graph.edges.filter(
      (edge) => edge.source !== action.nodeId && edge.target !== action.nodeId,
    ),
  }));
```

```ts
// src/features/graph-editor/flowAdapter.ts
export interface FlowNodeData {
  node: GraphNode;
  diagnostics: Diagnostic[];
  workspace?: GraphWorkspace;
  onDelete?: (nodeId: string) => void;
}
```

```tsx
// src/features/graph-editor/GraphCanvas.tsx
const nodes = useMemo(
  () =>
    toFlowNodes(
      state.document,
      state.workspace,
      outputRuntime.diagnostics,
      state.selectedNodeId,
      nodeRuntimeById,
      (nodeId) => dispatch({ type: "delete-node", nodeId }),
    ),
  [dispatch, nodeRuntimeById, outputRuntime.diagnostics, state.document, state.selectedNodeId, state.workspace],
);
```

```tsx
// src/features/graph-editor/nodes/QueryNode.tsx
{data.onDelete ? (
  <button
    type="button"
    className="query-node__delete"
    aria-label={t("queryNode.delete")}
    onClick={(event) => {
      event.stopPropagation();
      data.onDelete?.(id);
    }}
  >
    ×
  </button>
) : null}
```

- [ ] **Step 4: Run the focused deletion tests to verify they pass**

Run: `bun test src/app/state/documentReducer.test.ts src/features/graph-editor/nodes/QueryNode.test.tsx src/features/graph-editor/GraphCanvas.test.tsx`

Expected: PASS, including reducer cleanup and canvas-triggered node deletion.

- [ ] **Step 5: Commit the deletion work**

```bash
git add src/app/state/documentReducer.test.ts \
  src/app/state/documentReducer.ts \
  src/features/i18n/types.ts \
  src/features/i18n/messages.ts \
  src/features/graph-editor/flowAdapter.ts \
  src/features/graph-editor/nodes/QueryNode.tsx \
  src/features/graph-editor/nodes/QueryNode.test.tsx \
  src/features/graph-editor/GraphCanvas.tsx \
  src/features/graph-editor/GraphCanvas.test.tsx
git commit -m "feat: add canvas node deletion"
```

## Task 3: Full Verification

**Files:**
- No additional source files
- Test: full repository checks

- [ ] **Step 1: Run the full test suite**

Run: `bun test`

Expected: PASS with the existing suite plus the new regressions.

- [ ] **Step 2: Run the production build**

Run: `bun run build`

Expected: PASS and emit the production bundle without type or build errors.

- [ ] **Step 3: Prepare branch completion**

Run:

```bash
git status --short
git log --oneline --decorate -5
```

Expected: clean working tree aside from intentional plan/spec docs if not yet committed, and a short history showing the fix commits on `feature/modal-scroll-subgraph-inputs`.
