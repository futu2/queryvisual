# Graph Composition Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add local reusable graph composition by moving the app from a single-document model to a single-workspace model with multiple graphs, live subgraph references, and whole-workspace JSON import/export.

**Architecture:** First wrap the existing graph document model in a workspace root and move editor state to track an active graph. Then add graph catalog and graph-input naming so graphs have explicit interfaces. After that, introduce `subgraph` nodes plus inferred child interfaces, and finally make validation, compilation, and output runtime recurse across graph references with live parent invalidation.

**Tech Stack:** Bun 1.3, React 19, TypeScript, `@xyflow/react`, Testing Library, Bun test, existing app CSS in `src/index.css`

---

## File Structure

- Create: `src/domain/workspace/sample.ts`
  Workspace-level sample factory that wraps the existing sample graph into a default one-graph workspace.
- Create: `src/domain/workspace/interfaces.ts`
  Inferred public interface helpers for child graph `graphInput` and `output` nodes.
- Create: `src/domain/workspace/dependencies.ts`
  Cross-graph dependency graph helpers, including reference lookups and cycle detection.
- Create: `src/features/workspace/GraphCatalog.tsx`
  Sidebar graph list with create/rename/switch/delete actions.
- Create: `src/features/workspace/GraphCatalog.test.tsx`
  Focused tests for catalog behavior and reducer dispatch effects.
- Modify: `src/domain/document/types.ts`
  Introduce `GraphWorkspace`, `GraphDefinition`, `subgraph` nodes, `graphInput.inputName`, and dynamic edge handles while keeping existing graph node payload conventions.
- Modify: `src/domain/document/sample.ts`
  Keep the single-graph sample factory usable during migration, but ensure `graphInput` nodes carry `inputName`.
- Modify: `src/features/document-storage/fileIO.ts`
  Parse and serialize workspace JSON, migrate legacy single-graph JSON to a one-graph workspace, and accept `subgraph` plus dynamic handle payloads.
- Modify: `src/features/document-storage/fileIO.test.ts`
  Add workspace round-trip, legacy migration, and `subgraph` payload validation coverage.
- Modify: `src/app/state/documentReducer.ts`
  Store workspace state, active graph id, graph catalog actions, and graph-scoped node/edge updates.
- Modify: `src/app/state/documentReducer.test.ts`
  Add reducer coverage for active graph switching, graph create/rename/delete, and active-graph scoped node edits.
- Modify: `src/app/state/DocumentContext.tsx`
  Accept an initial workspace rather than an initial document and reset state when a new workspace is loaded.
- Modify: `src/App.tsx`
  Render the graph catalog, derive the active graph from workspace state, and pass workspace-aware runtime state to the canvas.
- Modify: `src/App.test.tsx`
  Update smoke coverage for workspace shell behavior.
- Modify: `src/features/document-storage/DocumentToolbar.tsx`
  Save/load whole workspaces instead of a single graph document.
- Modify: `src/features/graph-editor/NodePalette.tsx`
  Seed `graphInput` names and add a `Subgraph` palette item.
- Modify: `src/features/graph-editor/nodeEditors.tsx`
  Edit `graphInput.inputName` plus fields, and edit `subgraph.graphId`.
- Modify: `src/features/graph-editor/NodeEditorModal.tsx`
  Support workspace-aware node editing props and subgraph quick-jump controls.
- Modify: `src/features/graph-editor/NodeEditorModal.test.tsx`
  Cover graph-input naming, subgraph node editing, and quick-jump wiring.
- Modify: `src/features/graph-editor/GraphCanvas.tsx`
  Render the active graph from workspace state, connect dynamic subgraph handles, and support graph navigation from the modal.
- Modify: `src/features/graph-editor/GraphCanvas.test.tsx`
  Cover dynamic handle connections and graph switch flows.
- Modify: `src/features/graph-editor/flowAdapter.ts`
  Adapt subgraph interfaces into React Flow node/edge data, including dynamic handle labels.
- Modify: `src/features/graph-editor/nodes/QueryNode.tsx`
  Render subgraph nodes with one input handle per child input and one output handle per child output.
- Modify: `src/features/graph-editor/nodes/QueryNode.test.tsx`
  Cover graph-input summary changes and subgraph handle rendering.
- Modify: `src/features/output-runtime/outputRuntime.ts`
  Compile outputs for the active graph in workspace context and invalidate parent results when child graphs change.
- Modify: `src/features/output-runtime/outputRuntime.test.ts`
  Cover live parent recomputation through subgraph references.
- Modify: `src/domain/compile/compileOutput.ts`
  Compile outputs in workspace + graph context.
- Modify: `src/domain/compile/compileOutput.test.ts`
  Cover a composed parent graph output.
- Modify: `src/domain/graph/semantic.ts`
  Carry graph identity and child-context diagnostic metadata.
- Modify: `src/domain/graph/expressionScope.ts`
  Expose inferred schemas for subgraph outputs and named child input handles.
- Modify: `src/domain/graph/expressionScope.test.ts`
  Cover subgraph output scope propagation.
- Modify: `src/domain/graph/inferSchemas.ts`
  Infer node schemas through subgraph boundaries.
- Modify: `src/domain/graph/inferSchemas.test.ts`
  Cover child-output schema propagation and invalid dependency fallback.
- Modify: `src/domain/graph/validate.ts`
  Validate child interface uniqueness, parent-child compatibility, missing subgraph inputs, and graph cycles.
- Modify: `src/domain/graph/validate.test.ts`
  Cover duplicate child names, missing child inputs, incompatible schemas, and cycle diagnostics.
- Modify: `src/features/integration/appFlow.test.tsx`
  Cover live parent SQL updates when child graphs change and workspace load behavior.
- Modify: `src/index.css`
  Style graph catalog rows, graph-input summaries, and subgraph nodes/handles.

## Task 1: Move Persistence And Editor State To A Workspace Root

**Files:**
- Create: `src/domain/workspace/sample.ts`
- Modify: `src/domain/document/types.ts`
- Modify: `src/features/document-storage/fileIO.ts`
- Modify: `src/features/document-storage/fileIO.test.ts`
- Modify: `src/app/state/documentReducer.ts`
- Modify: `src/app/state/documentReducer.test.ts`
- Modify: `src/app/state/DocumentContext.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/features/document-storage/DocumentToolbar.tsx`
- Test: `src/features/document-storage/fileIO.test.ts`
- Test: `src/app/state/documentReducer.test.ts`
- Test: `src/App.test.tsx`

- [ ] **Step 1: Write the failing workspace persistence and reducer tests**

```ts
// src/features/document-storage/fileIO.test.ts
test("wraps legacy single-graph JSON into a one-graph workspace", () => {
  const workspace = parseWorkspaceJson(
    JSON.stringify({
      version: 1,
      metadata: { name: "legacy" },
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [],
      edges: [],
    }),
  );

  expect(workspace).toMatchObject({
    version: 2,
    metadata: { name: "legacy" },
    entryGraphId: expect.any(String),
    graphs: [
      {
        metadata: { name: "legacy" },
        viewport: { x: 0, y: 0, zoom: 1 },
        nodes: [],
        edges: [],
      },
    ],
  });
});

test("round-trips an explicit workspace JSON payload", () => {
  const workspace = parseWorkspaceJson(
    JSON.stringify({
      version: 2,
      metadata: { name: "workspace" },
      entryGraphId: "graph-main",
      graphs: [
        {
          id: "graph-main",
          metadata: { name: "Main" },
          viewport: { x: 0, y: 0, zoom: 1 },
          nodes: [],
          edges: [],
        },
      ],
    }),
  );

  expect(serializeWorkspaceJson(workspace)).toContain('"entryGraphId": "graph-main"');
});

// src/app/state/documentReducer.test.ts
test("creates initial editor state from a sample workspace", () => {
  const state = createInitialEditorState(createSampleWorkspace());

  expect(state.activeGraphId).toBe(state.workspace.entryGraphId);
  expect(getActiveGraph(state)?.id).toBe(state.workspace.entryGraphId);
});

test("replace-workspace resets selection and switches the active graph", () => {
  const state = {
    ...createInitialEditorState(createSampleWorkspace()),
    selectedNodeId: "from-orders",
    editorNodeId: "from-orders",
  };

  const next = documentReducer(state, {
    type: "replace-workspace",
    workspace: {
      version: 2,
      metadata: { name: "Replacement" },
      entryGraphId: "graph-b",
      graphs: [
        {
          id: "graph-b",
          metadata: { name: "B" },
          viewport: { x: 10, y: 20, zoom: 0.8 },
          nodes: [],
          edges: [],
        },
      ],
    },
  });

  expect(next.activeGraphId).toBe("graph-b");
  expect(next.selectedNodeId).toBeNull();
  expect(next.editorNodeId).toBeNull();
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `bun test src/features/document-storage/fileIO.test.ts src/app/state/documentReducer.test.ts src/App.test.tsx`

Expected: FAIL because workspace types, parse/serialize helpers, reducer actions, and context state still assume a single `GraphDocument`.

- [ ] **Step 3: Implement the workspace root, legacy migration, and workspace-aware editor state**

```ts
// src/domain/document/types.ts
export interface GraphDefinition {
  id: string;
  metadata: {
    name: string;
  };
  viewport: {
    x: number;
    y: number;
    zoom: number;
  };
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphWorkspace {
  version: 2;
  metadata: {
    name: string;
  };
  entryGraphId: string;
  graphs: GraphDefinition[];
}

// Preserve the existing internal name while the rest of the code migrates.
export type GraphDocument = GraphDefinition;
```

```ts
// src/domain/workspace/sample.ts
import { createSampleDocument } from "../document/sample";
import type { GraphWorkspace } from "../document/types";

export function createSampleWorkspace(): GraphWorkspace {
  const graph = {
    ...createSampleDocument(),
    id: "graph-main",
    metadata: { name: createSampleDocument().metadata.name },
  };

  return {
    version: 2,
    metadata: { name: "QueryVisual Workspace" },
    entryGraphId: graph.id,
    graphs: [graph],
  };
}
```

```ts
// src/app/state/documentReducer.ts
export interface EditorState {
  workspace: GraphWorkspace;
  activeGraphId: string;
  selectedNodeId: string | null;
  editorNodeId: string | null;
}

export function getActiveGraph(state: EditorState): GraphDocument | null {
  return (
    state.workspace.graphs.find((graph) => graph.id === state.activeGraphId) ?? null
  );
}

export type EditorAction =
  | { type: "replace-workspace"; workspace: GraphWorkspace }
  | { type: "set-active-graph"; graphId: string }
  | { type: "add-node"; node: GraphNode }
  | { type: "replace-node"; node: GraphNode }
  | { type: "upsert-edge"; edge: GraphEdge }
  | { type: "delete-edge"; edgeId: string }
  | { type: "set-node-position"; nodeId: string; position: GraphNode["position"] }
  | { type: "set-viewport"; viewport: GraphDocument["viewport"] }
  | { type: "open-node-editor"; nodeId: string | null }
  | { type: "select-node"; nodeId: string | null };
```

```ts
// src/features/document-storage/fileIO.ts
export function serializeWorkspaceJson(workspace: GraphWorkspace) {
  return JSON.stringify(workspace, null, 2);
}

export function parseWorkspaceJson(raw: string): GraphWorkspace {
  const parsed = JSON.parse(raw) as unknown;

  if (isLegacyGraphDocument(parsed)) {
    return migrateLegacyDocumentToWorkspace(parsed);
  }
  if (!isGraphWorkspace(parsed)) {
    throw new Error("Invalid QueryVisual workspace");
  }
  return normalizeWorkspace(parsed);
}
```

- [ ] **Step 4: Run the focused tests to verify the workspace migration passes**

Run: `bun test src/features/document-storage/fileIO.test.ts src/app/state/documentReducer.test.ts src/App.test.tsx`

Expected: PASS with workspace load/save behavior, reducer state migration, and the shell still rendering from the active graph.

- [ ] **Step 5: Commit the workspace-root migration**

```bash
git add src/domain/document/types.ts src/domain/workspace/sample.ts src/features/document-storage/fileIO.ts src/features/document-storage/fileIO.test.ts src/app/state/documentReducer.ts src/app/state/documentReducer.test.ts src/app/state/DocumentContext.tsx src/App.tsx src/App.test.tsx src/features/document-storage/DocumentToolbar.tsx
git commit -m "feat: add workspace-root editor state"
```

## Task 2: Add Graph Catalog UI And Explicit Graph Input Names

**Files:**
- Create: `src/features/workspace/GraphCatalog.tsx`
- Create: `src/features/workspace/GraphCatalog.test.tsx`
- Modify: `src/domain/document/types.ts`
- Modify: `src/features/graph-editor/NodePalette.tsx`
- Modify: `src/features/graph-editor/nodeEditors.tsx`
- Modify: `src/features/graph-editor/NodeEditorModal.test.tsx`
- Modify: `src/features/graph-editor/nodes/QueryNode.test.tsx`
- Modify: `src/app/state/documentReducer.ts`
- Modify: `src/app/state/documentReducer.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/index.css`
- Test: `src/features/workspace/GraphCatalog.test.tsx`
- Test: `src/features/graph-editor/NodeEditorModal.test.tsx`
- Test: `src/app/state/documentReducer.test.ts`

- [ ] **Step 1: Write the failing catalog and graph-input tests**

```tsx
// src/features/workspace/GraphCatalog.test.tsx
test("creates, renames, and switches graphs through the catalog", async () => {
  const user = userEvent.setup();

  render(
    <DocumentProvider initialWorkspace={createSampleWorkspace()}>
      <GraphCatalog />
      <EditorStateProbe />
    </DocumentProvider>,
  );

  await user.click(screen.getByRole("button", { name: "New graph" }));
  await user.clear(screen.getByLabelText("Graph name graph-2"));
  await user.type(screen.getByLabelText("Graph name graph-2"), "Reusable Filters");
  await user.click(screen.getByRole("button", { name: "Open Reusable Filters" }));

  expect(screen.getByTestId("active-graph-name").textContent).toBe("Reusable Filters");
});

// src/features/graph-editor/NodeEditorModal.test.tsx
test("graphInput nodes save an explicit input name and field list", async () => {
  const user = userEvent.setup();
  const onSave = mock(() => {});

  renderModal({
    node: {
      id: "graph-input-orders",
      kind: "graphInput",
      label: "Orders Input",
      position: { x: 0, y: 0 },
      data: {
        inputName: "orders_in",
        columns: { order_id: "int" },
      },
    },
    onSave,
  });

  await user.clear(screen.getByLabelText("Input name"));
  await user.type(screen.getByLabelText("Input name"), "orders_source");
  await user.click(screen.getByRole("button", { name: "Add field" }));
  await user.type(screen.getByLabelText("Field name 2"), "total");
  await user.selectOptions(screen.getByLabelText("Field type 2"), "float");
  await user.click(screen.getByRole("button", { name: "Save" }));

  expect(onSave.mock.calls[0][0].data).toEqual({
    inputName: "orders_source",
    columns: { order_id: "int", total: "float" },
  });
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `bun test src/features/workspace/GraphCatalog.test.tsx src/features/graph-editor/NodeEditorModal.test.tsx src/app/state/documentReducer.test.ts`

Expected: FAIL because there is no catalog component yet, reducer has no graph catalog actions, and `graphInput` nodes still only persist `columns`.

- [ ] **Step 3: Implement graph catalog actions and graph-input naming**

```ts
// src/domain/document/types.ts
type GraphNode =
  | GraphNodeBase<"graphInput", { inputName: string; columns: ColumnMap }>
  | GraphNodeBase<"fromTable", { tableRef: TableRef; columns: ColumnMap }>
  | GraphNodeBase<"join", { joinType: "inner" | "left" | "right" | "full"; predicate: string }>
  | GraphNodeBase<"where", { predicate: string }>
  | GraphNodeBase<"select", { mappings: NamedExpression[] }>
  | GraphNodeBase<"aggregation", { groupBy: NamedExpression[]; aggregates: NamedExpression[] }>
  | GraphNodeBase<"sort", { items: SortItem[] }>
  | GraphNodeBase<"limit", { count: number; offset: number | null }>
  | GraphNodeBase<"output", { outputName: string; listeners: OutputListenerConfig }>;
```

```ts
// src/app/state/documentReducer.ts
export type EditorAction =
  | { type: "replace-workspace"; workspace: GraphWorkspace }
  | { type: "create-graph"; graph: GraphDocument }
  | { type: "rename-graph"; graphId: string; name: string }
  | { type: "delete-graph"; graphId: string }
  | { type: "set-active-graph"; graphId: string }
  | { type: "add-node"; node: GraphNode }
  | { type: "replace-node"; node: GraphNode }
  | { type: "upsert-edge"; edge: GraphEdge }
  | { type: "delete-edge"; edgeId: string }
  | { type: "set-node-position"; nodeId: string; position: GraphNode["position"] }
  | { type: "set-viewport"; viewport: GraphDocument["viewport"] }
  | { type: "open-node-editor"; nodeId: string | null }
  | { type: "select-node"; nodeId: string | null };

case "create-graph":
  return {
    ...state,
    workspace: {
      ...state.workspace,
      graphs: [...state.workspace.graphs, action.graph],
    },
    activeGraphId: action.graph.id,
    selectedNodeId: null,
    editorNodeId: null,
  };
```

```tsx
// src/features/workspace/GraphCatalog.tsx
function createEmptyGraph(id: string): GraphDocument {
  return {
    id,
    metadata: { name: id },
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [],
    edges: [],
  };
}

export function GraphCatalog() {
  const { state, dispatch } = useDocumentContext();

  return (
    <section className="graph-catalog">
      <div className="graph-catalog__header">
        <h2>Graphs</h2>
        <button
          type="button"
          className="ghost-button"
          onClick={() =>
            dispatch({
              type: "create-graph",
              graph: createEmptyGraph(`graph-${state.workspace.graphs.length + 1}`),
            })
          }
        >
          New graph
        </button>
      </div>
      {state.workspace.graphs.map((graph) => (
        <GraphCatalogRow key={graph.id} graph={graph} isActive={graph.id === state.activeGraphId} />
      ))}
    </section>
  );
}
```

```ts
// src/features/graph-editor/NodePalette.tsx
case "graphInput":
  return {
    ...base,
    kind,
    data: {
      inputName: `input_${index + 1}`,
      columns: { id: "int" },
    },
  };
```

- [ ] **Step 4: Run the focused tests to verify the catalog and graph-input contract pass**

Run: `bun test src/features/workspace/GraphCatalog.test.tsx src/features/graph-editor/NodeEditorModal.test.tsx src/app/state/documentReducer.test.ts`

Expected: PASS with graph create/rename/switch behavior and `graphInput.inputName` persistence through the modal.

- [ ] **Step 5: Commit the graph catalog and graph-input work**

```bash
git add src/features/workspace/GraphCatalog.tsx src/features/workspace/GraphCatalog.test.tsx src/domain/document/types.ts src/features/graph-editor/NodePalette.tsx src/features/graph-editor/nodeEditors.tsx src/features/graph-editor/NodeEditorModal.test.tsx src/features/graph-editor/nodes/QueryNode.test.tsx src/app/state/documentReducer.ts src/app/state/documentReducer.test.ts src/App.tsx src/index.css
git commit -m "feat: add graph catalog and named graph inputs"
```

## Task 3: Add Subgraph Nodes And Workspace Interface Rendering

**Files:**
- Create: `src/domain/workspace/interfaces.ts`
- Modify: `src/domain/document/types.ts`
- Modify: `src/features/document-storage/fileIO.ts`
- Modify: `src/features/document-storage/fileIO.test.ts`
- Modify: `src/features/graph-editor/NodePalette.tsx`
- Modify: `src/features/graph-editor/nodeEditors.tsx`
- Modify: `src/features/graph-editor/NodeEditorModal.tsx`
- Modify: `src/features/graph-editor/NodeEditorModal.test.tsx`
- Modify: `src/features/graph-editor/GraphCanvas.tsx`
- Modify: `src/features/graph-editor/GraphCanvas.test.tsx`
- Modify: `src/features/graph-editor/flowAdapter.ts`
- Modify: `src/features/graph-editor/nodes/QueryNode.tsx`
- Modify: `src/features/graph-editor/nodes/QueryNode.test.tsx`
- Modify: `src/index.css`
- Test: `src/features/document-storage/fileIO.test.ts`
- Test: `src/features/graph-editor/NodeEditorModal.test.tsx`
- Test: `src/features/graph-editor/GraphCanvas.test.tsx`
- Test: `src/features/graph-editor/nodes/QueryNode.test.tsx`

- [ ] **Step 1: Write the failing subgraph editor and rendering tests**

```tsx
// src/features/graph-editor/nodes/QueryNode.test.tsx
test("subgraph nodes render one handle per child input and output", () => {
  render(
    <QueryNode
      data={{
        node: {
          id: "subgraph-1",
          kind: "subgraph",
          label: "Orders Package",
          position: { x: 0, y: 0 },
          data: { graphId: "graph-child" },
        },
        diagnostics: [],
        workspace: createWorkspaceWithChildInterface(),
      }}
      selected={false}
      dragging={false}
    />,
  );

  expect(screen.getByText("orders_in")).toBeTruthy();
  expect(screen.getByText("orders_report")).toBeTruthy();
  expect(screen.getByText("1 inputs / 1 outputs")).toBeTruthy();
});

// src/features/graph-editor/NodeEditorModal.test.tsx
test("subgraph nodes save a referenced graph id and support open-child jump", async () => {
  const user = userEvent.setup();
  const onOpenGraph = mock(() => {});
  const onSave = mock(() => {});

  renderModal({
    node: {
      id: "subgraph-1",
      kind: "subgraph",
      label: "Orders Package",
      position: { x: 0, y: 0 },
      data: { graphId: "graph-child" },
    },
    workspace: createWorkspaceWithChildInterface(),
    onSave,
    onOpenGraph,
  });

  await user.selectOptions(screen.getByLabelText("Referenced graph"), "graph-filters");
  await user.click(screen.getByRole("button", { name: "Open Filters" }));
  await user.click(screen.getByRole("button", { name: "Save" }));

  expect(onOpenGraph).toHaveBeenCalledWith("graph-filters");
  expect(onSave.mock.calls[0][0].data).toEqual({ graphId: "graph-filters" });
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `bun test src/features/document-storage/fileIO.test.ts src/features/graph-editor/NodeEditorModal.test.tsx src/features/graph-editor/GraphCanvas.test.tsx src/features/graph-editor/nodes/QueryNode.test.tsx`

Expected: FAIL because `subgraph` nodes do not exist, edge handles are still restricted to static literals, and there is no inferred child interface helper.

- [ ] **Step 3: Implement subgraph nodes, dynamic handles, and interface inference**

```ts
// src/domain/workspace/interfaces.ts
export interface GraphInputInterface {
  nodeId: string;
  inputName: string;
  columns: ColumnMap;
}

export interface GraphOutputInterface {
  nodeId: string;
  outputName: string;
}

export function inferGraphInterface(graph: GraphDocument) {
  return {
    inputs: graph.nodes
      .filter((node): node is Extract<GraphNode, { kind: "graphInput" }> => node.kind === "graphInput")
      .map((node) => ({ nodeId: node.id, inputName: node.data.inputName, columns: node.data.columns })),
    outputs: graph.nodes
      .filter((node): node is Extract<GraphNode, { kind: "output" }> => node.kind === "output")
      .map((node) => ({ nodeId: node.id, outputName: node.data.outputName })),
  };
}
```

```ts
// src/domain/document/types.ts
export type GraphNode =
  | GraphNodeBase<"graphInput", { inputName: string; columns: ColumnMap }>
  | GraphNodeBase<"fromTable", { tableRef: TableRef; columns: ColumnMap }>
  | GraphNodeBase<"join", { joinType: "inner" | "left" | "right" | "full"; predicate: string }>
  | GraphNodeBase<"where", { predicate: string }>
  | GraphNodeBase<"select", { mappings: NamedExpression[] }>
  | GraphNodeBase<"aggregation", { groupBy: NamedExpression[]; aggregates: NamedExpression[] }>
  | GraphNodeBase<"sort", { items: SortItem[] }>
  | GraphNodeBase<"limit", { count: number; offset: number | null }>
  | GraphNodeBase<"output", { outputName: string; listeners: OutputListenerConfig }>
  | GraphNodeBase<"subgraph", { graphId: string }>;

export interface GraphEdge {
  id: string;
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
}
```

```tsx
// src/features/graph-editor/nodes/QueryNode.tsx
if (node.kind === "subgraph") {
  const childGraph = workspace.graphs.find((graph) => graph.id === node.data.graphId);
  const graphInterface = childGraph ? inferGraphInterface(childGraph) : { inputs: [], outputs: [] };

  return (
    <article className="query-node query-node--subgraph">
      {graphInterface.inputs.map((input) => (
        <Handle key={input.inputName} type="target" position={Position.Left} id={input.inputName} />
      ))}
      {graphInterface.outputs.map((output) => (
        <Handle key={output.outputName} type="source" position={Position.Right} id={output.outputName} />
      ))}
      <strong>{node.label}</strong>
      <p>{childGraph?.metadata.name ?? "Missing graph"}</p>
      <p>{`${graphInterface.inputs.length} inputs / ${graphInterface.outputs.length} outputs`}</p>
    </article>
  );
}
```

- [ ] **Step 4: Run the focused tests to verify the subgraph surface passes**

Run: `bun test src/features/document-storage/fileIO.test.ts src/features/graph-editor/NodeEditorModal.test.tsx src/features/graph-editor/GraphCanvas.test.tsx src/features/graph-editor/nodes/QueryNode.test.tsx`

Expected: PASS with `subgraph` JSON support, modal editing, dynamic handles, and visible child interface summaries.

- [ ] **Step 5: Commit the subgraph editor surface**

```bash
git add src/domain/workspace/interfaces.ts src/domain/document/types.ts src/features/document-storage/fileIO.ts src/features/document-storage/fileIO.test.ts src/features/graph-editor/NodePalette.tsx src/features/graph-editor/nodeEditors.tsx src/features/graph-editor/NodeEditorModal.tsx src/features/graph-editor/NodeEditorModal.test.tsx src/features/graph-editor/GraphCanvas.tsx src/features/graph-editor/GraphCanvas.test.tsx src/features/graph-editor/flowAdapter.ts src/features/graph-editor/nodes/QueryNode.tsx src/features/graph-editor/nodes/QueryNode.test.tsx src/index.css
git commit -m "feat: add subgraph node editor surface"
```

## Task 4: Validate And Compile Across Graph Boundaries

**Files:**
- Create: `src/domain/workspace/dependencies.ts`
- Modify: `src/domain/graph/semantic.ts`
- Modify: `src/domain/graph/expressionScope.ts`
- Modify: `src/domain/graph/expressionScope.test.ts`
- Modify: `src/domain/graph/inferSchemas.ts`
- Modify: `src/domain/graph/inferSchemas.test.ts`
- Modify: `src/domain/graph/validate.ts`
- Modify: `src/domain/graph/validate.test.ts`
- Modify: `src/domain/compile/compileOutput.ts`
- Modify: `src/domain/compile/compileOutput.test.ts`
- Test: `src/domain/graph/validate.test.ts`
- Test: `src/domain/graph/inferSchemas.test.ts`
- Test: `src/domain/graph/expressionScope.test.ts`
- Test: `src/domain/compile/compileOutput.test.ts`

- [ ] **Step 1: Write the failing cross-graph validation and compile tests**

```ts
// src/domain/graph/validate.test.ts
test("rejects a parent subgraph input when required child columns are missing", () => {
  const result = validateOutput(createWorkspaceWithIncompatibleSubgraphInput(), "graph-parent", "output-parent");

  expect(result.diagnostics).toContainEqual(
    expect.objectContaining({
      code: "subgraph.incompatible-input",
      ref: expect.objectContaining({ nodeId: "subgraph-orders" }),
    }),
  );
});

test("rejects graph dependency cycles", () => {
  const result = validateOutput(createWorkspaceWithCycle(), "graph-a", "output-a");

  expect(result.diagnostics).toContainEqual(
    expect.objectContaining({ code: "subgraph.cycle" }),
  );
});

// src/domain/compile/compileOutput.test.ts
test("compiles a parent output that references a child graph", () => {
  const result = compileOutput(createWorkspaceWithComposedParent(), "graph-parent", "output-parent");

  expect(result.sql).toContain("FROM sales.orders");
  expect(result.sql).toContain("gross_total");
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `bun test src/domain/graph/validate.test.ts src/domain/graph/inferSchemas.test.ts src/domain/graph/expressionScope.test.ts src/domain/compile/compileOutput.test.ts`

Expected: FAIL because validation and compile still operate on one graph document with no child graph resolution or cycle detection.

- [ ] **Step 3: Implement dependency traversal, compatibility checks, and workspace-aware compilation**

```ts
// src/domain/workspace/dependencies.ts
export function collectReferencedGraphIds(graph: GraphDocument): string[] {
  return graph.nodes
    .filter((node): node is Extract<GraphNode, { kind: "subgraph" }> => node.kind === "subgraph")
    .map((node) => node.data.graphId);
}

export function detectGraphCycle(workspace: GraphWorkspace, startGraphId: string): string[] | null {
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(graphId: string, stack: string[]): string[] | null {
    if (visiting.has(graphId)) return [...stack, graphId];
    if (visited.has(graphId)) return null;

    visiting.add(graphId);
    const graph = workspace.graphs.find((candidate) => candidate.id === graphId);
    for (const childId of graph ? collectReferencedGraphIds(graph) : []) {
      const cycle = visit(childId, [...stack, graphId]);
      if (cycle) return cycle;
    }
    visiting.delete(graphId);
    visited.add(graphId);
    return null;
  }

  return visit(startGraphId, []);
}
```

```ts
// src/domain/compile/compileOutput.ts
export function compileOutput(
  workspace: GraphWorkspace,
  graphId: string,
  outputId: string,
): CompileOutputResult {
  const semantic = validateOutput(workspace, graphId, outputId);
  const ir = lowerOutputToIr(semantic);
  const optimizedIr = ir ? optimizeOutput(ir) : null;

  return {
    semantic,
    ir,
    optimizedIr,
    sql: optimizedIr ? renderSql(optimizedIr) : "",
  };
}
```

```ts
// src/domain/graph/validate.ts
export function validateOutput(
  workspace: GraphWorkspace,
  graphId: string,
  outputId: string,
  graphInputSchemas: Record<string, ColumnMap> = {},
): SemanticOutput {
  const cycle = detectGraphCycle(workspace, graphId);
  if (cycle) {
    return {
      graphId,
      outputId,
      outputName: outputId,
      orderedNodes: [],
      nodesById: {},
      schemas: {},
      diagnostics: [
        {
          level: "error",
          code: "subgraph.cycle",
          message: `Graph dependency cycle detected: ${cycle.join(" -> ")}`,
          ref: { nodeId: outputId },
        },
      ],
    };
  }
  const graph = getGraphById(workspace, graphId);
  if (!graph) {
    return invalidOutputResult(graphId, outputId, "graph.invalid", `Graph ${graphId} does not exist.`);
  }

  return validateGraphOutput({
    workspace,
    graph,
    outputId,
    graphInputSchemas,
  });
}
```

- [ ] **Step 4: Run the focused tests to verify cross-graph semantics pass**

Run: `bun test src/domain/graph/validate.test.ts src/domain/graph/inferSchemas.test.ts src/domain/graph/expressionScope.test.ts src/domain/compile/compileOutput.test.ts`

Expected: PASS with cycle rejection, child interface compatibility checks, and composed parent SQL compilation.

- [ ] **Step 5: Commit the cross-graph semantic layer**

```bash
git add src/domain/workspace/dependencies.ts src/domain/graph/semantic.ts src/domain/graph/expressionScope.ts src/domain/graph/expressionScope.test.ts src/domain/graph/inferSchemas.ts src/domain/graph/inferSchemas.test.ts src/domain/graph/validate.ts src/domain/graph/validate.test.ts src/domain/compile/compileOutput.ts src/domain/compile/compileOutput.test.ts
git commit -m "feat: validate and compile subgraph references"
```

## Task 5: Add Live Parent Recompute, Workspace Import/Export, And Integration Guardrails

**Files:**
- Modify: `src/features/output-runtime/outputRuntime.ts`
- Modify: `src/features/output-runtime/outputRuntime.test.ts`
- Modify: `src/features/document-storage/DocumentToolbar.tsx`
- Modify: `src/features/integration/appFlow.test.tsx`
- Modify: `src/features/workspace/GraphCatalog.tsx`
- Modify: `src/features/workspace/GraphCatalog.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Test: `src/features/output-runtime/outputRuntime.test.ts`
- Test: `src/features/workspace/GraphCatalog.test.tsx`
- Test: `src/features/integration/appFlow.test.tsx`
- Test: `src/App.test.tsx`

- [ ] **Step 1: Write the failing live-update and delete-guard tests**

```tsx
// src/features/output-runtime/outputRuntime.test.ts
test("recomputes parent output SQL when a referenced child graph changes", async () => {
  const { rerender } = renderRuntimeProbe(createWorkspaceWithComposedParent());

  expect(await screen.findByText(/gross_total/i)).toBeTruthy();

  rerenderRuntimeProbe(
    rerender,
    createWorkspaceWithComposedParent({
      childSelectExpression: "total * 1.1",
    }),
  );

  await waitFor(() => {
    expect(screen.getByText(/1\.1/)).toBeTruthy();
  });
});

// src/features/workspace/GraphCatalog.test.tsx
test("cannot delete a graph that is still referenced by a subgraph node", async () => {
  const user = userEvent.setup();

  render(
    <DocumentProvider initialWorkspace={createWorkspaceWithComposedParent()}>
      <GraphCatalog />
    </DocumentProvider>,
  );

  await user.click(screen.getByRole("button", { name: "Delete Orders Package" }));

  expect(screen.getByRole("alert")).toHaveTextContent("Graph is still referenced.");
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `bun test src/features/output-runtime/outputRuntime.test.ts src/features/workspace/GraphCatalog.test.tsx src/features/integration/appFlow.test.tsx src/App.test.tsx`

Expected: FAIL because runtime compilation still only tracks the active graph document and the graph catalog does not check reverse references before delete.

- [ ] **Step 3: Implement workspace-aware output runtime and final guardrails**

```ts
// src/features/output-runtime/outputRuntime.ts
export function useOutputRuntime(
  workspace: GraphWorkspace,
  activeGraphId: string,
  deps?: Partial<OutputRuntimeDependencies>,
): OutputRuntimeSnapshot {
  const runtimeKey = useMemo(
    () => stableStringify({ workspace, activeGraphId }),
    [workspace, activeGraphId],
  );
  const compiledSnapshot = useMemo(
    () => compileGraphOutputs(workspace, activeGraphId),
    [runtimeKey],
  );
  const activeGraph =
    workspace.graphs.find((graph) => graph.id === activeGraphId) ?? null;

  useEffect(() => {
    if (!activeGraph) {
      setListenerStatusByOutputId({});
      return;
    }

    void applyOutputListeners({
      document: activeGraph,
      resultsByOutputId: compiledSnapshot.resultsByOutputId,
      previousStatusByOutputId: listenerStatusRef.current,
      deps,
    }).then((nextStatusByOutputId) => {
      listenerStatusRef.current = nextStatusByOutputId;
      setListenerStatusByOutputId(nextStatusByOutputId);
    });
  }, [activeGraph, compiledSnapshot.resultsByOutputId, deps]);

  return useMemo(
    () => ({
      ...compiledSnapshot,
      listenerStatusByOutputId,
    }),
    [compiledSnapshot, listenerStatusByOutputId],
  );
}
```

```ts
// src/features/workspace/GraphCatalog.tsx
const referencingGraphIds = state.workspace.graphs
  .filter((graph) =>
    graph.nodes.some(
      (node) => node.kind === "subgraph" && node.data.graphId === targetGraph.id,
    ),
  )
  .map((graph) => graph.id);

if (referencingGraphIds.length > 0) {
  setError("Graph is still referenced.");
  return;
}
dispatch({ type: "delete-graph", graphId: targetGraph.id });
```

```tsx
// src/features/integration/appFlow.test.tsx
test("updating a child graph updates the parent output modal SQL immediately", async () => {
  render(<App initialWorkspace={createWorkspaceWithComposedParent()} />);

  openGraph("Orders Package");
  updateNodeExpression("Project", 1, "total * 1.1");
  saveNode();
  openGraph("Main");
  openOutputNode("Parent Output");

  expect(await screen.findByText(/1\.1/)).toBeTruthy();
});
```

- [ ] **Step 4: Run full verification on the finished feature**

Run: `bun test && bun run build`

Expected: PASS with workspace persistence, graph catalog, subgraph rendering, cross-graph validation/compile, live parent updates, and import/export behavior all covered.

- [ ] **Step 5: Commit the runtime and integration polish**

```bash
git add src/features/output-runtime/outputRuntime.ts src/features/output-runtime/outputRuntime.test.ts src/features/document-storage/DocumentToolbar.tsx src/features/integration/appFlow.test.tsx src/features/workspace/GraphCatalog.tsx src/features/workspace/GraphCatalog.test.tsx src/App.tsx src/App.test.tsx
git commit -m "feat: wire live graph composition runtime"
```
