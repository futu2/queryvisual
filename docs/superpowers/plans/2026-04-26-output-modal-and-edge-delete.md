# Output Modal And Edge Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the global Outputs panel, move output inspection into output node modals, add built-in automatic output listeners, and let users remove edges directly from the canvas.

**Architecture:** First extend the document model so output nodes persist listener settings and the reducer can delete edges without tracking a global active output. Then add a shared output-runtime helper that compiles every output from the saved document, dedupes canvas diagnostics, and runs listeners from a centralized effect. Finally wire runtime inspection into output node modals and register a custom deletable edge type in React Flow.

**Tech Stack:** Bun 1.3, React 19, TypeScript, `@xyflow/react`, Testing Library, Bun test, existing app CSS in `src/index.css`

---

## File Structure

- Create: `src/domain/document/outputListeners.ts`
  Shared defaults and normalization helpers for persisted output listener config.
- Modify: `src/domain/document/types.ts`
  Extend output-node data with persisted listener config.
- Modify: `src/domain/document/sample.ts`
  Seed sample output nodes with normalized listener defaults.
- Modify: `src/features/graph-editor/NodePalette.tsx`
  Seed newly created output nodes with listener defaults.
- Modify: `src/features/document-storage/fileIO.ts`
  Accept legacy output payloads without listeners, normalize them, and validate newer listener shapes.
- Modify: `src/features/document-storage/fileIO.test.ts`
  Add legacy-parse and listener round-trip coverage.
- Modify: `src/app/state/documentReducer.ts`
  Remove `activeOutputId` and add a focused `delete-edge` action.
- Modify: `src/app/state/documentReducer.test.ts`
  Replace active-output assertions with delete-edge and reset-state coverage.
- Modify: `src/domain/compile/compileOutput.test.ts`
  Update inline output-node fixtures to include listener defaults.
- Modify: `src/domain/graph/expressionScope.test.ts`
  Update inline output-node fixtures to include listener defaults.
- Modify: `src/domain/graph/inferSchemas.test.ts`
  Update inline output-node fixtures to include listener defaults.
- Modify: `src/domain/graph/validate.test.ts`
  Update inline output-node fixtures to include listener defaults.
- Modify: `src/domain/ir/optimize.test.ts`
  Update inline output-node fixtures to include listener defaults.
- Modify: `src/features/graph-editor/nodes/QueryNode.test.tsx`
  Update inline output-node fixtures to include listener defaults.
- Create: `src/features/output-runtime/outputRuntime.ts`
  Compile all outputs, dedupe diagnostics, run built-in listeners, and expose a hook for app/runtime consumers.
- Create: `src/features/output-runtime/outputRuntime.test.ts`
  Cover multi-output compilation, diagnostic dedupe, listener firing, and listener failure isolation.
- Modify: `src/App.tsx`
  Remove the Outputs pane and derive shared output runtime for the canvas.
- Modify: `src/App.test.tsx`
  Assert the shell renders without the Outputs panel.
- Delete: `src/features/debug/DebugPanel.tsx`
  No longer needed after output inspection moves into modals.
- Delete: `src/features/debug/DebugPanel.test.tsx`
  Delete the obsolete panel test with the component.
- Modify: `src/features/graph-editor/nodeEditors.tsx`
  Add persisted output-listener controls to the output editor draft UI.
- Modify: `src/features/graph-editor/NodeEditorModal.tsx`
  Accept output runtime props and render output-only compiler/runtime tabs alongside the existing editor.
- Modify: `src/features/graph-editor/NodeEditorModal.test.tsx`
  Cover output runtime tabs, listener status, and listener-config save behavior.
- Modify: `src/features/graph-editor/GraphCanvas.tsx`
  Remove active-output special casing, pass output runtime into output modals, and register custom edge types.
- Modify: `src/features/graph-editor/GraphCanvas.test.tsx`
  Update modal-flow probes for removed active-output state and add edge-delete/runtime wiring coverage.
- Modify: `src/features/graph-editor/flowAdapter.ts`
  Emit a custom edge type plus delete metadata.
- Create: `src/features/graph-editor/edges/DeletableEdge.tsx`
  Render the edge path and compact delete affordance.
- Create: `src/features/graph-editor/edges/DeletableEdge.test.tsx`
  Cover hover/selected delete affordance behavior and callback wiring.
- Modify: `src/index.css`
  Style output runtime tabs/status sections and the compact edge delete affordance.

## Task 1: Extend Output Node Data And Remove Global Active Output State

**Files:**
- Create: `src/domain/document/outputListeners.ts`
- Modify: `src/domain/document/types.ts`
- Modify: `src/domain/document/sample.ts`
- Modify: `src/features/graph-editor/NodePalette.tsx`
- Modify: `src/features/document-storage/fileIO.ts`
- Modify: `src/features/document-storage/fileIO.test.ts`
- Modify: `src/app/state/documentReducer.ts`
- Modify: `src/app/state/documentReducer.test.ts`
- Modify: `src/domain/compile/compileOutput.test.ts`
- Modify: `src/domain/graph/expressionScope.test.ts`
- Modify: `src/domain/graph/inferSchemas.test.ts`
- Modify: `src/domain/graph/validate.test.ts`
- Modify: `src/domain/ir/optimize.test.ts`
- Modify: `src/features/graph-editor/nodes/QueryNode.test.tsx`
- Test: `src/features/document-storage/fileIO.test.ts`
- Test: `src/app/state/documentReducer.test.ts`

- [ ] **Step 1: Write the failing persistence and reducer tests**

```ts
// src/features/document-storage/fileIO.test.ts
test("parses legacy output nodes and injects default listeners", () => {
  const parsed = parseDocumentJson(
    JSON.stringify({
      version: 1,
      metadata: { name: "legacy" },
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        {
          id: "output-legacy",
          kind: "output",
          label: "Output",
          position: { x: 0, y: 0 },
          data: { outputName: "legacy_out" },
        },
      ],
      edges: [],
    }),
  );

  expect(parsed.nodes[0]).toMatchObject({
    kind: "output",
    data: {
      outputName: "legacy_out",
      listeners: {
        copyToClipboard: false,
        logToConsole: false,
        saveToLocalStorage: {
          enabled: false,
          key: "queryvisual.output.legacy_out",
        },
      },
    },
  });
});

test("round-trips explicit output listener configuration", () => {
  const parsed = parseDocumentJson(
    JSON.stringify({
      version: 1,
      metadata: { name: "listeners" },
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        {
          id: "output-listeners",
          kind: "output",
          label: "Output",
          position: { x: 0, y: 0 },
          data: {
            outputName: "orders_report",
            listeners: {
              copyToClipboard: true,
              logToConsole: true,
              saveToLocalStorage: {
                enabled: true,
                key: "custom.orders.sql",
              },
            },
          },
        },
      ],
      edges: [],
    }),
  );

  expect(serializeDocumentJson(parsed)).toContain('"copyToClipboard": true');
  expect(serializeDocumentJson(parsed)).toContain('"key": "custom.orders.sql"');
});

// src/app/state/documentReducer.test.ts
test("replaces the document and resets only selection plus open editor state", () => {
  const initial = {
    ...createInitialEditorState(createSampleDocument()),
    selectedNodeId: "select-orders",
    editorNodeId: "select-orders",
  };

  const next = documentReducer(initial, {
    type: "replace-document",
    document: {
      version: 1,
      metadata: { name: "replacement" },
      viewport: { x: 10, y: 20, zoom: 0.8 },
      nodes: [],
      edges: [],
    },
  });

  expect(next.selectedNodeId).toBeNull();
  expect(next.editorNodeId).toBeNull();
  expect("activeOutputId" in next).toBe(false);
});

test("deletes exactly one edge by id", () => {
  const initial = createInitialEditorState(createSampleDocument());

  const next = documentReducer(initial, {
    type: "delete-edge",
    edgeId: "edge-select-output",
  });

  expect(next.document.edges.find((edge) => edge.id === "edge-select-output")).toBe(
    undefined,
  );
  expect(next.document.edges.find((edge) => edge.id === "edge-from-select")).toBeTruthy();
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `bun test src/features/document-storage/fileIO.test.ts src/app/state/documentReducer.test.ts`
Expected: FAIL because parsed output nodes do not gain `listeners`, `createInitialEditorState()` still tracks `activeOutputId`, and `delete-edge` does not exist yet.

- [ ] **Step 3: Implement listener defaults, legacy normalization, and reducer cleanup**

```ts
// src/domain/document/outputListeners.ts
import type { OutputListenerConfig } from "./types";

export function createDefaultOutputListenerConfig(
  outputName: string,
): OutputListenerConfig {
  return {
    copyToClipboard: false,
    logToConsole: false,
    saveToLocalStorage: {
      enabled: false,
      key: `queryvisual.output.${outputName}`,
    },
  };
}

export function normalizeOutputListenerConfig(
  value: unknown,
  outputName: string,
): OutputListenerConfig {
  const defaults = createDefaultOutputListenerConfig(outputName);

  if (!value || typeof value !== "object") {
    return defaults;
  }

  const candidate = value as Record<string, unknown>;
  const storage =
    candidate.saveToLocalStorage &&
    typeof candidate.saveToLocalStorage === "object"
      ? (candidate.saveToLocalStorage as Record<string, unknown>)
      : null;

  return {
    copyToClipboard:
      typeof candidate.copyToClipboard === "boolean"
        ? candidate.copyToClipboard
        : defaults.copyToClipboard,
    logToConsole:
      typeof candidate.logToConsole === "boolean"
        ? candidate.logToConsole
        : defaults.logToConsole,
    saveToLocalStorage: {
      enabled:
        typeof storage?.enabled === "boolean"
          ? storage.enabled
          : defaults.saveToLocalStorage.enabled,
      key:
        typeof storage?.key === "string" && storage.key.trim() !== ""
          ? storage.key
          : defaults.saveToLocalStorage.key,
    },
  };
}
```

```ts
// src/domain/document/types.ts
export interface OutputListenerConfig {
  copyToClipboard: boolean;
  logToConsole: boolean;
  saveToLocalStorage: {
    enabled: boolean;
    key: string;
  };
}

export type GraphNode =
  | GraphNodeBase<"graphInput", { columns: ColumnMap }>
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
export interface EditorState {
  document: GraphDocument;
  selectedNodeId: string | null;
  editorNodeId: string | null;
}

export type EditorAction =
  | { type: "replace-document"; document: GraphDocument }
  | { type: "add-node"; node: GraphNode }
  | { type: "replace-node"; node: GraphNode }
  | { type: "upsert-edge"; edge: GraphEdge }
  | { type: "delete-edge"; edgeId: string }
  | { type: "set-node-position"; nodeId: string; position: GraphNode["position"] }
  | { type: "set-viewport"; viewport: GraphDocument["viewport"] }
  | { type: "open-node-editor"; nodeId: string | null }
  | { type: "select-node"; nodeId: string | null };

export function createInitialEditorState(
  document: GraphDocument = createSampleDocument(),
): EditorState {
  return {
    document,
    selectedNodeId: null,
    editorNodeId: null,
  };
}

case "delete-edge":
  return {
    ...state,
    document: {
      ...state.document,
      edges: state.document.edges.filter((edge) => edge.id !== action.edgeId),
    },
  };
```

```ts
// src/features/document-storage/fileIO.ts
import { normalizeOutputListenerConfig } from "../../domain/document/outputListeners";
import type { GraphDocument, GraphNode } from "../../domain/document/types";

function isOutputListenerConfig(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.copyToClipboard === "boolean" &&
    typeof value.logToConsole === "boolean" &&
    isRecord(value.saveToLocalStorage) &&
    typeof value.saveToLocalStorage.enabled === "boolean" &&
    typeof value.saveToLocalStorage.key === "string"
  );
}

function isOutputNodeData(value: Record<string, unknown>) {
  return (
    typeof value.outputName === "string" &&
    (value.listeners === undefined || isOutputListenerConfig(value.listeners))
  );
}

function isNodeData(kind: typeof nodeKinds[number], value: unknown) {
  if (!isRecord(value)) {
    return false;
  }

  switch (kind) {
    case "graphInput":
      return isColumnMap(value.columns);
    case "fromTable":
      return isTableRef(value.tableRef) && isColumnMap(value.columns);
    case "join":
      return (
        (value.joinType === "inner" ||
          value.joinType === "left" ||
          value.joinType === "right" ||
          value.joinType === "full") &&
        typeof value.predicate === "string"
      );
    case "where":
      return typeof value.predicate === "string";
    case "select":
      return Array.isArray(value.mappings) && value.mappings.every(isNamedExpression);
    case "aggregation":
      return (
        Array.isArray(value.groupBy) &&
        value.groupBy.every(isNamedExpression) &&
        Array.isArray(value.aggregates) &&
        value.aggregates.every(isNamedExpression)
      );
    case "sort":
      return Array.isArray(value.items) && value.items.every(isSortItem);
    case "limit":
      return (
        typeof value.count === "number" &&
        (value.offset === null || typeof value.offset === "number")
      );
    case "output":
      return isOutputNodeData(value);
  }
}

function normalizeGraphNode(node: GraphNode): GraphNode {
  if (node.kind !== "output") {
    return node;
  }

  return {
    ...node,
    data: {
      outputName: node.data.outputName,
      listeners: normalizeOutputListenerConfig(
        node.data.listeners,
        node.data.outputName,
      ),
    },
  };
}

return {
  ...parsed,
  nodes: parsed.nodes.map((node) => normalizeGraphNode(node as GraphNode)),
} as GraphDocument;
```

```ts
// src/domain/document/sample.ts
import { createDefaultOutputListenerConfig } from "./outputListeners";

data: {
  outputName: "orders_report",
  listeners: createDefaultOutputListenerConfig("orders_report"),
},
```

```ts
// src/features/graph-editor/NodePalette.tsx
import { createDefaultOutputListenerConfig } from "../../domain/document/outputListeners";

{
  id: `output-${index + 1}`,
  kind: "output",
  label: `Output ${index + 1}`,
  position,
  data: {
    outputName: `output_${index + 1}`,
    listeners: createDefaultOutputListenerConfig(`output_${index + 1}`),
  },
}
```

```ts
// apply the same output listener default shape to inline output fixtures in:
// src/domain/compile/compileOutput.test.ts
// src/domain/graph/expressionScope.test.ts
// src/domain/graph/inferSchemas.test.ts
// src/domain/graph/validate.test.ts
// src/domain/ir/optimize.test.ts
// src/features/graph-editor/nodes/QueryNode.test.tsx
data: {
  outputName: "out",
  listeners: createDefaultOutputListenerConfig("out"),
},
```

- [ ] **Step 4: Run the focused tests to verify they pass**

Run: `bun test src/features/document-storage/fileIO.test.ts src/app/state/documentReducer.test.ts`
Expected: PASS

- [ ] **Step 5: Commit the document-model and reducer groundwork**

```bash
git add src/domain/document/outputListeners.ts src/domain/document/types.ts src/domain/document/sample.ts src/features/graph-editor/NodePalette.tsx src/features/document-storage/fileIO.ts src/features/document-storage/fileIO.test.ts src/app/state/documentReducer.ts src/app/state/documentReducer.test.ts src/domain/compile/compileOutput.test.ts src/domain/graph/expressionScope.test.ts src/domain/graph/inferSchemas.test.ts src/domain/graph/validate.test.ts src/domain/ir/optimize.test.ts src/features/graph-editor/nodes/QueryNode.test.tsx
git commit -m "feat: add output listener config groundwork"
```

## Task 2: Build Shared Output Runtime And Remove The Outputs Panel

**Files:**
- Create: `src/features/output-runtime/outputRuntime.ts`
- Create: `src/features/output-runtime/outputRuntime.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Delete: `src/features/debug/DebugPanel.tsx`
- Delete: `src/features/debug/DebugPanel.test.tsx`
- Test: `src/features/output-runtime/outputRuntime.test.ts`
- Test: `src/App.test.tsx`

- [ ] **Step 1: Write the failing output-runtime and app-shell tests**

```ts
// src/features/output-runtime/outputRuntime.test.ts
import { afterEach, expect, mock, test } from "bun:test";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { createSampleDocument } from "../../domain/document/sample";
import type { GraphDocument } from "../../domain/document/types";
import { createDefaultOutputListenerConfig } from "../../domain/document/outputListeners";
import {
  applyOutputListeners,
  compileDocumentOutputs,
  useOutputRuntime,
} from "./outputRuntime";

afterEach(cleanup);

test("compiles all outputs and dedupes shared diagnostics", () => {
  const document: GraphDocument = {
    version: 1,
    metadata: { name: "multi-output" },
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [
      {
        id: "from-orders",
        kind: "fromTable",
        label: "Orders",
        position: { x: 0, y: 0 },
        data: {
          tableRef: { tableName: "orders" },
          columns: { total: "float" },
        },
      },
      {
        id: "select-bad",
        kind: "select",
        label: "Bad Select",
        position: { x: 200, y: 0 },
        data: {
          mappings: [{ name: "gross_total", expression: "missing_col" }],
        },
      },
      {
        id: "output-a",
        kind: "output",
        label: "Out A",
        position: { x: 400, y: -40 },
        data: {
          outputName: "out_a",
          listeners: createDefaultOutputListenerConfig("out_a"),
        },
      },
      {
        id: "output-b",
        kind: "output",
        label: "Out B",
        position: { x: 400, y: 40 },
        data: {
          outputName: "out_b",
          listeners: createDefaultOutputListenerConfig("out_b"),
        },
      },
    ],
    edges: [
      {
        id: "edge-from-select",
        source: "from-orders",
        sourceHandle: "out",
        target: "select-bad",
        targetHandle: "in",
      },
      {
        id: "edge-select-output-a",
        source: "select-bad",
        sourceHandle: "out",
        target: "output-a",
        targetHandle: "in",
      },
      {
        id: "edge-select-output-b",
        source: "select-bad",
        sourceHandle: "out",
        target: "output-b",
        targetHandle: "in",
      },
    ],
  };

  const runtime = compileDocumentOutputs(document);

  expect(Object.keys(runtime.resultsByOutputId)).toEqual(["output-a", "output-b"]);
  expect(runtime.diagnostics).toHaveLength(1);
  expect(runtime.diagnostics[0]?.ref?.nodeId).toBe("select-bad");
});

test("fires enabled listeners for successful SQL output", async () => {
  const clipboardWrite = mock(async (_text: string) => {});
  const log = mock((_label: string, _sql: string) => {});
  const storageSet = mock((_key: string, _value: string) => {});

  function Harness() {
    const [document] = useState<GraphDocument>({
      version: 1,
      metadata: { name: "runtime" },
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        {
          id: "from-orders",
          kind: "fromTable",
          label: "Orders",
          position: { x: 0, y: 0 },
          data: {
            tableRef: { tableName: "orders" },
            columns: { total: "float" },
          },
        },
        {
          id: "output-orders",
          kind: "output",
          label: "Output",
          position: { x: 200, y: 0 },
          data: {
            outputName: "orders_sql",
            listeners: {
              copyToClipboard: true,
              logToConsole: true,
              saveToLocalStorage: {
                enabled: true,
                key: "queryvisual.output.orders_sql",
              },
            },
          },
        },
      ],
      edges: [
        {
          id: "edge-from-output",
          source: "from-orders",
          sourceHandle: "out",
          target: "output-orders",
          targetHandle: "in",
        },
      ],
    });

    const runtime = useOutputRuntime(document, {
      writeClipboard: clipboardWrite,
      log,
      setLocalStorage: storageSet,
      now: () => 1234,
    });

    return (
      <span data-testid="listener-status">
        {runtime.listenerStatusByOutputId["output-orders"]?.lastRunAt ?? "none"}
      </span>
    );
  }

  render(<Harness />);

  await waitFor(() => {
    expect(screen.getByTestId("listener-status").textContent).toBe("1234");
  });

  expect(clipboardWrite).toHaveBeenCalledTimes(1);
  expect(log).toHaveBeenCalledTimes(1);
  expect(storageSet).toHaveBeenCalledTimes(1);
});

test("skips unchanged SQL and empty SQL listener runs", async () => {
  const document = createSampleDocument();
  const snapshot = compileDocumentOutputs(document);
  const clipboardWrite = mock(async (_text: string) => {});
  const log = mock((_label: string, _sql: string) => {});
  const storageSet = mock((_key: string, _value: string) => {});

  const previousStatus = {
    "output-orders": {
      lastSuccessfulSql: snapshot.resultsByOutputId["output-orders"]?.sql ?? null,
      lastRunAt: 1111,
      lastErrorMessage: null,
    },
  };

  const unchanged = await applyOutputListeners(document, snapshot, previousStatus, {
    writeClipboard: clipboardWrite,
    log,
    setLocalStorage: storageSet,
    now: () => 2222,
  });

  expect(unchanged["output-orders"]?.lastRunAt).toBe(1111);
  expect(clipboardWrite).not.toHaveBeenCalled();

  const invalidDocument: GraphDocument = {
    ...document,
    nodes: document.nodes.map((node) =>
      node.id === "select-orders"
        ? {
            ...node,
            data: {
              mappings: [{ name: "gross_total", expression: "missing_column" }],
            },
          }
        : node,
    ),
  };

  const invalidSnapshot = compileDocumentOutputs(invalidDocument);

  await applyOutputListeners(invalidDocument, invalidSnapshot, {}, {
    writeClipboard: clipboardWrite,
    log,
    setLocalStorage: storageSet,
    now: () => 3333,
  });

  expect(clipboardWrite).not.toHaveBeenCalled();
  expect(log).not.toHaveBeenCalled();
  expect(storageSet).not.toHaveBeenCalled();
});

// src/App.test.tsx
test("renders the QueryVisual shell without the Outputs panel", () => {
  render(<App />);

  expect(screen.getByText("QueryVisual")).toBeTruthy();
  expect(screen.getByText("Canvas")).toBeTruthy();
  expect(screen.queryByText("Outputs")).toBeNull();
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `bun test src/features/output-runtime/outputRuntime.test.ts src/App.test.tsx`
Expected: FAIL because there is no output-runtime helper yet and `App` still renders the Outputs pane.

- [ ] **Step 3: Implement the shared output runtime and remove the obsolete panel**

```ts
// src/features/output-runtime/outputRuntime.ts
import { useEffect, useMemo, useRef, useState } from "react";
import { compileOutput, type CompileOutputResult } from "../../domain/compile/compileOutput";
import type { Diagnostic } from "../../domain/diagnostics/types";
import type { GraphDocument } from "../../domain/document/types";

export type OutputListenerRuntimeStatus = {
  lastSuccessfulSql: string | null;
  lastRunAt: number | null;
  lastErrorMessage: string | null;
};

export type OutputRuntimeDependencies = {
  writeClipboard: (sql: string) => Promise<void>;
  log: (label: string, sql: string) => void;
  setLocalStorage: (key: string, sql: string) => void;
  now: () => number;
};

export type CompiledOutputSnapshot = {
  resultsByOutputId: Record<string, CompileOutputResult>;
  diagnostics: Diagnostic[];
};

const defaultDependencies: OutputRuntimeDependencies = {
  writeClipboard: (sql) => navigator.clipboard.writeText(sql),
  log: (label, sql) => console.log(label, sql),
  setLocalStorage: (key, sql) => localStorage.setItem(key, sql),
  now: () => Date.now(),
};

function diagnosticKey(diagnostic: Diagnostic) {
  return JSON.stringify([
    diagnostic.level,
    diagnostic.code,
    diagnostic.message,
    diagnostic.ref ?? null,
  ]);
}

export function compileDocumentOutputs(
  document: GraphDocument,
): CompiledOutputSnapshot {
  const resultsByOutputId: Record<string, CompileOutputResult> = {};
  const diagnosticsByKey = new Map<string, Diagnostic>();

  for (const node of document.nodes) {
    if (node.kind !== "output") continue;

    const result = compileOutput(document, node.id);
    resultsByOutputId[node.id] = result;

    for (const diagnostic of result.semantic.diagnostics) {
      diagnosticsByKey.set(diagnosticKey(diagnostic), diagnostic);
    }
  }

  return {
    resultsByOutputId,
    diagnostics: [...diagnosticsByKey.values()],
  };
}

export async function applyOutputListeners(
  document: GraphDocument,
  snapshot: CompiledOutputSnapshot,
  previousStatus: Record<string, OutputListenerRuntimeStatus>,
  dependencies: OutputRuntimeDependencies = defaultDependencies,
): Promise<Record<string, OutputListenerRuntimeStatus>> {
  const nextStatus = { ...previousStatus };

  for (const node of document.nodes) {
    if (node.kind !== "output") continue;

    const sql = snapshot.resultsByOutputId[node.id]?.sql ?? "";
    const previous = nextStatus[node.id] ?? {
      lastSuccessfulSql: null,
      lastRunAt: null,
      lastErrorMessage: null,
    };

    if (sql === "" || sql === previous.lastSuccessfulSql) {
      nextStatus[node.id] = previous;
      continue;
    }

    const errors: string[] = [];

    if (node.data.listeners.copyToClipboard) {
      try {
        await dependencies.writeClipboard(sql);
      } catch (error) {
        errors.push(`clipboard: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (node.data.listeners.logToConsole) {
      try {
        dependencies.log(`[output:${node.data.outputName}]`, sql);
      } catch (error) {
        errors.push(`console: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (node.data.listeners.saveToLocalStorage.enabled) {
      try {
        dependencies.setLocalStorage(node.data.listeners.saveToLocalStorage.key, sql);
      } catch (error) {
        errors.push(`storage: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    nextStatus[node.id] = {
      lastSuccessfulSql: sql,
      lastRunAt: dependencies.now(),
      lastErrorMessage: errors.length > 0 ? errors.join("; ") : null,
    };
  }

  return nextStatus;
}

export function useOutputRuntime(
  document: GraphDocument,
  dependencies: OutputRuntimeDependencies = defaultDependencies,
) {
  const snapshot = useMemo(
    () => compileDocumentOutputs(document),
    [document.nodes, document.edges],
  );
  const [listenerStatusByOutputId, setListenerStatusByOutputId] = useState<
    Record<string, OutputListenerRuntimeStatus>
  >({});
  const latestStatusRef = useRef(listenerStatusByOutputId);

  useEffect(() => {
    latestStatusRef.current = listenerStatusByOutputId;
  }, [listenerStatusByOutputId]);

  useEffect(() => {
    let cancelled = false;

    void applyOutputListeners(
      document,
      snapshot,
      latestStatusRef.current,
      dependencies,
    ).then((nextStatus) => {
      if (!cancelled) {
        latestStatusRef.current = nextStatus;
        setListenerStatusByOutputId(nextStatus);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [dependencies, document, snapshot]);

  return {
    ...snapshot,
    listenerStatusByOutputId,
  };
}
```

```tsx
// src/App.tsx
import { useMemo } from "react";
import { DocumentProvider, useDocumentContext } from "./app/state/DocumentContext";
import { DocumentToolbar } from "./features/document-storage/DocumentToolbar";
import { GraphCanvas } from "./features/graph-editor/GraphCanvas";
import { NodePalette } from "./features/graph-editor/NodePalette";
import { useOutputRuntime } from "./features/output-runtime/outputRuntime";

function AppLayout() {
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
        <GraphCanvas
          diagnostics={outputRuntime.diagnostics}
          outputResultsById={outputRuntime.resultsByOutputId}
          listenerStatusByOutputId={outputRuntime.listenerStatusByOutputId}
        />
      </main>
    </div>
  );
}
```

```bash
# remove the obsolete output panel files
git rm src/features/debug/DebugPanel.tsx src/features/debug/DebugPanel.test.tsx
```

- [ ] **Step 4: Run the focused tests to verify they pass**

Run: `bun test src/features/output-runtime/outputRuntime.test.ts src/App.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit the shared runtime and shell cleanup**

```bash
git add src/features/output-runtime/outputRuntime.ts src/features/output-runtime/outputRuntime.test.ts src/App.tsx src/App.test.tsx
git commit -m "feat: add shared output runtime"
```

## Task 3: Move Output Inspection Into The Output Modal And Save Listener Settings

**Files:**
- Modify: `src/features/graph-editor/nodeEditors.tsx`
- Modify: `src/features/graph-editor/NodeEditorModal.tsx`
- Modify: `src/features/graph-editor/NodeEditorModal.test.tsx`
- Modify: `src/features/graph-editor/GraphCanvas.tsx`
- Modify: `src/features/graph-editor/GraphCanvas.test.tsx`
- Modify: `src/index.css`
- Test: `src/features/graph-editor/NodeEditorModal.test.tsx`
- Test: `src/features/graph-editor/GraphCanvas.test.tsx`

- [ ] **Step 1: Write the failing modal and canvas integration tests**

```tsx
// src/features/graph-editor/NodeEditorModal.test.tsx
import { compileOutput } from "../../domain/compile/compileOutput";
import { createSampleDocument } from "../../domain/document/sample";
import type { OutputListenerRuntimeStatus } from "../output-runtime/outputRuntime";

test("output modal saves listener settings and renders runtime tabs", async () => {
  const user = userEvent.setup();
  const onSave = mock();
  const document = createSampleDocument();
  const node = document.nodes.find((candidate) => candidate.id === "output-orders") as GraphNode;
  const compileResult = compileOutput(document, "output-orders");

  const listenerStatus: OutputListenerRuntimeStatus = {
    lastSuccessfulSql: compileResult.sql,
    lastRunAt: 1234,
    lastErrorMessage: null,
  };

  renderModal({
    node,
    document,
    onSave,
    outputResult: compileResult,
    outputListenerStatus: listenerStatus,
  });

  expect(screen.getByRole("tab", { name: "SQL" })).toBeTruthy();
  expect(screen.getByText(/gross_total/)).toBeTruthy();
  expect(screen.getByText(/Last listener run: 1234/)).toBeTruthy();

  await user.click(screen.getByLabelText("Copy SQL to clipboard"));
  await user.click(screen.getByLabelText("Save SQL to localStorage"));
  await user.clear(screen.getByLabelText("localStorage key"));
  await user.type(screen.getByLabelText("localStorage key"), "custom.orders.sql");
  await user.click(screen.getByRole("button", { name: "Save" }));

  expect(onSave.mock.calls[0][0].data.listeners).toEqual({
    copyToClipboard: true,
    logToConsole: false,
    saveToLocalStorage: {
      enabled: true,
      key: "custom.orders.sql",
    },
  });
});

// src/features/graph-editor/GraphCanvas.test.tsx
import { compileOutput } from "../../domain/compile/compileOutput";

test("opening an output node shows saved SQL in the modal without global output state", async () => {
  const document = createSampleDocument();

  render(
    <DocumentProvider initialDocument={document}>
      <GraphCanvas
        diagnostics={[]}
        outputResultsById={{
          "output-orders": compileOutput(document, "output-orders"),
        }}
        listenerStatusByOutputId={{
          "output-orders": {
            lastSuccessfulSql: compileOutput(document, "output-orders").sql,
            lastRunAt: 1234,
            lastErrorMessage: null,
          },
        }}
      />
    </DocumentProvider>,
  );

  await invokeNodeClick("output-orders");

  expect(screen.getByRole("tab", { name: "SQL" })).toBeTruthy();
  expect(screen.getByText(/gross_total/)).toBeTruthy();
  expect(screen.queryByTestId("active-output-id")).toBeNull();
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `bun test src/features/graph-editor/NodeEditorModal.test.tsx src/features/graph-editor/GraphCanvas.test.tsx`
Expected: FAIL because output nodes still only edit `outputName`, the modal has no runtime tabs/status props, and `GraphCanvas` still assumes the older prop shape.

- [ ] **Step 3: Implement output listener controls and output-only runtime inspection**

```tsx
// src/features/graph-editor/nodeEditors.tsx
case "output":
  return (
    <>
      <label>
        Output name
        <input
          value={draft.data.outputName}
          onChange={(event) =>
            setDraft({
              ...draft,
              data: {
                ...draft.data,
                outputName: event.target.value,
              },
            })
          }
        />
      </label>

      <div className="editor-section">
        <h3>Automatic listeners</h3>
        <label className="checkbox-row">
          <input
            type="checkbox"
            aria-label="Copy SQL to clipboard"
            checked={draft.data.listeners.copyToClipboard}
            onChange={(event) =>
              setDraft({
                ...draft,
                data: {
                  ...draft.data,
                  listeners: {
                    ...draft.data.listeners,
                    copyToClipboard: event.target.checked,
                  },
                },
              })
            }
          />
          Copy SQL to clipboard
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            aria-label="Log SQL to console"
            checked={draft.data.listeners.logToConsole}
            onChange={(event) =>
              setDraft({
                ...draft,
                data: {
                  ...draft.data,
                  listeners: {
                    ...draft.data.listeners,
                    logToConsole: event.target.checked,
                  },
                },
              })
            }
          />
          Log SQL to console
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            aria-label="Save SQL to localStorage"
            checked={draft.data.listeners.saveToLocalStorage.enabled}
            onChange={(event) =>
              setDraft({
                ...draft,
                data: {
                  ...draft.data,
                  listeners: {
                    ...draft.data.listeners,
                    saveToLocalStorage: {
                      ...draft.data.listeners.saveToLocalStorage,
                      enabled: event.target.checked,
                    },
                  },
                },
              })
            }
          />
          Save SQL to localStorage
        </label>
        <label>
          localStorage key
          <input
            aria-label="localStorage key"
            value={draft.data.listeners.saveToLocalStorage.key}
            onChange={(event) =>
              setDraft({
                ...draft,
                data: {
                  ...draft.data,
                  listeners: {
                    ...draft.data.listeners,
                    saveToLocalStorage: {
                      ...draft.data.listeners.saveToLocalStorage,
                      key: event.target.value,
                    },
                  },
                },
              })
            }
          />
        </label>
      </div>
    </>
  );
```

```tsx
// src/features/graph-editor/NodeEditorModal.tsx
import type { CompileOutputResult } from "../../domain/compile/compileOutput";
import type { OutputListenerRuntimeStatus } from "../output-runtime/outputRuntime";

type NodeEditorModalProps = {
  node: GraphNode;
  onClose: () => void;
  onSave: (node: GraphNode) => void;
  outputResult?: CompileOutputResult | null;
  outputListenerStatus?: OutputListenerRuntimeStatus | null;
};

const outputTabs = ["Diagnostics", "Semantic", "IR", "Optimized IR", "SQL"] as const;

const [activeOutputTab, setActiveOutputTab] =
  useState<(typeof outputTabs)[number]>("SQL");

function renderOutputContent() {
  if (node.kind !== "output") {
    return null;
  }

  const content = (() => {
    if (!outputResult) {
      return "No compiled output available.";
    }

    switch (activeOutputTab) {
      case "Diagnostics":
        return JSON.stringify(outputResult.semantic.diagnostics, null, 2);
      case "Semantic":
        return JSON.stringify(outputResult.semantic, null, 2);
      case "IR":
        return JSON.stringify(outputResult.ir, null, 2);
      case "Optimized IR":
        return JSON.stringify(outputResult.optimizedIr, null, 2);
      case "SQL":
        return outputResult.sql || "No SQL emitted for this output.";
    }
  })();

  return (
    <section className="output-runtime-panel">
      <div className="output-runtime-status">
        <strong>Automatic listener status</strong>
        <p>
          Last listener run: {outputListenerStatus?.lastRunAt ?? "never"}
        </p>
        {outputListenerStatus?.lastErrorMessage ? (
          <p>{outputListenerStatus.lastErrorMessage}</p>
        ) : null}
      </div>
      <div className="tab-row" role="tablist" aria-label="Output runtime artifacts">
        {outputTabs.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeOutputTab === tab}
            onClick={() => setActiveOutputTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>
      <pre className="debug-output">{content}</pre>
    </section>
  );
}

<section className="modal-body">
  {renderNodeEditor(draft, setDraft, graphDocument, schemaOverrides)}
  {renderOutputContent()}
</section>
```

```tsx
// src/features/graph-editor/GraphCanvas.tsx
import type { CompileOutputResult } from "../../domain/compile/compileOutput";
import type { OutputListenerRuntimeStatus } from "../output-runtime/outputRuntime";
import {
  toFlowEdges,
  toFlowNodes,
  type FlowNodeRuntime,
} from "./flowAdapter";

export function GraphCanvas({
  diagnostics,
  outputResultsById,
  listenerStatusByOutputId,
}: {
  diagnostics: Diagnostic[];
  outputResultsById: Record<string, CompileOutputResult>;
  listenerStatusByOutputId: Record<string, OutputListenerRuntimeStatus>;
}) {
  const { state, dispatch } = useDocumentContext();
  const [nodeRuntimeById, setNodeRuntimeById] = useState<
    Record<string, FlowNodeRuntime>
  >({});
  const nodeEditorModalRef = useRef<NodeEditorModalHandle | null>(null);
  const editedNode =
    state.document.nodes.find((node) => node.id === state.editorNodeId) ?? null;

  const nodes = useMemo(
    () =>
      toFlowNodes(
        state.document,
        diagnostics,
        state.selectedNodeId,
        nodeRuntimeById,
      ),
    [diagnostics, nodeRuntimeById, state.document, state.selectedNodeId],
  );

  const edges = useMemo(() => toFlowEdges(state.document), [state.document]);

  const onNodeClick: NodeMouseHandler = (_, node) => {
    if (editedNode?.id === node.id) {
      return;
    }

    runEditorTransition(() => {
      dispatch({ type: "select-node", nodeId: node.id });
      dispatch({ type: "open-node-editor", nodeId: node.id });
    });
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
        onPaneClick={() =>
          runEditorTransition(() => {
            dispatch({ type: "select-node", nodeId: null });
            dispatch({ type: "open-node-editor", nodeId: null });
          })
        }
        onNodesChange={onNodesChange}
        onViewportChange={(viewport) => dispatch({ type: "set-viewport", viewport })}
      >
        <Background />
        <MiniMap />
        <Controls />
      </ReactFlow>
      {editedNode ? (
        <NodeEditorModal
          ref={nodeEditorModalRef}
          node={editedNode}
          outputResult={
            editedNode.kind === "output"
              ? outputResultsById[editedNode.id] ?? null
              : null
          }
          outputListenerStatus={
            editedNode.kind === "output"
              ? listenerStatusByOutputId[editedNode.id] ?? null
              : null
          }
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

- [ ] **Step 4: Run the focused tests to verify they pass**

Run: `bun test src/features/graph-editor/NodeEditorModal.test.tsx src/features/graph-editor/GraphCanvas.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit the modal output runtime move**

```bash
git add src/features/graph-editor/nodeEditors.tsx src/features/graph-editor/NodeEditorModal.tsx src/features/graph-editor/NodeEditorModal.test.tsx src/features/graph-editor/GraphCanvas.tsx src/features/graph-editor/GraphCanvas.test.tsx src/index.css
git commit -m "feat: move output inspection into modal"
```

## Task 4: Add A Custom Edge Delete Affordance And Run Full Verification

**Files:**
- Create: `src/features/graph-editor/edges/DeletableEdge.tsx`
- Create: `src/features/graph-editor/edges/DeletableEdge.test.tsx`
- Modify: `src/features/graph-editor/flowAdapter.ts`
- Modify: `src/features/graph-editor/GraphCanvas.tsx`
- Modify: `src/features/graph-editor/GraphCanvas.test.tsx`
- Modify: `src/index.css`
- Test: `src/features/graph-editor/edges/DeletableEdge.test.tsx`
- Test: `src/features/graph-editor/GraphCanvas.test.tsx`

- [ ] **Step 1: Write the failing edge-delete tests**

```tsx
// src/features/graph-editor/edges/DeletableEdge.test.tsx
import { afterEach, describe, expect, mock, test } from "bun:test";
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/react";

mock.module("@xyflow/react", () => ({
  BaseEdge: () => <div data-testid="base-edge" />,
  EdgeLabelRenderer: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  getBezierPath: () => ["M0,0 L100,0", 50, 0],
}));

const { DeletableEdge } = await import("./DeletableEdge");

afterEach(cleanup);

test("shows a delete button when hovered and calls onDelete with the edge id", async () => {
  const user = userEvent.setup();
  const onDelete = mock();

  render(
    <DeletableEdge
      id="edge-select-output"
      sourceX={0}
      sourceY={0}
      targetX={100}
      targetY={0}
      sourcePosition="right"
      targetPosition="left"
      data={{ onDelete }}
      selected={false}
    />,
  );

  await user.hover(screen.getByTestId("deletable-edge-hitbox"));
  await user.click(screen.getByRole("button", { name: "Delete edge" }));

  expect(onDelete).toHaveBeenCalledWith("edge-select-output");
});

test("keeps the delete button visible while the edge is selected", () => {
  render(
    <DeletableEdge
      id="edge-selected"
      sourceX={0}
      sourceY={0}
      targetX={100}
      targetY={0}
      sourcePosition="right"
      targetPosition="left"
      data={{ onDelete: () => {} }}
      selected
    />,
  );

  expect(screen.getByRole("button", { name: "Delete edge" })).toBeTruthy();
});

// src/features/graph-editor/GraphCanvas.test.tsx
mock.module("@xyflow/react", () => ({
  ReactFlow: (props: Record<string, unknown>) => {
    reactFlowProps = props;
    const nodes = Array.isArray(props.nodes) ? props.nodes : [];
    const edges = Array.isArray(props.edges) ? props.edges : [];
    const edgeTypes =
      typeof props.edgeTypes === "object" && props.edgeTypes !== null
        ? (props.edgeTypes as Record<string, any>)
        : {};

    return (
      <div data-testid="react-flow">
        {nodes.map((node) => {
          if (
            typeof node !== "object" ||
            node === null ||
            !("id" in node) ||
            !("data" in node)
          ) {
            return null;
          }

          const nodeId = typeof node.id === "string" ? node.id : "";
          const nodeData =
            typeof node.data === "object" && node.data !== null && "node" in node.data
              ? node.data.node
              : null;
          const label =
            nodeData &&
            typeof nodeData === "object" &&
            "label" in nodeData &&
            typeof nodeData.label === "string"
              ? nodeData.label
              : "";

          return (
            <span
              key={nodeId}
              data-testid={`flow-node-label-${nodeId}`}
            >
              {label}
            </span>
          );
        })}
        {edges.map((edge) => {
          if (
            typeof edge !== "object" ||
            edge === null ||
            !("id" in edge) ||
            !("type" in edge) ||
            typeof edge.type !== "string"
          ) {
            return null;
          }

          const EdgeComponent = edgeTypes[edge.type];
          if (!EdgeComponent) {
            return null;
          }

          return (
            <EdgeComponent
              key={String(edge.id)}
              id={String(edge.id)}
              sourceX={0}
              sourceY={0}
              targetX={100}
              targetY={0}
              sourcePosition="right"
              targetPosition="left"
              selected={false}
              data={"data" in edge ? edge.data : undefined}
            />
          );
        })}
        <span data-testid="flow-pane">pane</span>
      </div>
    );
  },
  Background: () => null,
  Controls: () => null,
  Handle: () => null,
  MiniMap: () => null,
  Position: {
    Left: "left",
    Right: "right",
  },
}));

test("clicking the edge delete affordance removes only the targeted edge", async () => {
  const user = userEvent.setup();

  render(
    <DocumentProvider initialDocument={createSampleDocument()}>
      <GraphCanvas
        diagnostics={[]}
        outputResultsById={{}}
        listenerStatusByOutputId={{}}
      />
    </DocumentProvider>,
  );

  const deleteButton = await screen.findByRole("button", { name: "Delete edge edge-select-output" });
  await user.click(deleteButton);

  const remainingEdges = Array.isArray(reactFlowProps?.edges) ? reactFlowProps.edges : [];

  expect(remainingEdges.find((edge) => edge.id === "edge-select-output")).toBeUndefined();
  expect(remainingEdges.find((edge) => edge.id === "edge-from-select")).toBeTruthy();
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `bun test src/features/graph-editor/edges/DeletableEdge.test.tsx src/features/graph-editor/GraphCanvas.test.tsx`
Expected: FAIL because there is no custom edge renderer, `toFlowEdges()` still emits default edges, and `GraphCanvas` does not dispatch `delete-edge`.

- [ ] **Step 3: Implement the custom edge type and wire delete-edge through the canvas**

```tsx
// src/features/graph-editor/edges/DeletableEdge.tsx
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";
import { useState } from "react";

export type FlowEdgeData = {
  onDelete: (edgeId: string) => void;
};

export function DeletableEdge({
  id,
  data,
  selected,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
}: EdgeProps<FlowEdgeData>) {
  const [isHovered, setIsHovered] = useState(false);
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const showDelete = selected || isHovered;

  return (
    <>
      <BaseEdge id={id} path={path} />
      <path
        d={path}
        className="deletable-edge__hitbox"
        data-testid="deletable-edge-hitbox"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      />
      <EdgeLabelRenderer>
        <button
          type="button"
          className={`deletable-edge__button ${showDelete ? "is-visible" : ""}`}
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
          }}
          aria-label={selected ? "Delete edge" : `Delete edge ${id}`}
          onClick={(event) => {
            event.stopPropagation();
            data?.onDelete(id);
          }}
        >
          ×
        </button>
      </EdgeLabelRenderer>
    </>
  );
}
```

```ts
// src/features/graph-editor/flowAdapter.ts
import type { Edge, Node } from "@xyflow/react";

export interface FlowEdgeData {
  onDelete: (edgeId: string) => void;
}

export function toFlowEdges(
  document: GraphDocument,
  onDelete: (edgeId: string) => void,
): Array<Edge<FlowEdgeData>> {
  return document.edges.map((edge) => ({
    id: edge.id,
    type: "deletableEdge",
    source: edge.source,
    sourceHandle: edge.sourceHandle,
    target: edge.target,
    targetHandle: edge.targetHandle,
    data: {
      onDelete,
    },
  }));
}
```

```tsx
// src/features/graph-editor/GraphCanvas.tsx
import { DeletableEdge } from "./edges/DeletableEdge";

const edgeTypes = {
  deletableEdge: DeletableEdge,
};

const onDeleteEdge = (edgeId: string) => {
  dispatch({ type: "delete-edge", edgeId });
};

const edges = useMemo(
  () => toFlowEdges(state.document, onDeleteEdge),
  [state.document, onDeleteEdge],
);

<ReactFlow
  nodes={nodes}
  edges={edges}
  nodeTypes={nodeTypes}
  edgeTypes={edgeTypes}
  viewport={state.document.viewport}
  onConnect={onConnect}
  onNodeClick={onNodeClick}
  onPaneClick={() =>
    runEditorTransition(() => {
      dispatch({ type: "select-node", nodeId: null });
      dispatch({ type: "open-node-editor", nodeId: null });
    })
  }
  onNodesChange={onNodesChange}
  onViewportChange={(viewport) => dispatch({ type: "set-viewport", viewport })}
>
```

```css
/* src/index.css */
.deletable-edge__button {
  opacity: 0;
  pointer-events: none;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  border: 1px solid var(--border-color, #c6b9a9);
  background: #fff8ef;
  color: #6b3f21;
}

.deletable-edge__button.is-visible {
  opacity: 1;
  pointer-events: auto;
}
```

- [ ] **Step 4: Run focused edge tests, then the full suite and build**

Run: `bun test src/features/graph-editor/edges/DeletableEdge.test.tsx src/features/graph-editor/GraphCanvas.test.tsx`
Expected: PASS

Run: `bun test`
Expected: PASS

Run: `bun run build`
Expected: PASS

- [ ] **Step 5: Commit the edge delete UI and final integration**

```bash
git add src/features/graph-editor/edges/DeletableEdge.tsx src/features/graph-editor/edges/DeletableEdge.test.tsx src/features/graph-editor/flowAdapter.ts src/features/graph-editor/GraphCanvas.tsx src/features/graph-editor/GraphCanvas.test.tsx src/index.css
git commit -m "feat: add deletable graph edges"
```
