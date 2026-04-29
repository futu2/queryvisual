# Helper Functions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add graph-scoped helper-function nodes, importer nodes, validation, type inference, and inline SQL expansion.

**Architecture:** Helper imports are graph metadata, not relational transforms. A new domain helper registry builds resolved helper definitions from `helperFunctions -> importHelperFunctions` edges, expression analysis uses that registry for helper call diagnostics and return types, and SQL rendering expands resolved helper calls inline.

**Tech Stack:** TypeScript, React 19, Bun test, `@xyflow/react`, existing expression parser/analyzer/lowerer/renderer pipeline.

---

## Ground Rules

- Use TDD for every behavior change: write the failing test, run it, implement, run it again.
- Do not create git commits unless the user explicitly asks; this repository session forbids unsolicited commits.
- Prefer focused new domain files under `src/domain/helpers/` instead of growing parser, validation, and compiler files beyond their responsibilities.

## File Structure

- Create `src/domain/helpers/types.ts`: helper registry type definitions.
- Create `src/domain/helpers/registry.ts`: graph-scoped helper import discovery, name validation, arity inference, dependency graph, recursion detection, and helper return-type inference.
- Create `src/domain/helpers/registry.test.ts`: unit tests for helper registry behavior.
- Modify `src/domain/document/types.ts`: add `helperFunctions` and `importHelperFunctions` node kinds and data shapes.
- Modify `src/domain/expr/ast.ts`: add placeholder AST nodes.
- Modify `src/domain/expr/parser.ts`: parse `$1` placeholders when enabled.
- Modify `src/domain/expr/parser.test.ts`: parser tests for placeholders and default rejection.
- Modify `src/domain/expr/analyze.ts`: add helper-aware diagnostics and placeholder rejection outside helper bodies.
- Modify `src/domain/expr/analyze.test.ts`: helper call diagnostics and type tests.
- Modify `src/domain/expr/infer.ts`: infer helper call return types and placeholder types.
- Modify `src/domain/expr/render.ts`: expand helper calls and substitute placeholders during SQL rendering.
- Modify `src/domain/expr/render.test.ts`: SQL expansion unit tests.
- Modify `src/domain/graph/validate.ts`: build helper registry once per graph output validation and pass helper context to expression analysis.
- Modify `src/domain/graph/validate.test.ts`: semantic diagnostics for importer and helper failures.
- Modify `src/domain/graph/inferSchemas.ts`: use helper registry when inferring select and aggregation output types.
- Modify `src/domain/graph/expressionScope.ts`: keep relational scope unchanged; no helper suggestions in initial implementation.
- Modify `src/domain/ir/lower.ts` and `src/domain/compile/compileOutput.ts`: pass helper render context to expression SQL rendering.
- Modify `src/domain/compile/compileOutput.test.ts`: end-to-end SQL expansion tests.
- Modify `src/features/i18n/types.ts` and `src/features/i18n/messages.ts`: add labels for new nodes and editor fields.
- Modify `src/features/graph-editor/NodePalette.tsx` and `src/features/graph-editor/NodePalette.test.tsx`: create new node types.
- Modify `src/features/graph-editor/nodes/QueryNode.tsx` and `src/features/graph-editor/nodes/QueryNode.test.tsx`: handles, glyphs, summaries.
- Modify `src/features/graph-editor/nodeEditors.tsx` and `src/features/graph-editor/NodeEditorModal.test.tsx`: helper rows editor and importer module editor.

---

## Task 1: Parser Placeholder Support

**Files:**
- Modify: `src/domain/expr/ast.ts`
- Modify: `src/domain/expr/parser.ts`
- Modify: `src/domain/expr/parser.test.ts`

- [ ] **Step 1: Write failing parser tests**

Add these tests to `src/domain/expr/parser.test.ts`:

```ts
test("parses placeholders when explicitly enabled", () => {
  const parsed = parseExpression("$1 + $2 + 10", { allowPlaceholders: true });

  expect(parsed.kind).toBe("binary");
  expect(JSON.stringify(parsed)).toContain('"kind":"placeholder"');
  expect(JSON.stringify(parsed)).toContain('"index":1');
  expect(JSON.stringify(parsed)).toContain('"index":2');
});

test("rejects placeholders by default", () => {
  expect(() => parseExpression("$1 + 10")).toThrow();
});

test("rejects zero placeholders", () => {
  expect(() => parseExpression("$0 + 10", { allowPlaceholders: true })).toThrow();
});
```

- [ ] **Step 2: Run parser tests to verify failure**

Run: `bun test src/domain/expr/parser.test.ts`

Expected: FAIL because `parseExpression` has no options parameter and `$1` is not tokenized.

- [ ] **Step 3: Add AST and parser support**

Update `src/domain/expr/ast.ts`:

```ts
export type Expr =
  | { kind: "literal"; value: string | number | boolean | null }
  | { kind: "column"; path: string[] }
  | { kind: "placeholder"; index: number }
  | { kind: "unary"; op: "-" | "not"; expression: Expr }
  | { kind: "binary"; op: BinaryOp; left: Expr; right: Expr }
  | { kind: "call"; name: string; args: Expr[] }
  | {
      kind: "case";
      branches: Array<{ when: Expr; then: Expr }>;
      elseExpression: Expr | null;
    }
  | { kind: "cast"; expression: Expr; to: ColumnType };
```

Update `src/domain/expr/parser.ts`:

```ts
type Token =
  | { kind: "identifier"; value: string }
  | { kind: "placeholder"; value: string }
  | { kind: "number"; value: string }
  | { kind: "string"; value: string }
  | { kind: "symbol"; value: string }
  | { kind: "keyword"; value: string };

export type ParseExpressionOptions = {
  allowPlaceholders?: boolean;
};
```

Change the token regex to include placeholders before symbols:

```ts
const TOKEN_RE =
  /\s*(\$\d+|>=|<=|!=|[(),*/+-]|=|>|<|\bcase\b|\bwhen\b|\bthen\b|\belse\b|\bend\b|\bcast\b|\bas\b|\band\b|\bor\b|\bnot\b|\bnull\b|\btrue\b|\bfalse\b|[A-Za-z_][A-Za-z0-9_.]*|\d+\.\d+|\d+|'[^']*')/giy;
```

Add tokenization and parsing branches:

```ts
} else if (/^\$\d+$/.test(value)) {
  tokens.push({ kind: "placeholder", value });
}
```

```ts
export function parseExpression(
  input: string,
  options: ParseExpressionOptions = {},
): Expr {
```

```ts
if (token.kind === "placeholder") {
  if (!options.allowPlaceholders) {
    throw new Error("Placeholders are only allowed in helper definitions");
  }
  const index = Number(token.value.slice(1));
  if (!Number.isInteger(index) || index < 1) {
    throw new Error("Placeholder indexes must start at 1");
  }
  return { kind: "placeholder", index };
}
```

- [ ] **Step 4: Run parser tests to verify pass**

Run: `bun test src/domain/expr/parser.test.ts`

Expected: PASS.

---

## Task 2: Helper Registry Core

**Files:**
- Modify: `src/domain/document/types.ts`
- Create: `src/domain/helpers/types.ts`
- Create: `src/domain/helpers/registry.ts`
- Create: `src/domain/helpers/registry.test.ts`

- [ ] **Step 1: Write failing registry tests**

Create `src/domain/helpers/registry.test.ts` with:

```ts
import { describe, expect, test } from "bun:test";
import type { GraphDocument } from "../document/types";
import { buildHelperRegistry } from "./registry";

function documentWithHelpers(): GraphDocument {
  return {
    version: 1,
    metadata: { name: "helpers" },
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [
      {
        id: "helpers",
        kind: "helperFunctions",
        label: "Helpers",
        position: { x: 0, y: 0 },
        data: {
          helpers: [{ name: "add10", expression: "$1 + $2 + 10" }],
        },
      },
      {
        id: "import",
        kind: "importHelperFunctions",
        label: "Import Helpers",
        position: { x: 200, y: 0 },
        data: { moduleName: "math" },
      },
    ],
    edges: [
      {
        id: "edge-import",
        source: "helpers",
        sourceHandle: "out",
        target: "import",
        targetHandle: "in",
      },
    ],
  };
}

describe("buildHelperRegistry", () => {
  test("imports helpers with module and inferred arity", () => {
    const registry = buildHelperRegistry(documentWithHelpers());

    expect(registry.diagnostics).toEqual([]);
    expect(registry.helpers).toHaveLength(1);
    expect(registry.helpers[0]).toMatchObject({
      name: "add10",
      moduleName: "math",
      arity: 2,
      definingNodeId: "helpers",
    });
  });

  test("resolves qualified and unique unqualified helper calls", () => {
    const registry = buildHelperRegistry(documentWithHelpers());

    expect(registry.resolveCall("math.add10")?.status).toBe("resolved");
    expect(registry.resolveCall("add10")?.status).toBe("resolved");
  });

  test("reports ambiguous unqualified helper calls", () => {
    const document = documentWithHelpers();
    document.nodes.push(
      {
        id: "helpers-2",
        kind: "helperFunctions",
        label: "Helpers 2",
        position: { x: 0, y: 120 },
        data: { helpers: [{ name: "add10", expression: "$1 + 20" }] },
      },
      {
        id: "import-2",
        kind: "importHelperFunctions",
        label: "Import Helpers 2",
        position: { x: 200, y: 120 },
        data: { moduleName: "other" },
      },
    );
    document.edges.push({
      id: "edge-import-2",
      source: "helpers-2",
      sourceHandle: "out",
      target: "import-2",
      targetHandle: "in",
    });

    const registry = buildHelperRegistry(document);

    expect(registry.resolveCall("add10")?.status).toBe("ambiguous");
    expect(registry.resolveCall("math.add10")?.status).toBe("resolved");
    expect(registry.resolveCall("other.add10")?.status).toBe("resolved");
  });

  test("reports recursive helper dependencies", () => {
    const document = documentWithHelpers();
    const helperNode = document.nodes.find((node) => node.id === "helpers");
    if (helperNode?.kind !== "helperFunctions") throw new Error("bad fixture");
    helperNode.data.helpers = [
      { name: "a", expression: "b($1)" },
      { name: "b", expression: "a($1)" },
    ];

    const registry = buildHelperRegistry(document);

    expect(registry.diagnostics.some((diagnostic) => diagnostic.code === "helpers.recursive")).toBe(true);
  });
});
```

- [ ] **Step 2: Run registry tests to verify failure**

Run: `bun test src/domain/helpers/registry.test.ts`

Expected: FAIL because the node kinds and helper registry do not exist.

- [ ] **Step 3: Add document and helper types**

Update `src/domain/document/types.ts`:

```ts
export type NodeKind =
  | "graphInput"
  | "fromTable"
  | "subgraph"
  | "helperFunctions"
  | "importHelperFunctions"
  | "join"
  | "where"
  | "select"
  | "aggregation"
  | "sort"
  | "limit"
  | "output";

export interface HelperFunctionDefinition {
  name: string;
  expression: string;
}
```

Add to `GraphNode`:

```ts
  | GraphNodeBase<"helperFunctions", { helpers: HelperFunctionDefinition[] }>
  | GraphNodeBase<"importHelperFunctions", { moduleName: string }>
```

Create `src/domain/helpers/types.ts`:

```ts
import type { Diagnostic } from "../diagnostics/types";
import type { Expr } from "../expr/ast";
import type { ColumnType } from "../schema/types";

export interface ImportedHelperDefinition {
  id: string;
  name: string;
  moduleName: string;
  expression: string;
  ast: Expr | null;
  arity: number;
  returnType: ColumnType;
  definingNodeId: string;
  importerNodeId: string;
  rowIndex: number;
}

export type HelperCallResolution =
  | { status: "resolved"; helper: ImportedHelperDefinition }
  | { status: "ambiguous"; helpers: ImportedHelperDefinition[] }
  | { status: "unresolved" };

export interface HelperRegistry {
  helpers: ImportedHelperDefinition[];
  diagnostics: Diagnostic[];
  resolveCall: (name: string) => HelperCallResolution;
}
```

- [ ] **Step 4: Implement registry minimally**

Create `src/domain/helpers/registry.ts` with functions:

```ts
import type { Diagnostic } from "../diagnostics/types";
import type { GraphDocument, GraphNode } from "../document/types";
import { parseExpression } from "../expr/parser";
import type { Expr } from "../expr/ast";
import { inferExpressionType } from "../expr/infer";
import type {
  HelperCallResolution,
  HelperRegistry,
  ImportedHelperDefinition,
} from "./types";

const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function diagnostic(code: string, message: string, nodeId: string, field?: string): Diagnostic {
  return { level: "error", code, message, ref: { nodeId, field } };
}

function incomingEdges(document: GraphDocument, nodeId: string) {
  return document.edges.filter((edge) => edge.target === nodeId);
}

function collectPlaceholderIndexes(expr: Expr | null, out: Set<number>) {
  if (!expr) return;
  switch (expr.kind) {
    case "placeholder":
      out.add(expr.index);
      return;
    case "literal":
    case "column":
      return;
    case "unary":
      collectPlaceholderIndexes(expr.expression, out);
      return;
    case "binary":
      collectPlaceholderIndexes(expr.left, out);
      collectPlaceholderIndexes(expr.right, out);
      return;
    case "call":
      for (const arg of expr.args) collectPlaceholderIndexes(arg, out);
      return;
    case "case":
      for (const branch of expr.branches) {
        collectPlaceholderIndexes(branch.when, out);
        collectPlaceholderIndexes(branch.then, out);
      }
      collectPlaceholderIndexes(expr.elseExpression, out);
      return;
    case "cast":
      collectPlaceholderIndexes(expr.expression, out);
      return;
  }
}

function helperId(moduleName: string, name: string, importerNodeId: string, rowIndex: number) {
  return `${moduleName}:${name}:${importerNodeId}:${rowIndex}`;
}
```

Implement `buildHelperRegistry(document: GraphDocument): HelperRegistry` by:

- indexing nodes by id
- iterating `importHelperFunctions` nodes
- requiring exactly one `targetHandle === "in"` edge
- requiring the source node kind to be `helperFunctions`
- parsing helper expressions with `{ allowPlaceholders: true }`
- validating helper and module names against `IDENTIFIER_RE`
- computing `arity` from the highest placeholder index
- adding duplicate qualified-name diagnostics when the same non-empty `moduleName + name` appears twice
- implementing `resolveCall(name)` by splitting the last dot into `moduleName` and helper name for qualified calls

Return type inference can initially use:

```ts
returnType: ast ? inferExpressionType(ast, {}) : "unknown"
```

- [ ] **Step 5: Run registry tests to verify pass**

Run: `bun test src/domain/helpers/registry.test.ts`

Expected: PASS.

---

## Task 3: Helper-Aware Expression Analysis

**Files:**
- Modify: `src/domain/expr/analyze.ts`
- Modify: `src/domain/expr/infer.ts`
- Modify: `src/domain/expr/analyze.test.ts`
- Modify: `src/domain/helpers/registry.ts`

- [ ] **Step 1: Write failing analysis tests**

Add to `src/domain/expr/analyze.test.ts`:

```ts
test("reports ambiguous helper calls", () => {
  const result = analyzeExpression("add10(total, total)", singleScope(), {
    helpers: {
      resolveCall: () => ({ status: "ambiguous", helpers: [] }),
      helpers: [],
      diagnostics: [],
    },
  });

  expect(result.diagnostics[0]?.code).toBe("expr.ambiguous-helper");
  expect(result.type).toBe("unknown");
});

test("reports wrong helper arity", () => {
  const result = analyzeExpression("add10(total)", singleScope(), {
    helpers: {
      resolveCall: () => ({
        status: "resolved",
        helper: {
          id: "math:add10:import:0",
          name: "add10",
          moduleName: "math",
          expression: "$1 + $2 + 10",
          ast: null,
          arity: 2,
          returnType: "float",
          definingNodeId: "helpers",
          importerNodeId: "import",
          rowIndex: 0,
        },
      }),
      helpers: [],
      diagnostics: [],
    },
  });

  expect(result.diagnostics[0]?.code).toBe("expr.helper-arity");
  expect(result.type).toBe("unknown");
});

test("uses resolved helper return type", () => {
  const result = analyzeExpression("add10(total, total)", singleScope(), {
    helpers: {
      resolveCall: () => ({
        status: "resolved",
        helper: {
          id: "math:add10:import:0",
          name: "add10",
          moduleName: "math",
          expression: "$1 + $2 + 10",
          ast: null,
          arity: 2,
          returnType: "float",
          definingNodeId: "helpers",
          importerNodeId: "import",
          rowIndex: 0,
        },
      }),
      helpers: [],
      diagnostics: [],
    },
  });

  expect(result.diagnostics).toEqual([]);
  expect(result.type).toBe("float");
});
```

- [ ] **Step 2: Run analysis tests to verify failure**

Run: `bun test src/domain/expr/analyze.test.ts`

Expected: FAIL because `AnalyzeExpressionOptions` has no `helpers` option and no helper diagnostics.

- [ ] **Step 3: Add helper diagnostics**

Update `src/domain/expr/analyze.ts`:

```ts
import type { HelperRegistry } from "../helpers/types";
```

Extend diagnostics:

```ts
export type ExpressionAnalysisDiagnosticCode =
  | "expr.parse-error"
  | "expr.unknown-column"
  | "expr.ambiguous-column"
  | "expr.non-boolean"
  | "expr.ambiguous-helper"
  | "expr.helper-arity";
```

Extend options:

```ts
export type AnalyzeExpressionOptions = {
  requireBoolean?: boolean;
  helpers?: HelperRegistry;
  allowPlaceholders?: boolean;
};
```

Parse with:

```ts
ast = parseExpression(expression, {
  allowPlaceholders: options.allowPlaceholders,
});
```

Add `collectCalls(expr, out)` and for each call:

```ts
const resolution = options.helpers?.resolveCall(call.name);
if (resolution?.status === "ambiguous") {
  diagnostics.push({
    code: "expr.ambiguous-helper",
    message: `Ambiguous helper call "${call.name}". Use a module-qualified helper name.`,
  });
}
if (resolution?.status === "resolved" && resolution.helper.arity !== call.args.length) {
  diagnostics.push({
    code: "expr.helper-arity",
    message: `Helper "${call.name}" expects ${resolution.helper.arity} arguments but received ${call.args.length}.`,
  });
}
```

Update `src/domain/expr/infer.ts`:

```ts
import type { HelperRegistry } from "../helpers/types";

export type InferExpressionOptions = {
  helpers?: HelperRegistry;
  placeholderTypes?: Record<number, ColumnType>;
};

export function inferExpressionType(
  expr: Expr,
  scope: ExprScope,
  options: InferExpressionOptions = {},
): ColumnType {
```

Handle placeholders and helper calls:

```ts
case "placeholder":
  return options.placeholderTypes?.[expr.index] ?? "unknown";
case "call": {
  const resolution = options.helpers?.resolveCall(expr.name);
  if (resolution?.status === "resolved" && resolution.helper.arity === expr.args.length) {
    return resolution.helper.returnType;
  }
  // existing built-in switch
}
```

Call inference from `analyzeExpression` with `{ helpers: options.helpers }`.

- [ ] **Step 4: Run analysis tests to verify pass**

Run: `bun test src/domain/expr/analyze.test.ts`

Expected: PASS.

---

## Task 4: Registry Dependency Validation and Return Types

**Files:**
- Modify: `src/domain/helpers/registry.ts`
- Modify: `src/domain/helpers/registry.test.ts`

- [ ] **Step 1: Write failing dependency tests**

Add to `src/domain/helpers/registry.test.ts`:

```ts
test("infers nested helper return types without recursion", () => {
  const document = documentWithHelpers();
  const helperNode = document.nodes.find((node) => node.id === "helpers");
  if (helperNode?.kind !== "helperFunctions") throw new Error("bad fixture");
  helperNode.data.helpers = [
    { name: "base", expression: "$1 + 10" },
    { name: "gross", expression: "base($1) + 5" },
  ];

  const registry = buildHelperRegistry(document);
  const gross = registry.resolveCall("gross");

  expect(registry.diagnostics).toEqual([]);
  expect(gross.status).toBe("resolved");
  if (gross.status !== "resolved") throw new Error("gross did not resolve");
  expect(gross.helper.returnType).toBe("unknown");
});

test("reports wrong arity inside helper bodies", () => {
  const document = documentWithHelpers();
  const helperNode = document.nodes.find((node) => node.id === "helpers");
  if (helperNode?.kind !== "helperFunctions") throw new Error("bad fixture");
  helperNode.data.helpers = [
    { name: "base", expression: "$1 + 10" },
    { name: "gross", expression: "base($1, $2)" },
  ];

  const registry = buildHelperRegistry(document);

  expect(registry.diagnostics.some((diagnostic) => diagnostic.code === "helpers.helper-arity")).toBe(true);
});
```

- [ ] **Step 2: Run registry tests to verify failure**

Run: `bun test src/domain/helpers/registry.test.ts`

Expected: FAIL because helper body calls are not validated.

- [ ] **Step 3: Implement dependency checks**

In `src/domain/helpers/registry.ts`, add traversal helpers:

```ts
function collectCalls(expr: Expr | null, out: Array<{ name: string; argCount: number }>) {
  if (!expr) return;
  switch (expr.kind) {
    case "call":
      out.push({ name: expr.name, argCount: expr.args.length });
      for (const arg of expr.args) collectCalls(arg, out);
      return;
    case "unary":
      collectCalls(expr.expression, out);
      return;
    case "binary":
      collectCalls(expr.left, out);
      collectCalls(expr.right, out);
      return;
    case "case":
      for (const branch of expr.branches) {
        collectCalls(branch.when, out);
        collectCalls(branch.then, out);
      }
      collectCalls(expr.elseExpression, out);
      return;
    case "cast":
      collectCalls(expr.expression, out);
      return;
    default:
      return;
  }
}
```

After all helpers are collected:

- resolve every helper-body call through the completed registry
- add `helpers.ambiguous-helper` for ambiguous calls
- add `helpers.helper-arity` for resolved calls with wrong arity
- build `Map<helper.id, Set<dependency.id>>`
- DFS the map and add `helpers.recursive` when a helper id reappears in the active stack
- infer each helper `returnType` by calling `inferExpressionType(ast, {}, { helpers: registry })`; cycle or invalid helpers remain `unknown`

- [ ] **Step 4: Run registry tests to verify pass**

Run: `bun test src/domain/helpers/registry.test.ts`

Expected: PASS.

---

## Task 5: Validation Integration

**Files:**
- Modify: `src/domain/graph/validate.ts`
- Modify: `src/domain/graph/validate.test.ts`
- Modify: `src/domain/graph/inferSchemas.ts`

- [ ] **Step 1: Write failing validation tests**

Add to `src/domain/graph/validate.test.ts`:

```ts
test("validates select expressions using imported helpers", () => {
  const document: GraphDocument = {
    version: 1,
    metadata: { name: "helper select" },
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [
      {
        id: "orders",
        kind: "fromTable",
        label: "Orders",
        position: { x: 0, y: 0 },
        data: { tableRef: { tableName: "orders" }, columns: { total: "float" } },
      },
      {
        id: "helpers",
        kind: "helperFunctions",
        label: "Helpers",
        position: { x: 0, y: 160 },
        data: { helpers: [{ name: "add10", expression: "$1 + 10" }] },
      },
      {
        id: "import",
        kind: "importHelperFunctions",
        label: "Import Helpers",
        position: { x: 180, y: 160 },
        data: { moduleName: "math" },
      },
      {
        id: "select",
        kind: "select",
        label: "Select",
        position: { x: 260, y: 0 },
        data: { mappings: [{ name: "gross", expression: "add10(total)" }] },
      },
      {
        id: "output",
        kind: "output",
        label: "Output",
        position: { x: 520, y: 0 },
        data: outputData("out"),
      },
    ],
    edges: [
      { id: "e-orders-select", source: "orders", sourceHandle: "out", target: "select", targetHandle: "in" },
      { id: "e-select-output", source: "select", sourceHandle: "out", target: "output", targetHandle: "in" },
      { id: "e-helper-import", source: "helpers", sourceHandle: "out", target: "import", targetHandle: "in" },
    ],
  };

  const semantic = validateOutput(document, "output");

  expect(semantic.diagnostics).toEqual([]);
  expect(semantic.schemas.select).toEqual({ gross: "unknown" });
});

test("reports importer without helper input", () => {
  const document = createSampleDocument();
  document.nodes.push({
    id: "import",
    kind: "importHelperFunctions",
    label: "Import Helpers",
    position: { x: 0, y: 200 },
    data: { moduleName: "" },
  });

  const semantic = validateOutput(document, "output-orders");

  expect(semantic.diagnostics.some((diagnostic) => diagnostic.code === "helpers.importer-missing-input")).toBe(true);
});
```

- [ ] **Step 2: Run validation tests to verify failure**

Run: `bun test src/domain/graph/validate.test.ts`

Expected: FAIL because validation ignores helper registries and importer structural diagnostics.

- [ ] **Step 3: Integrate registry into validation**

In `src/domain/graph/validate.ts`:

- import `buildHelperRegistry`
- build `const helperRegistry = buildHelperRegistry(document)` once in `validateGraphOutput`
- push `helperRegistry.diagnostics` into `diagnostics`
- add cases for `helperFunctions` and `importHelperFunctions` in the ordered node switch:

```ts
case "helperFunctions":
case "importHelperFunctions":
  schemas[node.id] = {};
  break;
```

- add `helpers: helperRegistry` to every `pushAnalyzerDiagnostics` call
- extend `analyzerCodeToNodeSuffix`:

```ts
"expr.ambiguous-helper": "ambiguous-helper",
"expr.helper-arity": "helper-arity",
```

In `src/domain/graph/inferSchemas.ts`:

- build a helper registry in `inferGraphSchemasInternal`
- pass it to `analyzeExpression` in `inferNamedExpressionsSchema`
- return `{}` for `helperFunctions` and `importHelperFunctions` nodes

- [ ] **Step 4: Run validation and schema inference tests**

Run: `bun test src/domain/graph/validate.test.ts src/domain/graph/inferSchemas.test.ts`

Expected: PASS.

---

## Task 6: SQL Helper Expansion

**Files:**
- Modify: `src/domain/expr/render.ts`
- Create or modify: `src/domain/expr/render.test.ts`
- Modify: `src/domain/ir/lower.ts`
- Modify: `src/domain/compile/compileOutput.ts`
- Modify: `src/domain/compile/compileOutput.test.ts`

- [ ] **Step 1: Write failing render tests**

Create `src/domain/expr/render.test.ts` with:

```ts
import { describe, expect, test } from "bun:test";
import { parseExpression } from "./parser";
import { renderExpressionSql } from "./render";
import type { HelperRegistry } from "../helpers/types";

function helperRegistry(): HelperRegistry {
  const helper = {
    id: "math:add10:import:0",
    name: "add10",
    moduleName: "math",
    expression: "$1 + $2 + 10",
    ast: parseExpression("$1 + $2 + 10", { allowPlaceholders: true }),
    arity: 2,
    returnType: "unknown" as const,
    definingNodeId: "helpers",
    importerNodeId: "import",
    rowIndex: 0,
  };

  return {
    helpers: [helper],
    diagnostics: [],
    resolveCall: (name) =>
      name === "add10" || name === "math.add10"
        ? { status: "resolved", helper }
        : { status: "unresolved" },
  };
}

describe("renderExpressionSql helpers", () => {
  test("expands helper calls inline", () => {
    const sql = renderExpressionSql(parseExpression("add10(a, b)"), {
      helpers: helperRegistry(),
    });

    expect(sql).toBe("((a + b) + 10)");
  });

  test("leaves unresolved SQL functions unchanged", () => {
    const sql = renderExpressionSql(parseExpression("coalesce(a, 0)"), {
      helpers: helperRegistry(),
    });

    expect(sql).toBe("COALESCE(a, 0)");
  });
});
```

- [ ] **Step 2: Run render tests to verify failure**

Run: `bun test src/domain/expr/render.test.ts`

Expected: FAIL because `renderExpressionSql` does not accept helper options or placeholders.

- [ ] **Step 3: Implement SQL expansion**

Update `src/domain/expr/render.ts`:

```ts
import type { HelperRegistry } from "../helpers/types";

export type RenderExpressionSqlOptions = {
  helpers?: HelperRegistry;
  placeholders?: Record<number, Expr>;
  expansionStack?: string[];
};
```

Change the signature:

```ts
export function renderExpressionSql(
  expr: Expr,
  options: RenderExpressionSqlOptions = {},
): string {
```

Add cases:

```ts
function substitutePlaceholders(
  expr: Expr,
  replacements: Record<number, Expr> = {},
): Expr {
  switch (expr.kind) {
    case "placeholder":
      return replacements[expr.index] ?? expr;
    case "unary":
      return { ...expr, expression: substitutePlaceholders(expr.expression, replacements) };
    case "binary":
      return {
        ...expr,
        left: substitutePlaceholders(expr.left, replacements),
        right: substitutePlaceholders(expr.right, replacements),
      };
    case "call":
      return {
        ...expr,
        args: expr.args.map((arg) => substitutePlaceholders(arg, replacements)),
      };
    case "case":
      return {
        ...expr,
        branches: expr.branches.map((branch) => ({
          when: substitutePlaceholders(branch.when, replacements),
          then: substitutePlaceholders(branch.then, replacements),
        })),
        elseExpression: expr.elseExpression
          ? substitutePlaceholders(expr.elseExpression, replacements)
          : null,
      };
    case "cast":
      return { ...expr, expression: substitutePlaceholders(expr.expression, replacements) };
    default:
      return expr;
  }
}

case "placeholder": {
  const replacement = options.placeholders?.[expr.index];
  if (!replacement) return `$${expr.index}`;
  return renderExpressionSql(replacement, options);
}
case "call": {
  const resolution = options.helpers?.resolveCall(expr.name);
  if (resolution?.status === "resolved" && resolution.helper.ast) {
    if ((options.expansionStack ?? []).includes(resolution.helper.id)) {
      return `${expr.name.toUpperCase()}(${expr.args.map((arg) => renderExpressionSql(arg, options)).join(", ")})`;
    }
    const placeholders = Object.fromEntries(
      expr.args.map((arg, index) => [
        index + 1,
        substitutePlaceholders(arg, options.placeholders),
      ]),
    ) as Record<number, Expr>;
    return renderExpressionSql(resolution.helper.ast, {
      ...options,
      placeholders,
      expansionStack: [...(options.expansionStack ?? []), resolution.helper.id],
    });
  }
  return `${expr.name.toUpperCase()}(${expr.args.map((arg) => renderExpressionSql(arg, options)).join(", ")})`;
}
```

Keep the existing literal, column, unary, binary, case, and cast rendering behavior unchanged except for passing `options` into recursive calls.

- [ ] **Step 4: Run render tests to verify pass**

Run: `bun test src/domain/expr/render.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing compile test**

Add to `src/domain/compile/compileOutput.test.ts`:

```ts
test("expands imported helper calls in compiled SQL", () => {
  const document: GraphDocument = {
    version: 1,
    metadata: { name: "helper sql" },
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [
      {
        id: "orders",
        kind: "fromTable",
        label: "Orders",
        position: { x: 0, y: 0 },
        data: { tableRef: { tableName: "orders" }, columns: { total: "float", tax: "float" } },
      },
      {
        id: "helpers",
        kind: "helperFunctions",
        label: "Helpers",
        position: { x: 0, y: 160 },
        data: { helpers: [{ name: "add10", expression: "$1 + $2 + 10" }] },
      },
      {
        id: "import",
        kind: "importHelperFunctions",
        label: "Import Helpers",
        position: { x: 180, y: 160 },
        data: { moduleName: "math" },
      },
      {
        id: "select",
        kind: "select",
        label: "Select",
        position: { x: 260, y: 0 },
        data: { mappings: [{ name: "gross", expression: "math.add10(total, tax)" }] },
      },
      {
        id: "output",
        kind: "output",
        label: "Output",
        position: { x: 520, y: 0 },
        data: outputData("out"),
      },
    ],
    edges: [
      { id: "e-orders-select", source: "orders", sourceHandle: "out", target: "select", targetHandle: "in" },
      { id: "e-select-output", source: "select", sourceHandle: "out", target: "output", targetHandle: "in" },
      { id: "e-helper-import", source: "helpers", sourceHandle: "out", target: "import", targetHandle: "in" },
    ],
  };

  const result = compileOutput(document, "output");

  expect(result.semantic.diagnostics).toEqual([]);
  expect(result.sql).toContain('((total + tax) + 10) AS "gross"');
});
```

- [ ] **Step 6: Run compile test to verify failure**

Run: `bun test src/domain/compile/compileOutput.test.ts`

Expected: FAIL because lowerers do not pass helper registries to expression rendering.

- [ ] **Step 7: Pass helpers through lowerers**

In `src/domain/ir/lower.ts`:

- import `buildHelperRegistry`
- build `const helpers = buildHelperRegistry(semantic.document)` after diagnostics pass
- pass `{ helpers }` to every `renderExpressionSql(parseExpression(...))`
- add no-op cases for `helperFunctions` and `importHelperFunctions`

In `src/domain/compile/compileOutput.ts`:

- in `lowerWorkspaceOutputToIr`, build helpers from `params.semantic.document`
- pass `{ helpers }` to every `renderExpressionSql(parseExpression(...))`
- add no-op cases for `helperFunctions` and `importHelperFunctions`

- [ ] **Step 8: Run compile tests to verify pass**

Run: `bun test src/domain/expr/render.test.ts src/domain/compile/compileOutput.test.ts`

Expected: PASS.

---

## Task 7: Canvas Node Model and Palette

**Files:**
- Modify: `src/features/i18n/types.ts`
- Modify: `src/features/i18n/messages.ts`
- Modify: `src/features/graph-editor/NodePalette.tsx`
- Modify: `src/features/graph-editor/NodePalette.test.tsx`
- Modify: `src/features/graph-editor/nodes/QueryNode.tsx`
- Modify: `src/features/graph-editor/nodes/QueryNode.test.tsx`

- [ ] **Step 1: Write failing UI creation tests**

Add to `src/features/graph-editor/NodePalette.test.tsx`:

```ts
test("creates helper function and importer nodes", async () => {
  const user = userEvent.setup();

  renderWithProviders(
    <DocumentProvider initialWorkspace={createSampleWorkspace()}>
      <NodePalette />
      <NodeLabelProbe />
    </DocumentProvider>,
  );

  await user.click(screen.getByRole("button", { name: "Helper Functions" }));
  await user.click(screen.getByRole("button", { name: "Import Helpers" }));

  expect(screen.getByText("Helper Functions")).toBeTruthy();
  expect(screen.getByText("Import Helpers")).toBeTruthy();
});
```

Add to `src/features/graph-editor/nodes/QueryNode.test.tsx`:

```ts
test("renders helper node handles and summaries", () => {
  const { container } = renderWithI18n(
    <ReactFlowProvider>
      <QueryNode
        id="helpers"
        data={{
          node: {
            id: "helpers",
            kind: "helperFunctions",
            label: "Helper Functions",
            position: { x: 0, y: 0 },
            data: { helpers: [{ name: "add10", expression: "$1 + 10" }] },
          },
          diagnostics: [],
        }}
        selected={false}
        dragging={false}
      />
      <QueryNode
        id="import"
        data={{
          node: {
            id: "import",
            kind: "importHelperFunctions",
            label: "Import Helpers",
            position: { x: 0, y: 120 },
            data: { moduleName: "math" },
          },
          diagnostics: [],
        }}
        selected={false}
        dragging={false}
      />
    </ReactFlowProvider>,
  );

  expect(screen.getByText("1 helper")).toBeTruthy();
  expect(screen.getByText("math")).toBeTruthy();
  expect(container.querySelector('[data-query-node-handle="source-out"]')).toBeTruthy();
  expect(container.querySelector('[data-query-node-handle="target-in"]')).toBeTruthy();
});
```

- [ ] **Step 2: Run UI tests to verify failure**

Run: `bun test src/features/graph-editor/NodePalette.test.tsx src/features/graph-editor/nodes/QueryNode.test.tsx`

Expected: FAIL because labels, palette items, and node presentation do not exist.

- [ ] **Step 3: Add i18n keys**

Update `src/features/i18n/types.ts` with:

```ts
  | "nodeKinds.helperFunctions"
  | "nodeKinds.importHelperFunctions"
  | "editor.helperName"
  | "editor.helperExpression"
  | "editor.moduleName"
  | "editor.addHelper"
  | "rowActions.helper"
  | "queryNode.summary.helpers"
  | "queryNode.summary.importedModule"
  | "queryNode.summary.importedHelpers"
```

Update English messages in `src/features/i18n/messages.ts`:

```ts
"nodeKinds.helperFunctions": "Helper Functions",
"nodeKinds.importHelperFunctions": "Import Helpers",
"editor.helperName": "Helper name {row}",
"editor.helperExpression": "Helper expression {row}",
"editor.moduleName": "Module name",
"editor.addHelper": "Add helper",
"rowActions.helper": "helper",
"queryNode.summary.helpers": "{count} helper",
"queryNode.summary.importedModule": "{moduleName}",
"queryNode.summary.importedHelpers": "graph helpers",
```

Update Chinese messages with concise translations:

```ts
"nodeKinds.helperFunctions": "辅助函数",
"nodeKinds.importHelperFunctions": "导入辅助函数",
"editor.helperName": "辅助函数名称 {row}",
"editor.helperExpression": "辅助函数表达式 {row}",
"editor.moduleName": "模块名称",
"editor.addHelper": "添加辅助函数",
"rowActions.helper": "辅助函数",
"queryNode.summary.helpers": "{count} 个辅助函数",
"queryNode.summary.importedModule": "{moduleName}",
"queryNode.summary.importedHelpers": "图辅助函数",
```

- [ ] **Step 4: Add palette defaults**

Update `src/features/graph-editor/NodePalette.tsx`:

- include both message keys in the `messageKey` union
- add palette items after `subgraph`
- add `createNode` cases:

```ts
case "helperFunctions":
  return {
    ...base,
    kind,
    data: { helpers: [{ name: "add10", expression: "$1 + 10" }] },
  };
case "importHelperFunctions":
  return {
    ...base,
    kind,
    data: { moduleName: "" },
  };
```

- [ ] **Step 5: Add QueryNode presentation and handles**

Update `src/features/graph-editor/nodes/QueryNode.tsx`:

- add `helperFunctions` to `PRESENTATION_BY_KIND` as `{ family: "source", glyph: "FN" }`
- add `importHelperFunctions` as `{ family: "terminal", glyph: "IMP" }`
- add message keys
- `TargetHandles` returns `null` for `helperFunctions`
- `TargetHandles` returns `in` for `importHelperFunctions`
- source handle should render for `helperFunctions`
- source handle should not render for `importHelperFunctions`
- summary text:

```ts
case "helperFunctions":
  return t("queryNode.summary.helpers", { count: node.data.helpers.length });
case "importHelperFunctions":
  return node.data.moduleName.trim()
    ? t("queryNode.summary.importedModule", { moduleName: node.data.moduleName.trim() })
    : t("queryNode.summary.importedHelpers");
```

- [ ] **Step 6: Run UI tests to verify pass**

Run: `bun test src/features/graph-editor/NodePalette.test.tsx src/features/graph-editor/nodes/QueryNode.test.tsx`

Expected: PASS.

---

## Task 8: Node Editors

**Files:**
- Modify: `src/features/graph-editor/nodeEditors.tsx`
- Modify: `src/features/graph-editor/NodeEditorModal.tsx`
- Modify: `src/features/graph-editor/NodeEditorModal.test.tsx`

- [ ] **Step 1: Write failing editor tests**

Add to `src/features/graph-editor/NodeEditorModal.test.tsx`:

```ts
test("edits helper function rows", async () => {
  const user = userEvent.setup();
  const onSave = mock();
  const node: GraphNode = {
    id: "helpers",
    kind: "helperFunctions",
    label: "Helper Functions",
    position: { x: 0, y: 0 },
    data: { helpers: [{ name: "add10", expression: "$1 + 10" }] },
  };

  renderModal({ node, onSave });

  await user.clear(screen.getByLabelText("Helper name 1"));
  await user.type(screen.getByLabelText("Helper name 1"), "gross");
  await user.clear(screen.getByLabelText("Helper expression 1"));
  await user.type(screen.getByLabelText("Helper expression 1"), "$1 + $2");
  await user.click(screen.getByRole("button", { name: "Save" }));

  expect(onSave).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: "helperFunctions",
      data: { helpers: [{ name: "gross", expression: "$1 + $2" }] },
    }),
  );
});

test("edits importer module name", async () => {
  const user = userEvent.setup();
  const onSave = mock();
  const node: GraphNode = {
    id: "import",
    kind: "importHelperFunctions",
    label: "Import Helpers",
    position: { x: 0, y: 0 },
    data: { moduleName: "" },
  };

  renderModal({ node, onSave });

  await user.type(screen.getByLabelText("Module name"), "math");
  await user.click(screen.getByRole("button", { name: "Save" }));

  expect(onSave).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: "importHelperFunctions",
      data: { moduleName: "math" },
    }),
  );
});
```

- [ ] **Step 2: Run editor tests to verify failure**

Run: `bun test src/features/graph-editor/NodeEditorModal.test.tsx`

Expected: FAIL because editors do not render these fields.

- [ ] **Step 3: Extend editor draft types**

In `src/features/graph-editor/nodeEditors.tsx`:

- add `HelperFunctionsNode` type alias
- add `HelperFunctionDraftRow = DraftRow<HelperFunctionDefinition>`
- add `HelperFunctionsEditorDraft`
- include helper nodes in `EditableNodeDraft`
- add `"helper"` to `rowActionItemMessageKeys`

Use `blankHelperFunction`:

```ts
function blankHelperFunction(): HelperFunctionDefinition {
  return { name: "", expression: "" };
}
```

- [ ] **Step 4: Add draft serialization**

In `toEditableNodeDraft`:

```ts
if (node.kind === "helperFunctions") {
  return {
    ...node,
    data: {
      helpers: ensureDraftRows(node.data.helpers, blankHelperFunction),
    },
  };
}
```

In `serializeNodeEditorDraft`:

```ts
if (draft.kind === "helperFunctions") {
  return {
    ...draft,
    data: {
      helpers: sanitizeNamedExpressions(stripDraftRows(draft.data.helpers)),
    },
  };
}
```

- [ ] **Step 5: Add helper rows and importer editor UI**

Add `HelperFunctionRows` by reusing `NamedExpressionRows`:

```tsx
function HelperFunctionRows(props: {
  rows: NamedExpressionDraftRow[];
  document: GraphDocument;
  nodeId: string;
  t: Translator;
  onChange: (rows: NamedExpressionDraftRow[]) => void;
}) {
  return (
    <NamedExpressionRows
      rows={props.rows}
      itemKey="helper"
      addButtonLabel={props.t("editor.addHelper")}
      nameLabel={(rowNumber) => props.t("editor.helperName", { row: rowNumber })}
      expressionLabel={(rowNumber) => props.t("editor.helperExpression", { row: rowNumber })}
      rowCardTestIdPrefix="helper-row-card"
      document={props.document}
      nodeId={props.nodeId}
      t={props.t}
      onChange={props.onChange}
    />
  );
}
```

Add switch cases in `renderNodeEditor`:

```tsx
case "helperFunctions":
  return (
    <HelperFunctionRows
      rows={draft.data.helpers}
      document={document}
      nodeId={draft.id}
      t={t}
      onChange={(helpers) =>
        setDraft({ ...draft, data: { helpers } })
      }
    />
  );
case "importHelperFunctions":
  return (
    <label>
      {t("editor.moduleName")}
      <input
        value={draft.data.moduleName}
        onChange={(event) =>
          setDraft({ ...draft, data: { moduleName: event.target.value } })
        }
      />
    </label>
  );
```

In `src/features/graph-editor/NodeEditorModal.tsx`, add both node kinds to `nodeKindMessageKeys`. They do not need `schemaOverrides`.

- [ ] **Step 6: Run editor tests to verify pass**

Run: `bun test src/features/graph-editor/NodeEditorModal.test.tsx`

Expected: PASS.

---

## Task 9: Final Verification

**Files:**
- All modified files

- [ ] **Step 1: Run focused domain tests**

Run:

```bash
bun test \
  src/domain/helpers/registry.test.ts \
  src/domain/expr/parser.test.ts \
  src/domain/expr/analyze.test.ts \
  src/domain/expr/render.test.ts \
  src/domain/graph/validate.test.ts \
  src/domain/graph/inferSchemas.test.ts \
  src/domain/compile/compileOutput.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run focused UI tests**

Run:

```bash
bun test \
  src/features/graph-editor/NodePalette.test.tsx \
  src/features/graph-editor/NodeEditorModal.test.tsx \
  src/features/graph-editor/nodes/QueryNode.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Run full test suite**

Run:

```bash
bun test
```

Expected: PASS.

- [ ] **Step 4: Run production build**

Run:

```bash
bun run build
```

Expected: build exits with code 0 and emits `dist/`.
