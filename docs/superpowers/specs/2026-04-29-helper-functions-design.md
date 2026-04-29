# Helper Functions Node Design

## Goal

Add reusable pure expression helpers to a graph so users can define formulas once
and call them from select, aggregation, predicate, sort, and other expression
fields.

The feature should behave like lightweight graph-local utility functions:

- helper definitions are explicit nodes on the canvas
- imports decide which helper sets are available to the graph
- helpers can be called as normal expression functions
- helpers expand to SQL inline during compilation
- helper dependencies are allowed, but recursive dependencies are invalid

## Scope

This design adds:

- a `helperFunctions` node kind
- an `importHelperFunctions` node kind
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
- `helperFunctions` nodes have one output handle.
- `importHelperFunctions` nodes have one input handle and no output handle.
- Importers affect the whole graph they are located in, not only downstream
  relational nodes.
- Importers may set an optional `moduleName`.
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

The feature should use two node kinds:

1. `helperFunctions` defines a set of helper rows.
2. `importHelperFunctions` imports a connected helper set into the current graph.

The importer is intentionally non-relational. It has no output handle and does
not participate in data flow. Its only job is to make helper definitions
available to expression analysis and SQL rendering for the graph.

This keeps graph semantics explicit:

- a helper set sitting on the canvas does nothing until imported
- deleting an importer removes those helpers from the graph's expression scope
- module naming lives on the importer, because the same helper set may be
  imported under different modules in future workflows

## Data Model

Extend node kinds conceptually:

```ts
type NodeKind =
  | ExistingNodeKind
  | "helperFunctions"
  | "importHelperFunctions";
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
    helpers: HelperFunctionDefinition[];
  }
>;

type ImportHelperFunctionsNode = GraphNodeBase<
  "importHelperFunctions",
  {
    moduleName: string;
  }
>;
```

`moduleName` is stored as a string. An empty string means the import has no
module qualifier.

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

For each graph, build a helper registry from all structurally valid
`importHelperFunctions` nodes:

1. find the single incoming edge to the importer's `in` handle
2. require the source node to be a `helperFunctions` node
3. trim the importer's `moduleName`
4. add each helper row from the connected helper set to the registry

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

Named modules do not hide unqualified access. A helper imported as `math.add10`
is also callable as `add10(...)` when no other imported helper shares `add10`.

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

- importer missing its helper input
- importer connected to a non-`helperFunctions` node
- duplicate qualified helper definitions for the same module and name
- invalid helper names
- invalid module names
- invalid helper body expressions
- placeholder use outside helper bodies
- `$0` placeholder use
- helper calls with the wrong number of arguments
- ambiguous unqualified helper calls
- recursive helper dependencies

Importer nodes should not require output wiring. Helper nodes should not require
their output to be consumed unless referenced by an importer.

## UI

Add palette entries:

- `Helper Functions`
- `Import Helpers`

Node handles:

- `helperFunctions`: source handle `out`, no target handle
- `importHelperFunctions`: target handle `in`, no source handle

Node summaries:

- `helperFunctions`: number of helper rows
- `importHelperFunctions`: module name when set, otherwise imported helper count

Editors:

- `helperFunctions` uses draggable rows matching select and aggregation style
  with helper name and helper expression fields
- `importHelperFunctions` has a `moduleName` text field

Expression suggestions may include imported helper names and qualified helper
names as a follow-up improvement. It is not required for the initial functional
implementation.

## Testing

Domain tests should cover:

- helper registry construction from importer nodes
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
- importer editor saves `moduleName`
- canvas handles match the required directionality

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
