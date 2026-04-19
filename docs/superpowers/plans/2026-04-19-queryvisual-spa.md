# QueryVisual SPA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Bun-bundled React SPA with XYFlow that lets users edit relational query graphs, compile named outputs through validation, IR, optimization, and ANSI SQL rendering, and inspect intermediate compiler artifacts in the UI.

**Architecture:** Keep the XYFlow document model strictly separate from the compiler model. The editor owns persisted graph nodes and edges plus modal editing state; pure domain modules own expression parsing/typing, semantic validation, IR lowering, optimization, and SQL rendering; a compile orchestrator feeds the diagnostics and debug tabs for the currently selected output node.

**Tech Stack:** Bun 1.3, Bun bundler, React 19, TypeScript, XYFlow (`@xyflow/react`), Bun test, Testing Library, browser File API

---

## File Structure

- `package.json`, `bunfig.toml`, `tsconfig.json`
  Project scripts and Bun configuration.
- `src/index.ts`
  Bun HTTP entry that serves the SPA for all routes.
- `src/index.html`, `src/frontend.tsx`, `src/App.tsx`, `src/index.css`
  Browser entrypoint, root component, and global layout styles.
- `src/domain/schema/types.ts`
  Column and table reference types shared across compiler stages.
- `src/domain/diagnostics/types.ts`
  Structured diagnostics surfaced in the canvas and modal.
- `src/domain/document/types.ts`, `src/domain/document/sample.ts`
  Persisted graph document model and initial sample document.
- `src/domain/expr/*.ts`
  Expression AST, parser, type inference, and scalar SQL rendering.
- `src/domain/graph/*.ts`
  Semantic graph validation and schema flow.
- `src/domain/ir/*.ts`
  IR definitions, lowering, and optimizer passes.
- `src/domain/sql/renderer.ts`
  ANSI SQL renderer for optimized IR.
- `src/domain/compile/compileOutput.ts`
  End-to-end compile orchestration for one output node.
- `src/app/state/*.ts`
  App-level editor state, reducer, and context.
- `src/features/graph-editor/*.tsx`
  XYFlow canvas, node palette, compact node cards, and modal editors.
- `src/features/debug/DebugPanel.tsx`
  Diagnostics/semantic/IR/SQL tabs.
- `src/features/document-storage/*.ts*`
  Local JSON save/load helpers and toolbar.
- `src/**/*.test.ts?(x)`
  Focused domain, UI, and integration tests.

## Task 1: Bootstrap The Bun React Workspace

**Files:**
- Create or modify: `package.json`
- Create or modify: `bunfig.toml`
- Create or modify: `tsconfig.json`
- Create or modify: `src/index.ts`
- Create or modify: `src/frontend.tsx`
- Create or modify: `src/index.html`
- Create or modify: `src/App.tsx`
- Create or modify: `src/index.css`
- Create: `src/App.test.tsx`
- Delete: `src/APITester.tsx`
- Delete: `src/logo.svg`
- Delete: `src/react.svg`
- Test: `src/App.test.tsx`

- [ ] **Step 1: Scaffold the Bun React app and install runtime/test dependencies**

```bash
bun init --react --yes
bun add @xyflow/react @testing-library/react @testing-library/user-event
```

Expected files include `src/index.ts`, `src/frontend.tsx`, `src/index.html`, `src/App.tsx`, and `src/index.css`.

- [ ] **Step 2: Write the failing shell smoke test**

```tsx
// src/App.test.tsx
import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { App } from "./App";

afterEach(cleanup);

describe("App", () => {
  test("renders the QueryVisual shell", () => {
    render(<App />);

    expect(screen.getByText("QueryVisual")).toBeTruthy();
    expect(screen.getByText("Canvas")).toBeTruthy();
    expect(screen.getByText("Outputs")).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails against the scaffold**

Run: `bun test src/App.test.tsx`  
Expected: FAIL because the default scaffold does not render the `QueryVisual`, `Canvas`, and `Outputs` labels.

- [ ] **Step 4: Replace the scaffold with the minimal SPA shell**

```json
// package.json (scripts section)
{
  "scripts": {
    "dev": "bun --hot src/index.ts",
    "build": "bun build ./src/index.html --outdir=dist --sourcemap --target=browser --minify --define:process.env.NODE_ENV='\"production\"' --env='BUN_PUBLIC_*'",
    "start": "NODE_ENV=production bun src/index.ts",
    "test": "bun test"
  }
}
```

```ts
// src/index.ts
import { serve } from "bun";
import index from "./index.html";

const server = serve({
  routes: {
    "/*": index,
  },
  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`QueryVisual running at ${server.url}`);
```

```tsx
// src/frontend.tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";
import "@xyflow/react/dist/style.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Missing #root element");
}

const app = (
  <StrictMode>
    <App />
  </StrictMode>
);

(import.meta.hot?.data.root ??= createRoot(rootElement)).render(app);
```

```tsx
// src/App.tsx
export function App() {
  return (
    <div className="app-shell">
      <aside className="pane sidebar">
        <h1>QueryVisual</h1>
        <p className="muted">Structured graph editor for DQL compilation.</p>
      </aside>

      <main className="pane canvas-pane">
        <div className="placeholder">Canvas</div>
      </main>

      <section className="pane debug-pane">
        <h2>Outputs</h2>
        <div className="placeholder">Compiler artifacts will appear here.</div>
      </section>
    </div>
  );
}
```

```css
/* src/index.css */
:root {
  color-scheme: light;
  font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
  background: #f4f0e8;
  color: #1f1d1a;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
}

#root {
  min-height: 100vh;
}

.app-shell {
  display: grid;
  grid-template-columns: 280px 1fr 360px;
  min-height: 100vh;
  background:
    radial-gradient(circle at top left, rgba(212, 179, 111, 0.18), transparent 30%),
    linear-gradient(180deg, #f6f3ec 0%, #efe7db 100%);
}

.pane {
  padding: 20px;
  border-right: 1px solid rgba(31, 29, 26, 0.12);
}

.debug-pane {
  border-right: 0;
  border-left: 1px solid rgba(31, 29, 26, 0.12);
}

.placeholder {
  display: grid;
  place-items: center;
  min-height: 240px;
  border: 1px dashed rgba(31, 29, 26, 0.24);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.7);
}

.muted {
  color: #645b51;
}
```

```html
<!-- src/index.html -->
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>QueryVisual</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./frontend.tsx"></script>
  </body>
</html>
```

Run: `rm -f src/APITester.tsx src/logo.svg src/react.svg`

- [ ] **Step 5: Run the smoke test and a production build**

Run: `bun test src/App.test.tsx`  
Expected: PASS

Run: `bun run build`  
Expected: PASS and `dist/` contains the compiled browser assets.

- [ ] **Step 6: Commit**

```bash
git add package.json bunfig.toml tsconfig.json src/index.ts src/frontend.tsx src/index.html src/App.tsx src/index.css src/App.test.tsx
git commit -m "chore: bootstrap bun react workspace"
```

## Task 2: Define The Persisted Graph Document Model

**Files:**
- Create: `src/domain/schema/types.ts`
- Create: `src/domain/diagnostics/types.ts`
- Create: `src/domain/document/types.ts`
- Create: `src/domain/document/sample.ts`
- Create: `src/domain/document/sample.test.ts`
- Test: `src/domain/document/sample.test.ts`

- [ ] **Step 1: Write the failing sample document test**

```ts
// src/domain/document/sample.test.ts
import { describe, expect, test } from "bun:test";
import { createSampleDocument } from "./sample";

describe("createSampleDocument", () => {
  test("creates a graph with an output path", () => {
    const document = createSampleDocument();

    expect(document.nodes.some(node => node.kind === "fromTable")).toBe(true);
    expect(document.nodes.some(node => node.kind === "select")).toBe(true);
    expect(document.nodes.some(node => node.kind === "output")).toBe(true);
    expect(document.edges).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/domain/document/sample.test.ts`  
Expected: FAIL with module not found errors for `./sample`.

- [ ] **Step 3: Implement schema, diagnostics, document types, and a sample document**

```ts
// src/domain/schema/types.ts
export type ColumnType =
  | "boolean"
  | "int"
  | "float"
  | "string"
  | "date"
  | "timestamp"
  | "null"
  | "unknown";

export type ColumnMap = Record<string, ColumnType>;

export interface TableRef {
  schemaName?: string;
  tableName: string;
}

export function formatTableRef(tableRef: TableRef) {
  return tableRef.schemaName
    ? `${tableRef.schemaName}.${tableRef.tableName}`
    : tableRef.tableName;
}
```

```ts
// src/domain/diagnostics/types.ts
export type DiagnosticLevel = "error" | "warning";

export interface DiagnosticRef {
  nodeId?: string;
  field?: string;
  edgeId?: string;
}

export interface Diagnostic {
  level: DiagnosticLevel;
  code: string;
  message: string;
  ref?: DiagnosticRef;
}
```

```ts
// src/domain/document/types.ts
import type { ColumnMap, TableRef } from "../schema/types";

export type NodeKind =
  | "graphInput"
  | "fromTable"
  | "join"
  | "where"
  | "select"
  | "aggregation"
  | "sort"
  | "limit"
  | "output";

export interface Position {
  x: number;
  y: number;
}

export interface NamedExpression {
  name: string;
  expression: string;
}

export interface SortItem {
  expression: string;
  direction: "asc" | "desc";
}

export interface GraphNodeBase<TKind extends NodeKind, TData> {
  id: string;
  kind: TKind;
  label: string;
  position: Position;
  data: TData;
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
  | GraphNodeBase<"output", { outputName: string }>;

export interface GraphEdge {
  id: string;
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
}

export interface GraphDocument {
  version: 1;
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
```

```ts
// src/domain/document/sample.ts
import type { GraphDocument } from "./types";

export function createSampleDocument(): GraphDocument {
  return {
    version: 1,
    metadata: {
      name: "Orders Sample",
    },
    viewport: {
      x: 0,
      y: 0,
      zoom: 1,
    },
    nodes: [
      {
        id: "from-orders",
        kind: "fromTable",
        label: "Orders",
        position: { x: 120, y: 140 },
        data: {
          tableRef: { schemaName: "sales", tableName: "orders" },
          columns: {
            order_id: "int",
            customer_id: "int",
            total: "float",
            status: "string",
          },
        },
      },
      {
        id: "select-orders",
        kind: "select",
        label: "Project",
        position: { x: 420, y: 140 },
        data: {
          mappings: [
            { name: "order_id", expression: "order_id" },
            { name: "gross_total", expression: "total" },
          ],
        },
      },
      {
        id: "output-orders",
        kind: "output",
        label: "Orders Report",
        position: { x: 720, y: 140 },
        data: {
          outputName: "orders_report",
        },
      },
    ],
    edges: [
      {
        id: "edge-from-select",
        source: "from-orders",
        sourceHandle: "out",
        target: "select-orders",
        targetHandle: "in",
      },
      {
        id: "edge-select-output",
        source: "select-orders",
        sourceHandle: "out",
        target: "output-orders",
        targetHandle: "in",
      },
    ],
  };
}
```

- [ ] **Step 4: Run the document test**

Run: `bun test src/domain/document/sample.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/domain/schema/types.ts src/domain/diagnostics/types.ts src/domain/document/types.ts src/domain/document/sample.ts src/domain/document/sample.test.ts
git commit -m "feat: define graph document model"
```

## Task 3: Implement The Expression AST And Parser

**Files:**
- Create: `src/domain/expr/ast.ts`
- Create: `src/domain/expr/parser.ts`
- Create: `src/domain/expr/parser.test.ts`
- Test: `src/domain/expr/parser.test.ts`

- [ ] **Step 1: Write failing parser tests for the mid-sized expression language**

```ts
// src/domain/expr/parser.test.ts
import { describe, expect, test } from "bun:test";
import { parseExpression } from "./parser";

describe("parseExpression", () => {
  test("parses arithmetic precedence", () => {
    const parsed = parseExpression("total * 1.2 + 5");

    expect(parsed.kind).toBe("binary");
    expect(parsed.op).toBe("+");
  });

  test("parses function calls", () => {
    const parsed = parseExpression("coalesce(total, 0)");

    expect(parsed.kind).toBe("call");
    expect(parsed.name).toBe("coalesce");
    expect(parsed.args).toHaveLength(2);
  });

  test("parses case expressions", () => {
    const parsed = parseExpression("case when status = 'paid' then total else 0 end");

    expect(parsed.kind).toBe("case");
    expect(parsed.branches).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the parser tests to confirm they fail**

Run: `bun test src/domain/expr/parser.test.ts`  
Expected: FAIL because `parseExpression` is not implemented.

- [ ] **Step 3: Define the expression AST**

```ts
// src/domain/expr/ast.ts
import type { ColumnType } from "../schema/types";

export type BinaryOp =
  | "+"
  | "-"
  | "*"
  | "/"
  | "="
  | "!="
  | ">"
  | ">="
  | "<"
  | "<="
  | "and"
  | "or";

export type Expr =
  | { kind: "literal"; value: string | number | boolean | null }
  | { kind: "column"; path: string[] }
  | { kind: "unary"; op: "-" | "not"; expression: Expr }
  | { kind: "binary"; op: BinaryOp; left: Expr; right: Expr }
  | { kind: "call"; name: string; args: Expr[] }
  | { kind: "case"; branches: Array<{ when: Expr; then: Expr }>; elseExpression: Expr | null }
  | { kind: "cast"; expression: Expr; to: ColumnType };
```

- [ ] **Step 4: Implement a recursive-descent parser**

```ts
// src/domain/expr/parser.ts
import type { ColumnType } from "../schema/types";
import type { BinaryOp, Expr } from "./ast";

type Token =
  | { kind: "identifier"; value: string }
  | { kind: "number"; value: string }
  | { kind: "string"; value: string }
  | { kind: "symbol"; value: string }
  | { kind: "keyword"; value: string };

const TOKEN_RE =
  /\s*(>=|<=|!=|[(),*/+-]|=|>|<|\bcase\b|\bwhen\b|\bthen\b|\belse\b|\bend\b|\bcast\b|\bas\b|\band\b|\bor\b|\bnot\b|\bnull\b|\btrue\b|\bfalse\b|[A-Za-z_][A-Za-z0-9_.]*|\d+\.\d+|\d+|'[^']*')/giy;

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let match: RegExpExecArray | null;

  while ((match = TOKEN_RE.exec(input)) !== null) {
    const value = match[1];
    const lower = value.toLowerCase();

    if (/^\d/.test(value)) {
      tokens.push({ kind: "number", value });
    } else if (value.startsWith("'")) {
      tokens.push({ kind: "string", value: value.slice(1, -1) });
    } else if (/^(case|when|then|else|end|cast|as|and|or|not|null|true|false)$/i.test(value)) {
      tokens.push({ kind: "keyword", value: lower });
    } else if (/^[(),*/+\-=<>!]$/.test(value) || /^(>=|<=|!=)$/.test(value)) {
      tokens.push({ kind: "symbol", value: lower });
    } else {
      tokens.push({ kind: "identifier", value });
    }
  }

  return tokens;
}

export function parseExpression(input: string): Expr {
  const tokens = tokenize(input);
  let index = 0;

  const peek = () => tokens[index];
  const consume = () => {
    const token = tokens[index];
    index += 1;
    return token;
  };

  const consumeKeyword = (keyword: string) => {
    const token = consume();
    if (!token || token.kind !== "keyword" || token.value !== keyword) {
      throw new Error(`Expected keyword ${keyword}`);
    }
  };

  const matchValue = (...values: string[]) => {
    const token = peek();
    return token ? values.includes(token.value) : false;
  };

  const parsePrimary = (): Expr => {
    const token = consume();

    if (!token) {
      throw new Error("Unexpected end of expression");
    }

    if (token.kind === "number") {
      return { kind: "literal", value: Number(token.value) };
    }

    if (token.kind === "string") {
      return { kind: "literal", value: token.value };
    }

    if (token.kind === "keyword" && token.value === "null") {
      return { kind: "literal", value: null };
    }

    if (token.kind === "keyword" && (token.value === "true" || token.value === "false")) {
      return { kind: "literal", value: token.value === "true" };
    }

    if (token.kind === "symbol" && token.value === "(") {
      const expression = parseOr();
      if (!matchValue(")")) throw new Error("Expected ')'");
      consume();
      return expression;
    }

    if (token.kind === "keyword" && token.value === "case") {
      const branches: Array<{ when: Expr; then: Expr }> = [];

      while (matchValue("when")) {
        consumeKeyword("when");
        const when = parseOr();
        consumeKeyword("then");
        const then = parseOr();
        branches.push({ when, then });
      }

      let elseExpression: Expr | null = null;
      if (matchValue("else")) {
        consumeKeyword("else");
        elseExpression = parseOr();
      }

      consumeKeyword("end");
      return { kind: "case", branches, elseExpression };
    }

    if (token.kind === "keyword" && token.value === "cast") {
      if (!matchValue("(")) throw new Error("Expected '(' after cast");
      consume();
      const expression = parseOr();
      consumeKeyword("as");
      const typeToken = consume();
      if (!typeToken || typeToken.kind !== "identifier") {
        throw new Error("Expected type name after AS");
      }
      if (!matchValue(")")) throw new Error("Expected ')'");
      consume();
      return { kind: "cast", expression, to: typeToken.value as ColumnType };
    }

    if (token.kind === "identifier") {
      if (matchValue("(")) {
        consume();
        const args: Expr[] = [];
        while (!matchValue(")")) {
          args.push(parseOr());
          if (matchValue(",")) consume();
        }
        consume();
        return { kind: "call", name: token.value.toLowerCase(), args };
      }

      return { kind: "column", path: token.value.split(".") };
    }

    throw new Error(`Unexpected token ${token.value}`);
  };

  const parseUnary = (): Expr => {
    if (matchValue("-", "not")) {
      const token = consume();
      return {
        kind: "unary",
        op: token.value as "-" | "not",
        expression: parseUnary(),
      };
    }
    return parsePrimary();
  };

  const parseBinaryLayer = (
    next: () => Expr,
    operators: string[],
  ): Expr => {
    let left = next();
    while (matchValue(...operators)) {
      const operator = consume().value as BinaryOp;
      const right = next();
      left = { kind: "binary", op: operator, left, right };
    }
    return left;
  };

  const parseMultiplicative = () => parseBinaryLayer(parseUnary, ["*", "/"]);
  const parseAdditive = () => parseBinaryLayer(parseMultiplicative, ["+", "-"]);
  const parseComparison = () => parseBinaryLayer(parseAdditive, ["=", "!=", ">", ">=", "<", "<="]);
  const parseAnd = () => parseBinaryLayer(parseComparison, ["and"]);
  const parseOr = () => parseBinaryLayer(parseAnd, ["or"]);

  const parsed = parseOr();
  if (index !== tokens.length) {
    throw new Error("Unexpected trailing tokens");
  }
  return parsed;
}
```

- [ ] **Step 5: Run the parser tests**

Run: `bun test src/domain/expr/parser.test.ts`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/domain/expr/ast.ts src/domain/expr/parser.ts src/domain/expr/parser.test.ts
git commit -m "feat: add expression parser"
```

## Task 4: Add Expression Type Inference And Scalar SQL Rendering

**Files:**
- Create: `src/domain/expr/infer.ts`
- Create: `src/domain/expr/render.ts`
- Create: `src/domain/expr/infer.test.ts`
- Test: `src/domain/expr/infer.test.ts`

- [ ] **Step 1: Write failing tests for type inference and SQL rendering**

```ts
// src/domain/expr/infer.test.ts
import { describe, expect, test } from "bun:test";
import { parseExpression } from "./parser";
import { inferExpressionType } from "./infer";
import { renderExpressionSql } from "./render";

const scope = {
  order_id: "int",
  total: "float",
  status: "string",
} as const;

describe("inferExpressionType", () => {
  test("infers arithmetic expressions as float", () => {
    const type = inferExpressionType(parseExpression("total * 1.2"), scope);
    expect(type).toBe("float");
  });

  test("infers comparisons as boolean", () => {
    const type = inferExpressionType(parseExpression("status = 'paid'"), scope);
    expect(type).toBe("boolean");
  });
});

describe("renderExpressionSql", () => {
  test("renders case expressions to ANSI SQL", () => {
    const sql = renderExpressionSql(parseExpression("case when status = 'paid' then total else 0 end"));
    expect(sql).toContain("CASE WHEN");
    expect(sql).toContain("ELSE 0 END");
  });
});
```

- [ ] **Step 2: Run the tests to confirm failure**

Run: `bun test src/domain/expr/infer.test.ts`  
Expected: FAIL because `inferExpressionType` and `renderExpressionSql` do not exist.

- [ ] **Step 3: Implement expression type inference**

```ts
// src/domain/expr/infer.ts
import type { ColumnType } from "../schema/types";
import type { Expr } from "./ast";

export type ExprScope = Record<string, ColumnType>;

const numericOperators = new Set(["+", "-", "*", "/"]);
const booleanOperators = new Set(["and", "or"]);
const comparisonOperators = new Set(["=", "!=", ">", ">=", "<", "<="]);

export function inferExpressionType(expr: Expr, scope: ExprScope): ColumnType {
  switch (expr.kind) {
    case "literal":
      if (expr.value === null) return "null";
      if (typeof expr.value === "boolean") return "boolean";
      if (typeof expr.value === "number") return Number.isInteger(expr.value) ? "int" : "float";
      return "string";
    case "column": {
      const key = expr.path.join(".");
      return scope[key] ?? scope[expr.path.at(-1) ?? ""] ?? "unknown";
    }
    case "unary":
      return expr.op === "not" ? "boolean" : inferExpressionType(expr.expression, scope);
    case "binary":
      if (booleanOperators.has(expr.op)) return "boolean";
      if (comparisonOperators.has(expr.op)) return "boolean";
      if (numericOperators.has(expr.op)) {
        const left = inferExpressionType(expr.left, scope);
        const right = inferExpressionType(expr.right, scope);
        return left === "float" || right === "float" ? "float" : "int";
      }
      return "unknown";
    case "call":
      switch (expr.name) {
        case "count":
          return "int";
        case "sum":
        case "avg":
          return "float";
        case "coalesce":
          return expr.args.length ? inferExpressionType(expr.args[0], scope) : "unknown";
        default:
          return "unknown";
      }
    case "case":
      return expr.branches.length
        ? inferExpressionType(expr.branches[0].then, scope)
        : expr.elseExpression
          ? inferExpressionType(expr.elseExpression, scope)
          : "unknown";
    case "cast":
      return expr.to;
  }
}
```

- [ ] **Step 4: Implement scalar SQL rendering**

```ts
// src/domain/expr/render.ts
import type { Expr } from "./ast";

function renderLiteral(value: string | number | boolean | null) {
  if (value === null) return "NULL";
  if (typeof value === "string") return `'${value.replace(/'/g, "''")}'`;
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return String(value);
}

export function renderExpressionSql(expr: Expr): string {
  switch (expr.kind) {
    case "literal":
      return renderLiteral(expr.value);
    case "column":
      return expr.path.join(".");
    case "unary":
      return expr.op === "not"
        ? `(NOT ${renderExpressionSql(expr.expression)})`
        : `(-${renderExpressionSql(expr.expression)})`;
    case "binary":
      return `(${renderExpressionSql(expr.left)} ${expr.op.toUpperCase()} ${renderExpressionSql(expr.right)})`;
    case "call":
      return `${expr.name.toUpperCase()}(${expr.args.map(renderExpressionSql).join(", ")})`;
    case "case":
      return [
        "CASE",
        ...expr.branches.map(
          branch => `WHEN ${renderExpressionSql(branch.when)} THEN ${renderExpressionSql(branch.then)}`,
        ),
        expr.elseExpression ? `ELSE ${renderExpressionSql(expr.elseExpression)}` : "",
        "END",
      ]
        .filter(Boolean)
        .join(" ");
    case "cast":
      return `CAST(${renderExpressionSql(expr.expression)} AS ${expr.to.toUpperCase()})`;
  }
}
```

- [ ] **Step 5: Run the tests**

Run: `bun test src/domain/expr/infer.test.ts`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/domain/expr/infer.ts src/domain/expr/render.ts src/domain/expr/infer.test.ts
git commit -m "feat: add expression typing and rendering"
```

## Task 5: Validate Graph Outputs Into A Semantic Model

**Files:**
- Create: `src/domain/graph/semantic.ts`
- Create: `src/domain/graph/validate.ts`
- Create: `src/domain/graph/validate.test.ts`
- Test: `src/domain/graph/validate.test.ts`

- [ ] **Step 1: Write failing validation tests**

```ts
// src/domain/graph/validate.test.ts
import { describe, expect, test } from "bun:test";
import { createSampleDocument } from "../document/sample";
import type { GraphDocument } from "../document/types";
import { validateOutput } from "./validate";

describe("validateOutput", () => {
  test("validates the sample output without errors", () => {
    const document = createSampleDocument();
    const result = validateOutput(document, "output-orders");

    expect(result.diagnostics).toHaveLength(0);
    expect(result.outputName).toBe("orders_report");
    expect(result.schemas["select-orders"].gross_total).toBe("float");
  });

  test("reports a missing join input", () => {
    const invalid: GraphDocument = {
      ...createSampleDocument(),
      nodes: [
        {
          id: "join-1",
          kind: "join",
          label: "Join",
          position: { x: 0, y: 0 },
          data: { joinType: "inner", predicate: "left.id = right.id" },
        },
        {
          id: "output-join",
          kind: "output",
          label: "Output",
          position: { x: 200, y: 0 },
          data: { outputName: "bad_join" },
        },
      ],
      edges: [
        {
          id: "edge-join-output",
          source: "join-1",
          sourceHandle: "out",
          target: "output-join",
          targetHandle: "in",
        },
      ],
    };

    const result = validateOutput(invalid, "output-join");

    expect(result.diagnostics.some(diagnostic => diagnostic.code === "join.missing-input")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the validation tests to confirm failure**

Run: `bun test src/domain/graph/validate.test.ts`  
Expected: FAIL because `validateOutput` is not implemented.

- [ ] **Step 3: Define semantic output types**

```ts
// src/domain/graph/semantic.ts
import type { Diagnostic } from "../diagnostics/types";
import type { GraphDocument, GraphNode } from "../document/types";
import type { ColumnMap } from "../schema/types";

export interface SemanticOutput {
  document: GraphDocument;
  outputId: string;
  outputName: string;
  orderedNodes: GraphNode[];
  nodesById: Record<string, GraphNode>;
  schemas: Record<string, ColumnMap>;
  diagnostics: Diagnostic[];
}
```

- [ ] **Step 4: Implement validation, arity checks, and schema flow**

```ts
// src/domain/graph/validate.ts
import type { Diagnostic } from "../diagnostics/types";
import type { GraphDocument, GraphEdge, GraphNode, NamedExpression } from "../document/types";
import type { ColumnMap } from "../schema/types";
import { inferExpressionType } from "../expr/infer";
import { parseExpression } from "../expr/parser";
import type { SemanticOutput } from "./semantic";

function incomingEdges(document: GraphDocument, nodeId: string) {
  return document.edges.filter(edge => edge.target === nodeId);
}

function orderedReachableNodes(document: GraphDocument, outputId: string) {
  const nodesById = Object.fromEntries(document.nodes.map(node => [node.id, node]));
  const visited = new Set<string>();
  const ordered: GraphNode[] = [];

  function visit(nodeId: string) {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);

    for (const edge of incomingEdges(document, nodeId)) {
      visit(edge.source);
    }

    ordered.push(nodesById[nodeId]);
  }

  visit(outputId);
  return ordered;
}

function scopeFromSchema(schema: ColumnMap) {
  return { ...schema };
}

function mappingsToSchema(mappings: NamedExpression[], scope: ColumnMap) {
  return Object.fromEntries(
    mappings.map(mapping => [
      mapping.name,
      inferExpressionType(parseExpression(mapping.expression), scope),
    ]),
  );
}

function diagnostic(code: string, message: string, nodeId: string, field?: string): Diagnostic {
  return {
    level: "error",
    code,
    message,
    ref: { nodeId, field },
  };
}

export function validateOutput(document: GraphDocument, outputId: string): SemanticOutput {
  const nodesById = Object.fromEntries(document.nodes.map(node => [node.id, node]));
  const orderedNodes = orderedReachableNodes(document, outputId);
  const diagnostics: Diagnostic[] = [];
  const schemas: Record<string, ColumnMap> = {};

  for (const node of orderedNodes) {
    const inputs = incomingEdges(document, node.id);
    switch (node.kind) {
      case "graphInput":
        schemas[node.id] = node.data.columns;
        break;
      case "fromTable":
        schemas[node.id] = node.data.columns;
        break;
      case "join": {
        const left = inputs.find(edge => edge.targetHandle === "left");
        const right = inputs.find(edge => edge.targetHandle === "right");
        if (!left || !right) {
          diagnostics.push(diagnostic("join.missing-input", "Join nodes require left and right inputs.", node.id));
          schemas[node.id] = {};
          break;
        }
        const leftSchema = schemas[left.source] ?? {};
        const rightSchema = schemas[right.source] ?? {};
        const scope = { ...scopeFromSchema(leftSchema), ...scopeFromSchema(rightSchema) };
        inferExpressionType(parseExpression(node.data.predicate), scope);
        schemas[node.id] = { ...leftSchema, ...rightSchema };
        break;
      }
      case "where": {
        const input = inputs.find(edge => edge.targetHandle === "in");
        if (!input) {
          diagnostics.push(diagnostic("where.missing-input", "Where nodes require one input.", node.id));
          schemas[node.id] = {};
          break;
        }
        const inputSchema = schemas[input.source] ?? {};
        const predicateType = inferExpressionType(parseExpression(node.data.predicate), inputSchema);
        if (predicateType !== "boolean") {
          diagnostics.push(diagnostic("where.non-boolean", "Where predicate must be boolean.", node.id, "predicate"));
        }
        schemas[node.id] = inputSchema;
        break;
      }
      case "select": {
        const input = inputs.find(edge => edge.targetHandle === "in");
        const inputSchema = input ? schemas[input.source] ?? {} : {};
        if (!input) {
          diagnostics.push(diagnostic("select.missing-input", "Select nodes require one input.", node.id));
        }
        schemas[node.id] = mappingsToSchema(node.data.mappings, inputSchema);
        break;
      }
      case "aggregation": {
        const input = inputs.find(edge => edge.targetHandle === "in");
        const inputSchema = input ? schemas[input.source] ?? {} : {};
        if (!input) {
          diagnostics.push(diagnostic("aggregation.missing-input", "Aggregation nodes require one input.", node.id));
        }
        schemas[node.id] = {
          ...mappingsToSchema(node.data.groupBy, inputSchema),
          ...mappingsToSchema(node.data.aggregates, inputSchema),
        };
        break;
      }
      case "sort":
      case "limit": {
        const input = inputs.find(edge => edge.targetHandle === "in");
        if (!input) {
          diagnostics.push(diagnostic(`${node.kind}.missing-input`, `${node.kind} nodes require one input.`, node.id));
          schemas[node.id] = {};
          break;
        }
        schemas[node.id] = schemas[input.source] ?? {};
        break;
      }
      case "output": {
        const input = inputs.find(edge => edge.targetHandle === "in");
        if (!input) {
          diagnostics.push(diagnostic("output.missing-input", "Output nodes require one input.", node.id));
          schemas[node.id] = {};
          break;
        }
        schemas[node.id] = schemas[input.source] ?? {};
        break;
      }
    }
  }

  const outputNode = nodesById[outputId];
  if (!outputNode || outputNode.kind !== "output") {
    diagnostics.push({
      level: "error",
      code: "output.invalid",
      message: `Node ${outputId} is not an output node.`,
    });
  }

  return {
    document,
    outputId,
    outputName: outputNode?.kind === "output" ? outputNode.data.outputName : outputId,
    orderedNodes,
    nodesById,
    schemas,
    diagnostics,
  };
}
```

- [ ] **Step 5: Run the validation tests**

Run: `bun test src/domain/graph/validate.test.ts`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/domain/graph/semantic.ts src/domain/graph/validate.ts src/domain/graph/validate.test.ts
git commit -m "feat: validate graph outputs"
```

## Task 6: Lower Semantic Outputs Into IR And Optimize Them

**Files:**
- Create: `src/domain/ir/types.ts`
- Create: `src/domain/ir/lower.ts`
- Create: `src/domain/ir/optimize.ts`
- Create: `src/domain/ir/optimize.test.ts`
- Test: `src/domain/ir/optimize.test.ts`

- [ ] **Step 1: Write failing IR and optimizer tests**

```ts
// src/domain/ir/optimize.test.ts
import { describe, expect, test } from "bun:test";
import type { IRRelNode } from "./types";
import { optimizeOutput } from "./optimize";

describe("optimizeOutput", () => {
  test("merges adjacent filters into one predicate", () => {
    const ir: IRRelNode = {
      kind: "filter",
      predicateSql: "status = 'paid'",
      input: {
        kind: "filter",
        predicateSql: "total > 0",
        input: {
          kind: "scan",
          tableSql: "sales.orders",
          schema: {
            order_id: "int",
            total: "float",
            status: "string",
          },
        },
      },
    };

    const optimized = optimizeOutput(ir);

    expect(optimized.kind).toBe("filter");
    expect(optimized.predicateSql).toContain("AND");
  });
});
```

- [ ] **Step 2: Run the test to confirm failure**

Run: `bun test src/domain/ir/optimize.test.ts`  
Expected: FAIL because the IR modules are missing.

- [ ] **Step 3: Define the relational IR and lowering logic**

```ts
// src/domain/ir/types.ts
import type { ColumnMap } from "../schema/types";

export type IRRelNode =
  | { kind: "input"; name: string; schema: ColumnMap }
  | { kind: "scan"; tableSql: string; schema: ColumnMap }
  | { kind: "join"; joinType: string; predicateSql: string; left: IRRelNode; right: IRRelNode; schema: ColumnMap }
  | { kind: "filter"; predicateSql: string; input: IRRelNode }
  | { kind: "project"; projections: Array<{ alias: string; expressionSql: string }>; input: IRRelNode; schema: ColumnMap }
  | { kind: "aggregate"; groupBy: Array<{ alias: string; expressionSql: string }>; aggregates: Array<{ alias: string; expressionSql: string }>; input: IRRelNode; schema: ColumnMap }
  | { kind: "sort"; items: Array<{ expressionSql: string; direction: "asc" | "desc" }>; input: IRRelNode }
  | { kind: "limit"; count: number; offset: number | null; input: IRRelNode };
```

```ts
// src/domain/ir/lower.ts
import { formatTableRef } from "../schema/types";
import { parseExpression } from "../expr/parser";
import { renderExpressionSql } from "../expr/render";
import type { SemanticOutput } from "../graph/semantic";
import type { GraphNode } from "../document/types";
import type { IRRelNode } from "./types";

export function lowerOutputToIr(semantic: SemanticOutput): IRRelNode | null {
  const cache = new Map<string, IRRelNode>();
  const edgesByTarget = new Map(
    semantic.document.nodes.map(node => [
      node.id,
      semantic.document.edges.filter(edge => edge.target === node.id),
    ]),
  );

  function lowerNode(node: GraphNode): IRRelNode | null {
    if (cache.has(node.id)) return cache.get(node.id)!;

    const inputs = edgesByTarget.get(node.id) ?? [];
    const oneInput = () => {
      const edge = inputs.find(candidate => candidate.targetHandle === "in");
      return edge ? lowerNode(semantic.nodesById[edge.source]) : null;
    };

    let lowered: IRRelNode | null = null;

    switch (node.kind) {
      case "graphInput":
        lowered = { kind: "input", name: node.label, schema: node.data.columns };
        break;
      case "fromTable":
        lowered = {
          kind: "scan",
          tableSql: formatTableRef(node.data.tableRef),
          schema: node.data.columns,
        };
        break;
      case "join": {
        const leftEdge = inputs.find(edge => edge.targetHandle === "left");
        const rightEdge = inputs.find(edge => edge.targetHandle === "right");
        if (!leftEdge || !rightEdge) return null;
        lowered = {
          kind: "join",
          joinType: node.data.joinType,
          predicateSql: renderExpressionSql(parseExpression(node.data.predicate)),
          left: lowerNode(semantic.nodesById[leftEdge.source])!,
          right: lowerNode(semantic.nodesById[rightEdge.source])!,
          schema: semantic.schemas[node.id],
        };
        break;
      }
      case "where":
        lowered = {
          kind: "filter",
          predicateSql: renderExpressionSql(parseExpression(node.data.predicate)),
          input: oneInput()!,
        };
        break;
      case "select":
        lowered = {
          kind: "project",
          projections: node.data.mappings.map(mapping => ({
            alias: mapping.name,
            expressionSql: renderExpressionSql(parseExpression(mapping.expression)),
          })),
          input: oneInput()!,
          schema: semantic.schemas[node.id],
        };
        break;
      case "aggregation":
        lowered = {
          kind: "aggregate",
          groupBy: node.data.groupBy.map(row => ({
            alias: row.name,
            expressionSql: renderExpressionSql(parseExpression(row.expression)),
          })),
          aggregates: node.data.aggregates.map(row => ({
            alias: row.name,
            expressionSql: renderExpressionSql(parseExpression(row.expression)),
          })),
          input: oneInput()!,
          schema: semantic.schemas[node.id],
        };
        break;
      case "sort":
        lowered = {
          kind: "sort",
          items: node.data.items.map(item => ({
            expressionSql: renderExpressionSql(parseExpression(item.expression)),
            direction: item.direction,
          })),
          input: oneInput()!,
        };
        break;
      case "limit":
        lowered = {
          kind: "limit",
          count: node.data.count,
          offset: node.data.offset,
          input: oneInput()!,
        };
        break;
      case "output":
        lowered = oneInput();
        break;
    }

    if (lowered) cache.set(node.id, lowered);
    return lowered;
  }

  const outputNode = semantic.nodesById[semantic.outputId];
  return lowerNode(outputNode);
}
```

- [ ] **Step 4: Implement conservative optimizer passes**

```ts
// src/domain/ir/optimize.ts
import type { IRRelNode } from "./types";

function optimizeNode(node: IRRelNode): IRRelNode {
  switch (node.kind) {
    case "filter": {
      const optimizedInput = optimizeNode(node.input);
      if (optimizedInput.kind === "filter") {
        return {
          kind: "filter",
          predicateSql: `(${optimizedInput.predicateSql}) AND (${node.predicateSql})`,
          input: optimizedInput.input,
        };
      }
      return { ...node, input: optimizedInput };
    }
    case "join":
      return {
        ...node,
        left: optimizeNode(node.left),
        right: optimizeNode(node.right),
      };
    case "project":
      return { ...node, input: optimizeNode(node.input) };
    case "aggregate":
      return { ...node, input: optimizeNode(node.input) };
    case "sort":
      return { ...node, input: optimizeNode(node.input) };
    case "limit":
      return { ...node, input: optimizeNode(node.input) };
    default:
      return node;
  }
}

export function optimizeOutput(node: IRRelNode) {
  return optimizeNode(node);
}
```

- [ ] **Step 5: Run the optimizer test**

Run: `bun test src/domain/ir/optimize.test.ts`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/domain/ir/types.ts src/domain/ir/lower.ts src/domain/ir/optimize.ts src/domain/ir/optimize.test.ts
git commit -m "feat: add relational ir pipeline"
```

## Task 7: Render Optimized IR To ANSI SQL And Expose One-Call Compilation

**Files:**
- Create: `src/domain/sql/renderer.ts`
- Create: `src/domain/compile/compileOutput.ts`
- Create: `src/domain/sql/renderer.test.ts`
- Create: `src/domain/compile/compileOutput.test.ts`
- Test: `src/domain/sql/renderer.test.ts`
- Test: `src/domain/compile/compileOutput.test.ts`

- [ ] **Step 1: Write failing renderer and orchestration tests**

```ts
// src/domain/sql/renderer.test.ts
import { describe, expect, test } from "bun:test";
import { createSampleDocument } from "../document/sample";
import { validateOutput } from "../graph/validate";
import { lowerOutputToIr } from "../ir/lower";
import { optimizeOutput } from "../ir/optimize";
import { renderSql } from "./renderer";

describe("renderSql", () => {
  test("renders the sample select query", () => {
    const semantic = validateOutput(createSampleDocument(), "output-orders");
    const ir = optimizeOutput(lowerOutputToIr(semantic)!);
    const sql = renderSql(ir);

    expect(sql).toContain("SELECT");
    expect(sql).toContain("gross_total");
    expect(sql).toContain("FROM sales.orders");
  });
});
```

```ts
// src/domain/compile/compileOutput.test.ts
import { describe, expect, test } from "bun:test";
import { createSampleDocument } from "../document/sample";
import { compileOutput } from "./compileOutput";

describe("compileOutput", () => {
  test("returns semantic, ir, optimizedIr, and sql", () => {
    const result = compileOutput(createSampleDocument(), "output-orders");

    expect(result.semantic.outputName).toBe("orders_report");
    expect(result.sql).toContain("SELECT");
    expect(result.optimizedIr).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the tests to confirm failure**

Run: `bun test src/domain/sql/renderer.test.ts src/domain/compile/compileOutput.test.ts`  
Expected: FAIL because `renderSql` and `compileOutput` are missing.

- [ ] **Step 3: Implement ANSI SQL rendering**

```ts
// src/domain/sql/renderer.ts
import type { IRRelNode } from "../ir/types";

function renderInput(node: IRRelNode) {
  switch (node.kind) {
    case "scan":
      return node.tableSql;
    case "input":
      return node.name;
    default:
      return `(${renderSql(node)})`;
  }
}

export function renderSql(node: IRRelNode): string {
  switch (node.kind) {
    case "input":
      return `SELECT * FROM ${node.name}`;
    case "scan":
      return `SELECT * FROM ${node.tableSql}`;
    case "filter":
      return `${renderSql(node.input)} WHERE ${node.predicateSql}`;
    case "project":
      return `SELECT ${node.projections.map(projection => `${projection.expressionSql} AS ${projection.alias}`).join(", ")} FROM ${renderInput(node.input)}`;
    case "aggregate": {
      const selectItems = [
        ...node.groupBy.map(item => `${item.expressionSql} AS ${item.alias}`),
        ...node.aggregates.map(item => `${item.expressionSql} AS ${item.alias}`),
      ];
      const groupSql = node.groupBy.map(item => item.expressionSql).join(", ");
      return `SELECT ${selectItems.join(", ")} FROM ${renderInput(node.input)} GROUP BY ${groupSql}`;
    }
    case "join":
      return `SELECT * FROM ${renderInput(node.left)} ${node.joinType.toUpperCase()} JOIN ${renderInput(node.right)} ON ${node.predicateSql}`;
    case "sort":
      return `${renderSql(node.input)} ORDER BY ${node.items.map(item => `${item.expressionSql} ${item.direction.toUpperCase()}`).join(", ")}`;
    case "limit":
      return `${renderSql(node.input)} LIMIT ${node.count}${node.offset ? ` OFFSET ${node.offset}` : ""}`;
  }
}
```

- [ ] **Step 4: Implement the compile orchestrator**

```ts
// src/domain/compile/compileOutput.ts
import type { GraphDocument } from "../document/types";
import { validateOutput } from "../graph/validate";
import { lowerOutputToIr } from "../ir/lower";
import { optimizeOutput } from "../ir/optimize";
import { renderSql } from "../sql/renderer";

export interface CompileOutputResult {
  semantic: ReturnType<typeof validateOutput>;
  ir: ReturnType<typeof lowerOutputToIr>;
  optimizedIr: ReturnType<typeof lowerOutputToIr>;
  sql: string;
}

export function compileOutput(document: GraphDocument, outputId: string): CompileOutputResult {
  const semantic = validateOutput(document, outputId);
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

- [ ] **Step 5: Run the renderer and compile tests**

Run: `bun test src/domain/sql/renderer.test.ts src/domain/compile/compileOutput.test.ts`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/domain/sql/renderer.ts src/domain/compile/compileOutput.ts src/domain/sql/renderer.test.ts src/domain/compile/compileOutput.test.ts
git commit -m "feat: render ansi sql from optimized ir"
```

## Task 8: Add Editor State, Reducer, And App Wiring

**Files:**
- Create: `src/app/state/documentReducer.ts`
- Create: `src/app/state/documentReducer.test.ts`
- Create: `src/app/state/DocumentContext.tsx`
- Modify: `src/App.tsx`
- Test: `src/app/state/documentReducer.test.ts`

- [ ] **Step 1: Write the failing reducer test**

```ts
// src/app/state/documentReducer.test.ts
import { describe, expect, test } from "bun:test";
import { createSampleDocument } from "../../domain/document/sample";
import { createInitialEditorState, documentReducer } from "./documentReducer";

describe("documentReducer", () => {
  test("tracks the active output and open editor", () => {
    const initial = createInitialEditorState(createSampleDocument());
    const next = documentReducer(initial, {
      type: "open-node-editor",
      nodeId: "select-orders",
    });

    expect(initial.activeOutputId).toBe("output-orders");
    expect(next.editorNodeId).toBe("select-orders");
  });
});
```

- [ ] **Step 2: Run the reducer test to confirm failure**

Run: `bun test src/app/state/documentReducer.test.ts`  
Expected: FAIL because the reducer module does not exist.

- [ ] **Step 3: Implement editor state and reducer**

```ts
// src/app/state/documentReducer.ts
import { createSampleDocument } from "../../domain/document/sample";
import type { GraphDocument, GraphEdge, GraphNode } from "../../domain/document/types";

export interface EditorState {
  document: GraphDocument;
  selectedNodeId: string | null;
  editorNodeId: string | null;
  activeOutputId: string | null;
}

export type EditorAction =
  | { type: "replace-document"; document: GraphDocument }
  | { type: "add-node"; node: GraphNode }
  | { type: "replace-node"; node: GraphNode }
  | { type: "upsert-edge"; edge: GraphEdge }
  | { type: "set-node-position"; nodeId: string; position: GraphNode["position"] }
  | { type: "set-viewport"; viewport: GraphDocument["viewport"] }
  | { type: "open-node-editor"; nodeId: string | null }
  | { type: "select-node"; nodeId: string | null }
  | { type: "set-active-output"; nodeId: string | null };

function firstOutputId(document: GraphDocument) {
  return document.nodes.find(node => node.kind === "output")?.id ?? null;
}

export function createInitialEditorState(document: GraphDocument = createSampleDocument()): EditorState {
  return {
    document,
    selectedNodeId: null,
    editorNodeId: null,
    activeOutputId: firstOutputId(document),
  };
}

export function documentReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "replace-document":
      return createInitialEditorState(action.document);
    case "add-node":
      return {
        ...state,
        document: { ...state.document, nodes: [...state.document.nodes, action.node] },
      };
    case "replace-node":
      return {
        ...state,
        document: {
          ...state.document,
          nodes: state.document.nodes.map(node => (node.id === action.node.id ? action.node : node)),
        },
      };
    case "upsert-edge":
      return {
        ...state,
        document: {
          ...state.document,
          edges: [
            ...state.document.edges.filter(edge => edge.id !== action.edge.id),
            action.edge,
          ],
        },
      };
    case "set-node-position":
      return {
        ...state,
        document: {
          ...state.document,
          nodes: state.document.nodes.map(node =>
            node.id === action.nodeId ? { ...node, position: action.position } : node,
          ),
        },
      };
    case "set-viewport":
      return {
        ...state,
        document: {
          ...state.document,
          viewport: action.viewport,
        },
      };
    case "open-node-editor":
      return { ...state, editorNodeId: action.nodeId };
    case "select-node":
      return { ...state, selectedNodeId: action.nodeId };
    case "set-active-output":
      return { ...state, activeOutputId: action.nodeId };
  }
}
```

- [ ] **Step 4: Add the context provider and wire the root app to it**

```tsx
// src/app/state/DocumentContext.tsx
import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from "react";
import type { GraphDocument } from "../../domain/document/types";
import { createInitialEditorState, documentReducer, type EditorAction, type EditorState } from "./documentReducer";

interface DocumentContextValue {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
}

const DocumentContext = createContext<DocumentContextValue | null>(null);

export function DocumentProvider({
  children,
  initialDocument,
}: {
  children: ReactNode;
  initialDocument?: GraphDocument;
}) {
  const [state, dispatch] = useReducer(documentReducer, createInitialEditorState(initialDocument));
  return <DocumentContext.Provider value={{ state, dispatch }}>{children}</DocumentContext.Provider>;
}

export function useDocumentContext() {
  const value = useContext(DocumentContext);
  if (!value) throw new Error("DocumentContext is missing");
  return value;
}
```

```tsx
// src/App.tsx
import { DocumentProvider } from "./app/state/DocumentContext";

function AppLayout() {
  return (
    <div className="app-shell">
      <aside className="pane sidebar">
        <h1>QueryVisual</h1>
        <p className="muted">Structured graph editor for DQL compilation.</p>
      </aside>
      <main className="pane canvas-pane">
        <div className="placeholder">Canvas</div>
      </main>
      <section className="pane debug-pane">
        <h2>Outputs</h2>
        <div className="placeholder">Compiler artifacts will appear here.</div>
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

- [ ] **Step 5: Run the reducer test**

Run: `bun test src/app/state/documentReducer.test.ts`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/app/state/documentReducer.ts src/app/state/documentReducer.test.ts src/app/state/DocumentContext.tsx src/App.tsx
git commit -m "feat: add editor state reducer"
```

## Task 9: Build The XYFlow Canvas, Palette, And Compact Node Cards

**Files:**
- Create: `src/features/graph-editor/flowAdapter.ts`
- Create: `src/features/graph-editor/NodePalette.tsx`
- Create: `src/features/graph-editor/GraphCanvas.tsx`
- Create: `src/features/graph-editor/nodes/QueryNode.tsx`
- Create: `src/features/graph-editor/nodes/queryNode.css`
- Create: `src/features/graph-editor/nodes/QueryNode.test.tsx`
- Modify: `src/App.tsx`
- Test: `src/features/graph-editor/nodes/QueryNode.test.tsx`

- [ ] **Step 1: Write a failing test for compact node summaries**

```tsx
// src/features/graph-editor/nodes/QueryNode.test.tsx
import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { QueryNode } from "./QueryNode";

describe("QueryNode", () => {
  test("shows a compact summary for fromTable nodes", () => {
    render(
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
    );

    expect(screen.getByText("Orders")).toBeTruthy();
    expect(screen.getByText(/sales\.orders/)).toBeTruthy();
    expect(screen.getByText(/2 cols/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the node test to confirm failure**

Run: `bun test src/features/graph-editor/nodes/QueryNode.test.tsx`  
Expected: FAIL because `QueryNode` does not exist.

- [ ] **Step 3: Implement flow adapters and the compact node view**

```ts
// src/features/graph-editor/flowAdapter.ts
import type { Edge, Node } from "@xyflow/react";
import type { Diagnostic } from "../../domain/diagnostics/types";
import type { GraphDocument, GraphNode } from "../../domain/document/types";

export interface FlowNodeData {
  node: GraphNode;
  diagnostics: Diagnostic[];
}

export function toFlowNodes(document: GraphDocument, diagnostics: Diagnostic[]): Array<Node<FlowNodeData>> {
  return document.nodes.map(node => ({
    id: node.id,
    type: "queryNode",
    position: node.position,
    data: {
      node,
      diagnostics: diagnostics.filter(diagnostic => diagnostic.ref?.nodeId === node.id),
    },
  }));
}

export function toFlowEdges(document: GraphDocument): Edge[] {
  return document.edges.map(edge => ({
    id: edge.id,
    source: edge.source,
    sourceHandle: edge.sourceHandle,
    target: edge.target,
    targetHandle: edge.targetHandle,
  }));
}
```

```tsx
// src/features/graph-editor/nodes/QueryNode.tsx
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { formatTableRef } from "../../../domain/schema/types";
import type { FlowNodeData } from "../flowAdapter";
import "./queryNode.css";

function summaryText(data: FlowNodeData["node"]["data"], kind: FlowNodeData["node"]["kind"]) {
  switch (kind) {
    case "fromTable":
      return `${formatTableRef(data.tableRef)} · ${Object.keys(data.columns).length} cols`;
    case "graphInput":
      return `${Object.keys(data.columns).length} cols`;
    case "join":
      return `${data.joinType} join`;
    case "where":
      return data.predicate;
    case "select":
      return `${data.mappings.length} expressions`;
    case "aggregation":
      return `${data.groupBy.length} groups · ${data.aggregates.length} aggs`;
    case "sort":
      return `${data.items.length} sort keys`;
    case "limit":
      return `limit ${data.count}`;
    case "output":
      return data.outputName;
  }
}

export function QueryNode({ data, selected }: NodeProps<FlowNodeData>) {
  const hasErrors = data.diagnostics.some(diagnostic => diagnostic.level === "error");

  return (
    <div className={`query-node ${selected ? "is-selected" : ""} ${hasErrors ? "has-errors" : ""}`}>
      <Handle type="target" id="in" position={Position.Left} />
      <Handle type="target" id="left" position={Position.Left} style={{ top: 34 }} />
      <Handle type="target" id="right" position={Position.Left} style={{ top: 62 }} />
      <div className="query-node__kind">{data.node.kind}</div>
      <div className="query-node__title">{data.node.label}</div>
      <div className="query-node__summary">{summaryText(data.node.data as never, data.node.kind)}</div>
      {hasErrors ? <span className="query-node__badge">error</span> : null}
      <Handle type="source" id="out" position={Position.Right} />
    </div>
  );
}
```

```css
/* src/features/graph-editor/nodes/queryNode.css */
.query-node {
  position: relative;
  min-width: 180px;
  padding: 14px 16px;
  border: 1px solid rgba(57, 47, 35, 0.18);
  border-radius: 16px;
  background: rgba(255, 253, 248, 0.96);
  box-shadow: 0 8px 20px rgba(68, 55, 40, 0.08);
}

.query-node.is-selected {
  border-color: #9a5f19;
  box-shadow: 0 10px 26px rgba(154, 95, 25, 0.18);
}

.query-node.has-errors {
  border-color: #ae3f2f;
}

.query-node__kind {
  font-size: 11px;
  text-transform: uppercase;
  color: #8d7257;
}

.query-node__title {
  margin-top: 6px;
  font-weight: 700;
}

.query-node__summary {
  margin-top: 6px;
  font-size: 13px;
  color: #5d5248;
}

.query-node__badge {
  position: absolute;
  top: 12px;
  right: 12px;
  font-size: 11px;
  color: #ae3f2f;
}
```

- [ ] **Step 4: Implement the palette and XYFlow canvas, then mount them in the app**

```tsx
// src/features/graph-editor/NodePalette.tsx
import { useDocumentContext } from "../../app/state/DocumentContext";
import type { GraphNode, NodeKind } from "../../domain/document/types";

const paletteItems: Array<{ kind: NodeKind; label: string }> = [
  { kind: "graphInput", label: "Graph Input" },
  { kind: "fromTable", label: "From" },
  { kind: "join", label: "Join" },
  { kind: "where", label: "Where" },
  { kind: "select", label: "Select" },
  { kind: "aggregation", label: "Aggregation" },
  { kind: "sort", label: "Sort" },
  { kind: "limit", label: "Limit" },
  { kind: "output", label: "Output" },
];

function createNode(kind: NodeKind, index: number): GraphNode {
  const base = {
    id: `${kind}-${crypto.randomUUID()}`,
    kind,
    label: paletteItems.find(item => item.kind === kind)?.label ?? kind,
    position: { x: 160 + index * 24, y: 120 + index * 24 },
  } as const;

  switch (kind) {
    case "graphInput":
      return { ...base, kind, data: { columns: { id: "int" } } };
    case "fromTable":
      return { ...base, kind, data: { tableRef: { tableName: "table_name" }, columns: { id: "int" } } };
    case "join":
      return { ...base, kind, data: { joinType: "inner", predicate: "left.id = right.id" } };
    case "where":
      return { ...base, kind, data: { predicate: "id > 0" } };
    case "select":
      return { ...base, kind, data: { mappings: [{ name: "id", expression: "id" }] } };
    case "aggregation":
      return { ...base, kind, data: { groupBy: [{ name: "id", expression: "id" }], aggregates: [] } };
    case "sort":
      return { ...base, kind, data: { items: [{ expression: "id", direction: "asc" }] } };
    case "limit":
      return { ...base, kind, data: { count: 100, offset: null } };
    case "output":
      return { ...base, kind, data: { outputName: `output_${index + 1}` } };
  }
}

export function NodePalette() {
  const { state, dispatch } = useDocumentContext();

  return (
    <div>
      <h2>Nodes</h2>
      <div className="stack">
        {paletteItems.map(item => (
          <button
            key={item.kind}
            className="ghost-button"
            type="button"
            onClick={() =>
              dispatch({
                type: "add-node",
                node: createNode(item.kind, state.document.nodes.length),
              })
            }
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
```

```tsx
// src/features/graph-editor/GraphCanvas.tsx
import { Background, Controls, MiniMap, ReactFlow, type Connection, type NodeMouseHandler } from "@xyflow/react";
import type { Diagnostic } from "../../domain/diagnostics/types";
import { useDocumentContext } from "../../app/state/DocumentContext";
import { toFlowEdges, toFlowNodes } from "./flowAdapter";
import { QueryNode } from "./nodes/QueryNode";

const nodeTypes = {
  queryNode: QueryNode,
};

export function GraphCanvas({ diagnostics }: { diagnostics: Diagnostic[] }) {
  const { state, dispatch } = useDocumentContext();
  const nodes = toFlowNodes(state.document, diagnostics);
  const edges = toFlowEdges(state.document);

  const onConnect = (connection: Connection) => {
    if (!connection.source || !connection.target || !connection.sourceHandle || !connection.targetHandle) return;
    dispatch({
      type: "upsert-edge",
      edge: {
        id: `edge-${connection.source}-${connection.target}-${connection.targetHandle}`,
        source: connection.source,
        sourceHandle: connection.sourceHandle,
        target: connection.target,
        targetHandle: connection.targetHandle,
      },
    });
  };

  const onNodeClick: NodeMouseHandler = (_, node) => {
    dispatch({ type: "select-node", nodeId: node.id });
    dispatch({ type: "open-node-editor", nodeId: node.id });
  };

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      fitView
      nodeTypes={nodeTypes}
      onConnect={onConnect}
      onNodeClick={onNodeClick}
      onNodeDragStop={(_, node) =>
        dispatch({
          type: "set-node-position",
          nodeId: node.id,
          position: node.position,
        })
      }
      onMoveEnd={(_, viewport) => dispatch({ type: "set-viewport", viewport })}
    >
      <Background />
      <MiniMap />
      <Controls />
    </ReactFlow>
  );
}
```

```tsx
// src/App.tsx
import { compileOutput } from "./domain/compile/compileOutput";
import { DocumentProvider, useDocumentContext } from "./app/state/DocumentContext";
import { GraphCanvas } from "./features/graph-editor/GraphCanvas";
import { NodePalette } from "./features/graph-editor/NodePalette";

function AppLayout() {
  const { state } = useDocumentContext();
  const diagnostics = state.activeOutputId
    ? compileOutput(state.document, state.activeOutputId).semantic.diagnostics
    : [];

  return (
    <div className="app-shell">
      <aside className="pane sidebar">
        <h1>QueryVisual</h1>
        <p className="muted">Structured graph editor for DQL compilation.</p>
        <NodePalette />
      </aside>
      <main className="pane canvas-pane">
        <GraphCanvas diagnostics={diagnostics} />
      </main>
      <section className="pane debug-pane">
        <h2>Outputs</h2>
        <div className="placeholder">Compiler artifacts will appear here.</div>
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

- [ ] **Step 5: Run the node test**

Run: `bun test src/features/graph-editor/nodes/QueryNode.test.tsx`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/features/graph-editor/flowAdapter.ts src/features/graph-editor/NodePalette.tsx src/features/graph-editor/GraphCanvas.tsx src/features/graph-editor/nodes/QueryNode.tsx src/features/graph-editor/nodes/queryNode.css src/features/graph-editor/nodes/QueryNode.test.tsx src/App.tsx
git commit -m "feat: add xyflow graph canvas"
```

## Task 10: Implement The Centered Modal Editors

**Files:**
- Create: `src/features/graph-editor/NodeEditorModal.tsx`
- Create: `src/features/graph-editor/nodeEditors.tsx`
- Create: `src/features/graph-editor/NodeEditorModal.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/index.css`
- Test: `src/features/graph-editor/NodeEditorModal.test.tsx`

- [ ] **Step 1: Write the failing modal editor test**

```tsx
// src/features/graph-editor/NodeEditorModal.test.tsx
import { describe, expect, mock, test } from "bun:test";
import userEvent from "@testing-library/user-event";
import { render, screen } from "@testing-library/react";
import { NodeEditorModal } from "./NodeEditorModal";
import type { GraphNode } from "../../domain/document/types";

describe("NodeEditorModal", () => {
  test("saves updated select mappings", async () => {
    const user = userEvent.setup();
    const onSave = mock();

    const node: GraphNode = {
      id: "select-orders",
      kind: "select",
      label: "Project",
      position: { x: 0, y: 0 },
      data: {
        mappings: [{ name: "gross_total", expression: "total" }],
      },
    };

    render(<NodeEditorModal node={node} onClose={() => {}} onSave={onSave} />);

    await user.clear(screen.getByLabelText("Mapping name 1"));
    await user.type(screen.getByLabelText("Mapping name 1"), "net_total");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalled();
    expect(onSave.mock.calls[0][0].data.mappings[0].name).toBe("net_total");
  });
});
```

- [ ] **Step 2: Run the modal test to confirm failure**

Run: `bun test src/features/graph-editor/NodeEditorModal.test.tsx`  
Expected: FAIL because the modal editor components do not exist.

- [ ] **Step 3: Implement node-specific editor forms**

```tsx
// src/features/graph-editor/nodeEditors.tsx
import { useState } from "react";
import type { ColumnMap } from "../../domain/schema/types";
import type { GraphNode, NamedExpression, SortItem } from "../../domain/document/types";

function ColumnMapEditor({
  columns,
  onChange,
}: {
  columns: ColumnMap;
  onChange: (columns: ColumnMap) => void;
}) {
  const rows = Object.entries(columns);

  return (
    <div className="editor-stack">
      {rows.map(([name, type], index) => (
        <div key={name} className="mapping-row">
          <label>
            {`Column name ${index + 1}`}
            <input
              value={name}
              onChange={event => {
                const nextEntries = [...rows];
                nextEntries[index] = [event.target.value, type];
                onChange(Object.fromEntries(nextEntries));
              }}
            />
          </label>
          <label>
            Type
            <input
              value={type}
              onChange={event => {
                const nextEntries = [...rows];
                nextEntries[index] = [name, event.target.value as typeof type];
                onChange(Object.fromEntries(nextEntries));
              }}
            />
          </label>
        </div>
      ))}
    </div>
  );
}

function MappingRows({
  rows,
  onChange,
}: {
  rows: NamedExpression[];
  onChange: (rows: NamedExpression[]) => void;
}) {
  return (
    <div className="editor-stack">
      {rows.map((row, index) => (
        <div key={index} className="mapping-row">
          <label>
            {`Mapping name ${index + 1}`}
            <input
              value={row.name}
              onChange={event => {
                const next = [...rows];
                next[index] = { ...row, name: event.target.value };
                onChange(next);
              }}
            />
          </label>
          <label>
            Expression
            <textarea
              value={row.expression}
              onChange={event => {
                const next = [...rows];
                next[index] = { ...row, expression: event.target.value };
                onChange(next);
              }}
            />
          </label>
        </div>
      ))}
    </div>
  );
}

export function useEditableNode(node: GraphNode) {
  const [draft, setDraft] = useState<GraphNode>(node);
  return { draft, setDraft };
}

export function renderNodeEditor(
  draft: GraphNode,
  setDraft: (node: GraphNode) => void,
) {
  switch (draft.kind) {
    case "fromTable":
      return (
        <>
          <label>
            Table
            <input
              value={draft.data.tableRef.schemaName ? `${draft.data.tableRef.schemaName}.${draft.data.tableRef.tableName}` : draft.data.tableRef.tableName}
              onChange={event => {
                const [schemaName, tableName] = event.target.value.includes(".")
                  ? event.target.value.split(".", 2)
                  : [undefined, event.target.value];
                setDraft({
                  ...draft,
                  data: { ...draft.data, tableRef: { schemaName, tableName } },
                });
              }}
            />
          </label>
          <ColumnMapEditor
            columns={draft.data.columns}
            onChange={columns => setDraft({ ...draft, data: { ...draft.data, columns } })}
          />
        </>
      );
    case "where":
      return (
        <label>
          Predicate
          <textarea
            value={draft.data.predicate}
            onChange={event => setDraft({ ...draft, data: { predicate: event.target.value } })}
          />
        </label>
      );
    case "select":
      return (
        <MappingRows
          rows={draft.data.mappings}
          onChange={rows => setDraft({ ...draft, data: { mappings: rows } })}
        />
      );
    case "aggregation":
      return (
        <>
          <h3>Group By</h3>
          <MappingRows
            rows={draft.data.groupBy}
            onChange={rows => setDraft({ ...draft, data: { ...draft.data, groupBy: rows } })}
          />
          <h3>Aggregates</h3>
          <MappingRows
            rows={draft.data.aggregates}
            onChange={rows => setDraft({ ...draft, data: { ...draft.data, aggregates: rows } })}
          />
        </>
      );
    case "sort":
      return (
        <div className="editor-stack">
          {draft.data.items.map((item: SortItem, index: number) => (
            <div key={index} className="mapping-row">
              <label>
                Expression
                <input
                  value={item.expression}
                  onChange={event => {
                    const next = [...draft.data.items];
                    next[index] = { ...item, expression: event.target.value };
                    setDraft({ ...draft, data: { items: next } });
                  }}
                />
              </label>
              <label>
                Direction
                <select
                  value={item.direction}
                  onChange={event => {
                    const next = [...draft.data.items];
                    next[index] = { ...item, direction: event.target.value as "asc" | "desc" };
                    setDraft({ ...draft, data: { items: next } });
                  }}
                >
                  <option value="asc">asc</option>
                  <option value="desc">desc</option>
                </select>
              </label>
            </div>
          ))}
        </div>
      );
    case "limit":
      return (
        <>
          <label>
            Limit
            <input
              type="number"
              value={draft.data.count}
              onChange={event => setDraft({ ...draft, data: { ...draft.data, count: Number(event.target.value) } })}
            />
          </label>
          <label>
            Offset
            <input
              type="number"
              value={draft.data.offset ?? 0}
              onChange={event =>
                setDraft({
                  ...draft,
                  data: {
                    ...draft.data,
                    offset: event.target.value === "" ? null : Number(event.target.value),
                  },
                })
              }
            />
          </label>
        </>
      );
    case "output":
      return (
        <label>
          Output name
          <input
            value={draft.data.outputName}
            onChange={event => setDraft({ ...draft, data: { outputName: event.target.value } })}
          />
        </label>
      );
    case "join":
      return (
        <>
          <label>
            Join type
            <select
              value={draft.data.joinType}
              onChange={event =>
                setDraft({
                  ...draft,
                  data: { ...draft.data, joinType: event.target.value as typeof draft.data.joinType },
                })
              }
            >
              <option value="inner">inner</option>
              <option value="left">left</option>
              <option value="right">right</option>
              <option value="full">full</option>
            </select>
          </label>
          <label>
            Predicate
            <textarea
              value={draft.data.predicate}
              onChange={event => setDraft({ ...draft, data: { ...draft.data, predicate: event.target.value } })}
            />
          </label>
        </>
      );
    case "graphInput":
      return (
        <ColumnMapEditor
          columns={draft.data.columns}
          onChange={columns => setDraft({ ...draft, data: { columns } })}
        />
      );
  }
}
```

- [ ] **Step 4: Implement the centered modal and mount it in the app**

```tsx
// src/features/graph-editor/NodeEditorModal.tsx
import { useEditableNode, renderNodeEditor } from "./nodeEditors";
import type { GraphNode } from "../../domain/document/types";

export function NodeEditorModal({
  node,
  onClose,
  onSave,
}: {
  node: GraphNode;
  onClose: () => void;
  onSave: (node: GraphNode) => void;
}) {
  const { draft, setDraft } = useEditableNode(node);

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal-card" role="dialog" aria-modal="true" onClick={event => event.stopPropagation()}>
        <header className="modal-header">
          <div>
            <div className="modal-kind">{node.kind}</div>
            <h2>{node.label}</h2>
          </div>
        </header>

        <section className="modal-body">{renderNodeEditor(draft, setDraft)}</section>

        <footer className="modal-footer">
          <button type="button" className="ghost-button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="solid-button" onClick={() => onSave(draft)}>
            Save
          </button>
        </footer>
      </div>
    </div>
  );
}
```

```css
/* src/index.css additions */
.modal-backdrop {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(20, 16, 11, 0.42);
  backdrop-filter: blur(4px);
}

.modal-card {
  width: min(760px, calc(100vw - 48px));
  max-height: calc(100vh - 64px);
  overflow: auto;
  padding: 24px;
  border-radius: 20px;
  background: #fffdf8;
  box-shadow: 0 24px 60px rgba(28, 21, 14, 0.28);
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 20px;
}

.editor-stack,
.mapping-row {
  display: grid;
  gap: 12px;
}

.ghost-button,
.solid-button {
  border-radius: 999px;
  padding: 10px 16px;
}

.solid-button {
  background: #1f1d1a;
  color: white;
}
```

```tsx
// src/App.tsx (replace AppLayout)
import { compileOutput } from "./domain/compile/compileOutput";
import { DocumentProvider, useDocumentContext } from "./app/state/DocumentContext";
import { GraphCanvas } from "./features/graph-editor/GraphCanvas";
import { NodeEditorModal } from "./features/graph-editor/NodeEditorModal";
import { NodePalette } from "./features/graph-editor/NodePalette";

function AppLayout() {
  const { state, dispatch } = useDocumentContext();
  const editedNode = state.document.nodes.find(node => node.id === state.editorNodeId) ?? null;
  const compileResult = state.activeOutputId ? compileOutput(state.document, state.activeOutputId) : null;
  const diagnostics = compileResult?.semantic.diagnostics ?? [];

  return (
    <div className="app-shell">
      <aside className="pane sidebar">
        <h1>QueryVisual</h1>
        <p className="muted">Structured graph editor for DQL compilation.</p>
        <NodePalette />
      </aside>
      <main className="pane canvas-pane">
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
          onSave={node => {
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
```

- [ ] **Step 5: Run the modal test**

Run: `bun test src/features/graph-editor/NodeEditorModal.test.tsx`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/features/graph-editor/NodeEditorModal.tsx src/features/graph-editor/nodeEditors.tsx src/features/graph-editor/NodeEditorModal.test.tsx src/index.css src/App.tsx
git commit -m "feat: add node editor modal"
```

## Task 11: Add The Debug Panel And Local JSON Save/Load

**Files:**
- Create: `src/features/debug/DebugPanel.tsx`
- Create: `src/features/debug/DebugPanel.test.tsx`
- Create: `src/features/document-storage/fileIO.ts`
- Create: `src/features/document-storage/fileIO.test.ts`
- Create: `src/features/document-storage/DocumentToolbar.tsx`
- Modify: `src/App.tsx`
- Test: `src/features/debug/DebugPanel.test.tsx`
- Test: `src/features/document-storage/fileIO.test.ts`

- [ ] **Step 1: Write failing tests for debug tabs and file serialization**

```tsx
// src/features/debug/DebugPanel.test.tsx
import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { createSampleDocument } from "../../domain/document/sample";
import { compileOutput } from "../../domain/compile/compileOutput";
import { DebugPanel } from "./DebugPanel";

describe("DebugPanel", () => {
  test("shows generated SQL in the SQL tab", () => {
    const result = compileOutput(createSampleDocument(), "output-orders");
    render(
      <DebugPanel
        result={result}
        outputs={[{ id: "output-orders", name: "orders_report" }]}
        activeOutputId="output-orders"
        onSelectOutput={() => {}}
      />,
    );

    expect(screen.getByRole("tab", { name: "SQL" })).toBeTruthy();
    expect(screen.getByText(/SELECT/i)).toBeTruthy();
  });
});
```

```ts
// src/features/document-storage/fileIO.test.ts
import { describe, expect, test } from "bun:test";
import { createSampleDocument } from "../../domain/document/sample";
import { parseDocumentJson, serializeDocumentJson } from "./fileIO";

describe("fileIO", () => {
  test("round-trips graph documents as JSON", () => {
    const source = createSampleDocument();
    const parsed = parseDocumentJson(serializeDocumentJson(source));

    expect(parsed.metadata.name).toBe(source.metadata.name);
    expect(parsed.nodes).toHaveLength(source.nodes.length);
  });
});
```

- [ ] **Step 2: Run the tests to confirm failure**

Run: `bun test src/features/debug/DebugPanel.test.tsx src/features/document-storage/fileIO.test.ts`  
Expected: FAIL because the debug and file modules are missing.

- [ ] **Step 3: Implement document serialization helpers**

```ts
// src/features/document-storage/fileIO.ts
import type { GraphDocument } from "../../domain/document/types";

export function serializeDocumentJson(document: GraphDocument) {
  return JSON.stringify(document, null, 2);
}

export function parseDocumentJson(raw: string): GraphDocument {
  const parsed = JSON.parse(raw) as GraphDocument;
  if (parsed.version !== 1 || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
    throw new Error("Invalid QueryVisual document");
  }
  return parsed;
}

export function downloadDocument(graphDocument: GraphDocument) {
  const blob = new Blob([serializeDocumentJson(graphDocument)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = `${graphDocument.metadata.name || "queryvisual"}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 4: Implement the debug tabs and the document toolbar, then wire them into the app**

```tsx
// src/features/debug/DebugPanel.tsx
import { useState } from "react";
import type { CompileOutputResult } from "../../domain/compile/compileOutput";

const tabs = ["Diagnostics", "Semantic", "IR", "Optimized IR", "SQL"] as const;

export function DebugPanel({
  result,
  outputs,
  activeOutputId,
  onSelectOutput,
}: {
  result: CompileOutputResult | null;
  outputs: Array<{ id: string; name: string }>;
  activeOutputId: string | null;
  onSelectOutput: (outputId: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]>("SQL");

  const content = (() => {
    if (!result) return "Select an output node to compile.";
    switch (activeTab) {
      case "Diagnostics":
        return JSON.stringify(result.semantic.diagnostics, null, 2);
      case "Semantic":
        return JSON.stringify(result.semantic, null, 2);
      case "IR":
        return JSON.stringify(result.ir, null, 2);
      case "Optimized IR":
        return JSON.stringify(result.optimizedIr, null, 2);
      case "SQL":
        return result.sql;
    }
  })();

  return (
    <div className="debug-panel">
      <div className="output-switcher">
        {outputs.map(output => (
          <button
            key={output.id}
            type="button"
            className={activeOutputId === output.id ? "solid-button" : "ghost-button"}
            onClick={() => onSelectOutput(output.id)}
          >
            {output.name}
          </button>
        ))}
      </div>
      <div className="tab-row" role="tablist" aria-label="Compiler artifacts">
        {tabs.map(tab => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>
      <pre className="debug-output">{content}</pre>
    </div>
  );
}
```

```tsx
// src/features/document-storage/DocumentToolbar.tsx
import { useRef } from "react";
import { useDocumentContext } from "../../app/state/DocumentContext";
import { downloadDocument, parseDocumentJson } from "./fileIO";

export function DocumentToolbar() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { state, dispatch } = useDocumentContext();

  return (
    <div className="toolbar-row">
      <button type="button" className="ghost-button" onClick={() => downloadDocument(state.document)}>
        Save JSON
      </button>
      <button type="button" className="ghost-button" onClick={() => fileInputRef.current?.click()}>
        Load JSON
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        hidden
        onChange={async event => {
          const file = event.target.files?.[0];
          if (!file) return;
          const raw = await file.text();
          dispatch({ type: "replace-document", document: parseDocumentJson(raw) });
        }}
      />
    </div>
  );
}
```

```tsx
// src/App.tsx (replace debug pane contents)
import { compileOutput } from "./domain/compile/compileOutput";
import { DocumentProvider, useDocumentContext } from "./app/state/DocumentContext";
import { GraphCanvas } from "./features/graph-editor/GraphCanvas";
import { NodeEditorModal } from "./features/graph-editor/NodeEditorModal";
import { NodePalette } from "./features/graph-editor/NodePalette";
import { DebugPanel } from "./features/debug/DebugPanel";
import { DocumentToolbar } from "./features/document-storage/DocumentToolbar";

function AppLayout() {
  const { state, dispatch } = useDocumentContext();
  const editedNode = state.document.nodes.find(node => node.id === state.editorNodeId) ?? null;
  const outputs = state.document.nodes
    .filter(node => node.kind === "output")
    .map(node => ({ id: node.id, name: node.data.outputName }));
  const compileResult = state.activeOutputId ? compileOutput(state.document, state.activeOutputId) : null;
  const diagnostics = compileResult?.semantic.diagnostics ?? [];

  return (
    <div className="app-shell">
      <aside className="pane sidebar">
        <h1>QueryVisual</h1>
        <p className="muted">Structured graph editor for DQL compilation.</p>
        <DocumentToolbar />
        <NodePalette />
      </aside>
      <main className="pane canvas-pane">
        <GraphCanvas diagnostics={diagnostics} />
      </main>
      <section className="pane debug-pane">
        <h2>Outputs</h2>
        <DebugPanel
          result={compileResult}
          outputs={outputs}
          activeOutputId={state.activeOutputId}
          onSelectOutput={outputId => dispatch({ type: "set-active-output", nodeId: outputId })}
        />
      </section>
      {editedNode ? (
        <NodeEditorModal
          node={editedNode}
          onClose={() => dispatch({ type: "open-node-editor", nodeId: null })}
          onSave={node => {
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
```

- [ ] **Step 5: Run the debug and file tests**

Run: `bun test src/features/debug/DebugPanel.test.tsx src/features/document-storage/fileIO.test.ts`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/features/debug/DebugPanel.tsx src/features/debug/DebugPanel.test.tsx src/features/document-storage/fileIO.ts src/features/document-storage/fileIO.test.ts src/features/document-storage/DocumentToolbar.tsx src/App.tsx
git commit -m "feat: add compiler debug panel and file io"
```

## Task 12: Add Integration Coverage And Developer Docs

**Files:**
- Modify: `README.md`
- Create: `src/features/integration/appFlow.test.tsx`
- Test: `src/features/integration/appFlow.test.tsx`

- [ ] **Step 1: Write the failing integration test**

```tsx
// src/features/integration/appFlow.test.tsx
import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { App } from "../../App";

describe("App integration", () => {
  test("shows generated SQL for the sample output", () => {
    render(<App />);

    expect(screen.getByRole("tab", { name: "SQL" })).toBeTruthy();
    expect(screen.getByText(/FROM sales\.orders/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the integration test to confirm failure**

Run: `bun test src/features/integration/appFlow.test.tsx`  
Expected: FAIL because the app shell does not yet surface the compiled SQL from the sample output.

- [ ] **Step 3: Tighten the app shell and write the README**

```md
<!-- README.md -->
# QueryVisual

QueryVisual is a Bun + React + XYFlow single-page app for building relational query graphs and compiling them into ANSI SQL through a validation, IR, and optimization pipeline.

## Commands

- `bun run dev` starts the Bun server with HMR
- `bun test` runs the test suite
- `bun run build` builds the browser assets into `dist/`
- `bun run start` serves the production build

## Current Scope

- structured node graph editing
- centered modal editors
- local JSON save/load
- semantic graph validation
- IR lowering and optimizer inspection
- ANSI SQL rendering
```

- [ ] **Step 4: Run the full verification suite**

Run: `bun test`  
Expected: PASS

Run: `bun run build`  
Expected: PASS

Run: `git status --short`  
Expected: only the intended source, test, and README changes are present.

- [ ] **Step 5: Commit**

```bash
git add README.md src/features/integration/appFlow.test.tsx
git commit -m "docs: add developer guide and integration coverage"
```
