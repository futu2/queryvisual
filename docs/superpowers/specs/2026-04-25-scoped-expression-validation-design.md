# Scoped Expression Validation Design

## Summary

Add scope-aware expression analysis and editor assistance for all current and
future expression-bearing node fields.

The system should validate expressions against the columns visible from a node's
incoming edges, infer expression types with more specific diagnostics, and offer
live column-name autocomplete inside the centered node editor modal.

This is a shared-contract change, not a one-off patch for `select` or `where`.
Every expression field should use the same domain analysis and the same UI
editor behavior.

## Goals

- Validate expressions against the columns actually visible to the edited node
- Detect missing column references and ambiguous bare-name references
- Keep existing type checks and make them more specific where possible
- Provide live column-name autocomplete while typing in the modal
- Use stable scope prefixes that are easy to complete:
  - single-input nodes: `input.<col>`
  - join nodes: `left.<col>` and `right.<col>`
- Still allow bare column names when they are unambiguous
- Keep Save enabled even when expressions are invalid
- Reuse one shared editor contract for current and future expression fields

## Non-Goals

- Replacing the current expression language with a full code editor
- Adding SQL-function documentation, lint rules, or formatting in this change
- Allowing expressions to reference other rows defined in the same `select` or
  `aggregation` node
- Changing the persisted graph document shape for expressions
- Building reusable graph-as-node semantics in this change

## Current Context

The current codebase has three partial pieces of expression behavior:

- `src/domain/expr/parser.ts` parses expressions into AST form
- `src/domain/expr/infer.ts` infers result types from the AST and a flat scope
- `src/domain/graph/validate.ts` uses those two modules during output
  validation, but it currently reports only broad errors such as
  `*.invalid-expression` and predicate boolean failures

The node modal currently renders raw `textarea` and `input` fields from
`src/features/graph-editor/nodeEditors.tsx` without scope-aware validation or
autocomplete.

As a result:

- modal editing has no live feedback
- missing columns are not distinguished from other invalid expressions
- ambiguous names after joins are not surfaced explicitly
- future expression fields would likely reimplement the same logic again unless
  the feature is structured around shared domain and UI modules

## Chosen Approach

Introduce two shared layers:

1. A domain-level expression analysis layer that resolves visible names from a
   node's incoming edges, parses expressions, resolves references, infers types,
   and produces structured diagnostics plus autocomplete suggestions
2. A shared UI-level expression field component that uses that analysis layer
   live while the user types and renders inline diagnostics and completion
   choices

The compiler and modal should use the same rules. The modal is not allowed to
invent a looser or stricter expression model than the compiler.

## Scope Model

### Single-Input Nodes

Nodes with a single upstream input, including current `where`, `select`,
`aggregation`, `sort`, and future single-input expression nodes, expose:

- `input.<col>` for every column in the input schema
- bare `<col>` for every column in the input schema

Examples:

- `input.total`
- `total`
- `input.customer_id`

The `input.` namespace exists even when bare names are available because it is
stable for autocomplete and remains clear when expressions get longer.

### Join Nodes

Join predicates expose:

- `left.<col>` for columns coming from the left input edge
- `right.<col>` for columns coming from the right input edge
- bare `<col>` only when exactly one visible side defines that column name

Examples:

- `left.id = right.id`
- `status = right.status_code` is valid only if bare `status` is unique in the
  combined join scope

If both sides expose `id`, then bare `id` is invalid and must produce an
ambiguity diagnostic that instructs the user to qualify it with `left.` or
`right.`.

### Same-Node References

Expressions may only reference upstream scope from input edges.

This means:

- `select` mappings cannot reference other mapping names from the same node
- `aggregation` `groupBy` and `aggregates` cannot reference names declared by
  sibling rows in the same node
- future node-local derived names remain out of scope unless explicitly added in
  a later design

This keeps analysis simple, keeps evaluation order predictable, and matches the
user's explicit choice.

## Diagnostic Model

The new analysis layer should produce structured diagnostics that are more
specific than the current generic parse failure path.

### Diagnostic Categories

- parse error
- unknown column reference
- ambiguous bare column reference
- predicate not boolean
- unsupported function or unsupported expression form, if the parser or
  inference layer cannot recognize it
- generic type mismatch when the expression language can parse but cannot assign
  a meaningful result type

### Diagnostic Behavior

- Diagnostics stay attached to the node and field where they originate
- Save remains enabled even when diagnostics exist
- Invalid expressions should continue to make the node appear invalid in the
  graph and compiler output
- Inline modal diagnostics should use the same messages or close paraphrases of
  compiler diagnostics so the user does not get two conflicting explanations for
  the same expression

Examples:

- `Unknown column "totl" in input scope.`
- `Ambiguous column "id"; use left.id or right.id.`
- `Where predicate must be boolean.`

## Autocomplete Behavior

Autocomplete should be prefix-oriented and scope-aware.

### Suggestion Sources

- namespace prefixes:
  - `input.`
  - `left.`
  - `right.`
- fully qualified columns:
  - `input.total`
  - `left.id`
  - `right.customer_id`
- bare column names when valid in the current scope:
  - `total`
  - `status`

### Suggestion Rules

- Suggestions update live while typing
- Suggestions are filtered from the current token prefix near the caret
- Single-input nodes should suggest `input.` and input columns
- Join nodes should suggest `left.`, `right.`, and any bare names that are
  unambiguous
- Ambiguous bare names must not be offered as plain-name autocomplete choices
- Selecting a suggestion inserts it at the current cursor position

Examples:

- typing `inp` suggests `input.`
- typing `input.t` suggests `input.total`
- typing `le` in a join suggests `left.`
- typing `right.c` suggests `right.customer_id`

## Modal UX

All expression-bearing fields should use one shared expression input component.

That component should:

- accept the raw string value
- know the edited node id and expression role
- resolve scope from the current graph document and incoming edges
- show live inline diagnostics under the field
- show autocomplete suggestions while typing
- preserve the current Save behavior of the modal

### Fields Covered Now

The first implementation should move all current expression fields onto this
contract:

- `join.predicate`
- `where.predicate`
- `select` mapping expressions
- `aggregation` `groupBy` expressions
- `aggregation` aggregate expressions
- `sort` item expressions

This change should also establish the reusable API for future expression fields
instead of hard-coding logic to the current node set.

### Save Behavior

- Save is always allowed
- Invalid expressions remain in the draft and persist if the user saves
- The node keeps compiler diagnostics after save
- The modal should not silently rewrite or drop invalid expressions

## Domain Architecture

### New Shared Scope Builder

Add a graph-level helper, likely in
`src/domain/graph/expressionScope.ts`, that resolves visible names for a node
without requiring the node to be the active output.

Responsibilities:

- inspect incoming edges for a node
- load upstream schemas from source nodes
- construct namespaced and bare-name visibility maps
- track ambiguity for bare names
- expose autocomplete-friendly entries

This module should operate on the document graph and node id directly so the
modal can use it for any edited node, even if that node is not part of the
currently selected output path.

### New Shared Expression Analysis

Add a shared analyzer, likely in `src/domain/expr/analyze.ts`.

Responsibilities:

- parse the expression
- resolve all column references against the scope builder output
- infer the result type
- collect structured diagnostics
- produce autocomplete entries derived from scope

The current `infer.ts` logic can remain part of the implementation, but it is no
longer sufficient by itself because it only returns a type and silently falls
back to `unknown` for unresolved names.

The analyzer should make unresolved and ambiguous names explicit before or during
type inference.

### Validation Integration

`src/domain/graph/validate.ts` should switch from directly calling
`parseExpression` and `inferExpressionType` to using the shared analyzer.

This ensures:

- compiler diagnostics and modal diagnostics share the same rules
- the richer diagnostic categories are available in graph validation
- boolean predicate checks for `join` and `where` remain enforced on top of the
  analyzer result

## UI Architecture

### Shared Editor Component

Add a shared component, likely
`src/features/graph-editor/ExpressionInput.tsx`, that encapsulates:

- current text input
- caret-aware suggestion filtering
- inline diagnostics rendering
- suggestion click or keyboard insertion

The component should stay intentionally modest:

- no syntax highlighting
- no custom parser in the browser
- no heavy virtualized editor

This keeps the change aligned with the current modal and avoids building a full
language IDE.

### Node Editor Integration

`src/features/graph-editor/nodeEditors.tsx` should replace raw expression
`textarea` and `input` elements with the shared component in every relevant
section.

The modal shell in `src/features/graph-editor/NodeEditorModal.tsx` should remain
centered and keep the current Save/Cancel semantics.

The editor component will need access to the current document graph. The cleanest
choice is to let the modal or the node editor layer read the document from
`DocumentContext` and pass the minimum required analysis props down to the shared
expression component.

## Error Handling

The new analysis path should degrade safely when scope or syntax is incomplete.

Examples:

- missing input edge:
  - autocomplete falls back to an empty suggestion list
  - diagnostics explain that the node has no usable input scope
- malformed expression:
  - diagnostics show the parse failure
  - autocomplete still uses the scope entries available for that node
- unknown column:
  - expression remains editable and savable
  - type inference result should be `unknown`, but the user should also get the
    specific unknown-column diagnostic

The UI should never throw because an edited node is partially wired or currently
invalid.

## Testing

### Domain Tests

Add focused tests for:

- single-input scope exposes both `input.<col>` and bare `<col>`
- join scope exposes `left.<col>` and `right.<col>`
- bare names are accepted when unique
- bare names are rejected when ambiguous after a join
- unknown columns produce specific diagnostics
- boolean predicate nodes still reject non-boolean expressions
- same-node references in `select` and `aggregation` are rejected because they
  are not part of upstream scope

These tests should live close to the new scope/analyzer modules and continue to
exercise `validateOutput` where integration matters.

### Modal Tests

Add UI tests covering:

- inline diagnostics appear while typing an invalid column name
- join predicates suggest `left.` and `right.` prefixes
- single-input editors suggest `input.` and scoped column names
- selecting a suggestion inserts the completed name
- Save remains enabled even when diagnostics are present

Testing can remain centered in `src/features/graph-editor/NodeEditorModal.test.tsx`
unless the shared expression component grows enough to justify its own test
file.

## Risks And Tradeoffs

- The editor will become more interactive, which increases modal complexity and
  test surface area
- Bare-name support is convenient but requires ambiguity tracking that
  prefix-only systems would avoid
- Scope analysis for nodes outside the active output path requires graph-level
  helpers that are separate from the current `validateOutput` traversal
- Future features like graph reuse, explicit aliases, or same-node derived-name
  visibility may require extending the scope model, so the initial API should
  keep namespace handling explicit rather than hard-coded to string matching

## Acceptance Criteria

- Every current expression-bearing field uses one shared expression-editor
  contract
- Expressions are validated against the scope implied by incoming edges
- Single-input scopes support `input.<col>` and unambiguous bare names
- Join scopes support `left.<col>`, `right.<col>`, and only unambiguous bare
  names
- Unknown and ambiguous column references produce specific diagnostics
- `join` and `where` predicates still enforce boolean result types
- Autocomplete updates live while typing and offers scope prefixes plus visible
  column names
- Save remains available even when the modal shows expression diagnostics
- Compiler validation and modal validation use the same underlying analysis
  rules
