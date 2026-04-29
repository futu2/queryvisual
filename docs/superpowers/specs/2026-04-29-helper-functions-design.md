# Helper Functions Node Design

## Goal

Add reusable pure expression helpers to a graph so users can define formulas once
and call them from select, aggregation, predicate, sort, and other expression
fields.

The feature should behave like lightweight graph-local utility functions:

- helper definitions are explicit nodes on the canvas
- helper nodes are automatically available to the graph they are located in
- a separate graph-import node can import helpers from another local graph
- helpers can be called as normal expression functions
- helpers expand to SQL inline during compilation
- helper dependencies are allowed, but recursive dependencies are invalid

## Scope

This design adds:

- a `helperFunctions` node kind
- an `importGraphHelpers` node kind
- graph-scoped helper import resolution
- optional helper module names for disambiguation
- helper placeholders such as `$1` and `$2`
- helper call validation, arity checks, and recursion detection
- SQL expansion of helper calls

This design does not add:

- runtime JavaScript execution
- side effects or non-deterministic helper functions
- user-defined argument names
- helper return type declarations
- package-level helper exports independent of graph packages

## Approved Decisions

- `helperFunctions` nodes define helper rows.
- `helperFunctions` nodes have no input or output handles.
- `helperFunctions` nodes affect the whole graph they are located in, not only
  downstream relational nodes.
- `helperFunctions` nodes may set an optional `moduleName`.
- `importGraphHelpers` nodes import helpers from another local graph or from
  an installed package graph export.
- `importGraphHelpers` nodes have no input or output handles.
- `importGraphHelpers` nodes may set an optional `moduleName` alias.
- Named-module imports expose both qualified calls, such as `math.add10(...)`,
  and unqualified calls when the helper name is unique.
- Helper definitions may call other imported helpers in the same graph.
- Direct and indirect recursive helper calls are invalid.
- Helper functions are pure and have fixed arity inferred from placeholders.

## Current Context

The app already has expression-bearing nodes:

- `where` stores a predicate expression
- `join` stores a predicate expression
- `select` stores named expression mappings
- `aggregation` stores group and aggregate expression rows
- `sort` stores sort expression rows

Expressions currently support normal function calls such as `sum(x)`. Unknown
calls infer `unknown` type and render directly as SQL calls. There is no
graph-level helper registry and no placeholder syntax.

## Chosen Model

The feature should use two active node kinds:

1. `helperFunctions` defines a set of helper rows.
2. `importGraphHelpers` imports helper definitions from another local graph or
   from an installed package export.

Both node kinds are intentionally non-relational. They have no dataflow handles
and do not participate in row flow. Their only job is to make helper definitions
available to expression analysis and SQL rendering for the graph.

This keeps graph semantics explicit:

- a helper set on the canvas is available to its containing graph
- deleting a helper node removes those helpers from that graph's expression scope
- local helper libraries are modeled as normal graphs and imported explicitly
- graph import module aliases can disambiguate helpers from multiple libraries

## Data Model

Extend node kinds conceptually:

```ts
type NodeKind =
  | ExistingNodeKind
  | "helperFunctions"
  | "importGraphHelpers";
```

Add helper rows:

```ts
interface HelperFunctionDefinition {
  name: string;
  expression: string;
}
```

Add nodes:

```ts
type HelperFunctionsNode = GraphNodeBase<
  "helperFunctions",
  {
    moduleName: string;
    helpers: HelperFunctionDefinition[];
  }
>;

type ImportGraphHelpersNode = GraphNodeBase<
  "importGraphHelpers",
  {
    graphId: string;
    target?: SubgraphTarget;
    moduleName: string;
  }
>;
```

`moduleName` is stored as a string. An empty string means the helper set has no
module qualifier. On `importGraphHelpers`, a non-empty `moduleName` aliases all
imported helpers under that module; an empty alias preserves the modules defined
by helper nodes in the imported graph.

## Helper Syntax

Helper definitions use placeholder references:

```text
add10 = $1 + $2 + 10
```

The highest placeholder index defines fixed arity:

- `$1 + 10` has arity `1`
- `$1 + $2 + 10` has arity `2`
- `10` has arity `0`

Placeholders are one-based. `$0` is invalid.

Helper names and module names should use expression identifier syntax:

- helper name: `add10`
- module name: `math`
- qualified call: `math.add10(...)`

Names must match `[A-Za-z_][A-Za-z0-9_]*`. Dotted names are not valid helper
or module names; the dot is reserved for module qualification.

Normal graph expressions call helpers using function-call syntax:

```text
add10(price, tax)
math.add10(price, tax)
```

Placeholder references are valid only inside helper definitions. A normal graph
expression containing `$1` should produce a parse or validation error.

## Import Resolution

For each graph, build a helper registry from:

1. every `helperFunctions` node in the graph
2. every structurally valid `importGraphHelpers` node in the graph

Each imported helper receives:

- helper name
- optional module name
- defining node id
- row index
- expression
- inferred arity

Qualified calls resolve by `moduleName + helper name`.

Unqualified calls resolve by helper name:

- if exactly one imported helper has the name, it resolves
- if no imported helper has the name, it remains a built-in or SQL function call
  according to existing expression behavior
- if multiple imported helpers have the name, validation reports an ambiguous
  helper call

Named modules do not hide unqualified access. A helper defined as `math.add10`
is also callable as `add10(...)` when no other imported helper shares `add10`.

`importGraphHelpers` nodes:

1. require a workspace context
2. support source mode `local graph` or `installed package`
3. for local graph imports, require `graphId` to point at another local graph
4. for package imports, require `target` to identify an installed package export
5. resolve package imports through the package export, not private package graph ids
6. build the source graph's helper registry
7. import all source helpers into the current graph
8. apply the import node's `moduleName` as an alias when non-empty

For package imports, the exported package graph acts as the helper library graph.
This keeps package helper imports aligned with package subgraph imports: package
exports are the public API boundary, while package-internal graph ids remain an
implementation detail.

Helper graph imports are dependencies between local graphs only when they target
local graphs. Package helper imports are package dependencies and should not
block deletion of unrelated local graphs with the same graph id.
Cycles through local subgraph references or local helper imports are invalid.

## Helper Dependencies

Helper definitions may call any helper imported into the same graph, including
helpers from other helper sets and modules.

Dependency resolution uses the same qualified and unqualified rules as normal
expressions. For example:

```text
gross = subtotal($1) + tax($1)
gross = sales.subtotal($1) + tax($1)
```

Validation should build a helper dependency graph from resolved helper calls and
reject cycles:

- direct recursion: `a($1) = a($1) + 1`
- indirect recursion: `a($1) = b($1)`, `b($1) = a($1)`

When recursion exists, SQL rendering should not run for the affected output
because semantic validation has errors.

## Type Inference

Helper return type should be inferred from the helper body expression.

During helper-body inference:

- placeholders are available as unknown-typed values
- imported helper calls can contribute their inferred return type when known
- recursive or invalid helpers infer `unknown`

During normal expression inference:

- a resolved helper call returns the inferred return type
- wrong arity returns `unknown` and reports a diagnostic
- ambiguous calls return `unknown` and report a diagnostic

This keeps helper typing useful without requiring users to declare argument
types.

## SQL Expansion

SQL rendering should expand resolved helper calls inline.

Example helper:

```text
add10 = $1 + $2 + 10
```

Example call:

```text
add10(a, b)
```

Rendered SQL:

```sql
((a + b) + 10)
```

Nested helpers expand recursively after validation confirms no cycles.

Unresolved function calls should continue to render through the existing SQL
function-call path, preserving current behavior for SQL built-ins.

## Validation

Validation should report errors for:

- graph helper import without a selected graph
- graph helper import without workspace context
- graph helper import that references a missing graph
- graph helper import that references a missing installed package export
- graph helper import cycles
- duplicate qualified helper definitions for the same module and name
- invalid helper names
- invalid module names
- invalid helper body expressions
- placeholder use outside helper bodies
- `$0` placeholder use
- helper calls with the wrong number of arguments
- ambiguous unqualified helper calls
- recursive helper dependencies

Helper nodes and graph helper import nodes should not require any relational
wiring.

## UI

Add palette entries:

- `Helper Functions`
- `Import Graph Helpers`

Node handles:

- `helperFunctions`: no source handle, no target handle
- `importGraphHelpers`: no source handle, no target handle

Node summaries:

- `helperFunctions`: number of helper rows
- `importGraphHelpers`: module name when set, otherwise graph helper import

Editors:

- `helperFunctions` uses draggable rows matching select and aggregation style
  with module name, helper name, and helper expression fields
- `importGraphHelpers` has a helper graph selector and optional `moduleName`
  alias field
- `importGraphHelpers` supports local/package source selection matching the
  package export selector used by subgraph nodes

Expression suggestions may include imported helper names and qualified helper
names as a follow-up improvement. It is not required for the initial functional
implementation.

## Testing

Domain tests should cover:

- helper registry construction from helper nodes
- helper registry construction from local graph helper imports
- helper registry construction from installed package helper imports
- module-qualified and unqualified resolution
- ambiguity diagnostics
- arity diagnostics
- helper body parsing with placeholders
- placeholder rejection in normal expressions
- nested helper SQL expansion
- direct and indirect recursion diagnostics

UI tests should cover:

- palette entries create the new nodes
- helper editor can add, edit, duplicate, reorder, and remove rows
- graph helper import editor saves `graphId` and `moduleName`
- canvas handles are absent for helper metadata nodes

Compiler tests should cover:

- select expressions using helpers
- aggregation expressions using helpers
- predicates using helpers
- SQL built-in calls still rendering unchanged when no helper resolves

## Open Follow-Ups

- Add autocomplete suggestions for imported helpers.
- Consider package-export behavior for helper sets after graph packages expose a
  stable helper interface.
- Consider named arguments only if positional placeholders become hard to read
  in larger helper bodies.
