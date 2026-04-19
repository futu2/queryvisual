# QueryVisual Design

**Date:** 2026-04-19

## Overview

QueryVisual is a client-side single-page application built with Bun, Bun bundler, React, TypeScript, and XYFlow. It lets users build DQL queries as a graph of relational nodes, inspect intermediate compiler artifacts, and generate SQL from multiple named outputs in a single graph document.

The editor graph is not compiled directly to SQL. The system compiles through a staged pipeline:

`XYFlow graph document -> validated semantic graph -> relational IR -> optimized IR -> dialect renderer`

This separation keeps the UI model independent from the compiler model and provides a clean path for future dialect support beyond the initial generic ANSI SQL target.

## Goals

- Build a Bun-based React SPA with no third-party bundler beyond Bun bundler.
- Use XYFlow for graph editing.
- Support a single graph document containing multiple output nodes.
- Keep node cards compact on the canvas and move detailed editing into centered modal dialogs.
- Compile through semantic validation, IR lowering, optimization, and SQL rendering.
- Support a custom mid-sized expression language that compiles to SQL expressions.
- Save and load graph documents locally as JSON.
- Expose semantic model, raw IR, optimized IR, and rendered SQL for debugging.

## Non-Goals For v1

- Database connections
- Schema introspection
- Query execution
- Multi-graph composition or graph reuse
- Dialect-specific behavior beyond generic ANSI SQL output
- Full SQL expression compatibility

## Product Scope

Each saved document contains one graph. That graph may contain:

- graph input nodes
- table source nodes
- relational transformation nodes
- multiple named output nodes

Each output node defines an independent compilation target. The compiler analyzes the selected output and compiles only the reachable upstream slice of the graph.

Graph composition is not part of v1, but `GraphInput` is a first-class node kind so the model can evolve toward graph-as-node composition later.

## Core Architecture

The system is split into three layers.

### Editor Layer

The editor layer owns:

- XYFlow node and edge state
- node placement and viewport state
- selection state
- modal editing workflows
- document-level commands such as new, save, and load

This layer is purely editor-facing. It should not contain compiler semantics beyond lightweight UI helpers.

### Domain And Compiler Layer

The domain layer owns:

- graph semantic validation
- schema flow and type checking
- expression language parsing and typing
- semantic graph lowering
- relational IR definitions
- optimizer passes
- dialect rendering

This layer is framework-agnostic and should be testable without React or XYFlow.

### Persistence And Debug Layer

This layer owns:

- JSON serialization and deserialization for graph documents
- compiler orchestration for selected outputs
- presentation of diagnostics, semantic model, IR, optimized IR, and SQL

## Graph Document Model

The primary persisted format is `GraphDocument`.

`GraphDocument` contains:

- document metadata such as version
- editor viewport and layout metadata
- node list
- edge list

Each node in the document stores:

- stable node id
- node kind
- editor position
- display label
- node-specific configuration payload

Each edge stores:

- stable edge id
- source node id and handle
- target node id and handle

The graph document is the editor model only. Compiler stages must lower it into semantic structures instead of depending on XYFlow-specific shapes.

## Node Kinds

The v1 node kinds are:

- `GraphInput`
- `FromTable`
- `Join`
- `Where`
- `Select`
- `Aggregation`
- `Sort`
- `Limit`
- `Output`

### GraphInput

`GraphInput` is a typed relational placeholder node. It exists in v1 even though graph reuse is out of scope. It allows the model to express future composable graph contracts without redesigning the compiler.

### FromTable

`FromTable` defines a relational source from a table reference and an explicit column map.

The table reference is either:

- `schemaName.tableName`
- `tableName`

The table schema is an explicit mapping of:

- `columnName -> type`

### Join

`Join` takes two relational inputs:

- `left`
- `right`

It also stores:

- join kind
- join predicate expression

Join legality and schema resolution are validated before IR lowering.

### Where

`Where` takes one relational input and one boolean expression.

### Select

`Select` takes one relational input and produces a new schema from a structured list of output mappings.

Each mapping row contains:

- output column name
- scalar expression

This node is structured at the relational level, while each mapped expression uses the custom expression language.

### Aggregation

`Aggregation` takes one relational input and stores:

- grouping key rows
- aggregate output rows

Grouping keys and aggregate definitions are structured entries. Their scalar pieces still use the expression language.

### Sort

`Sort` takes one relational input and stores an ordered list of sort items, each with expression and direction.

### Limit

`Limit` takes one relational input and stores:

- row count
- optional offset

### Output

`Output` marks a named compilation target and takes one relational input.

Each output compiles independently and is surfaced separately in the debug panel.

## Expression Language

The expression language is separate from SQL syntax and compiles into SQL expressions during later stages.

v1 expression scope is mid-sized:

- literals
- column references
- arithmetic operators
- comparison operators
- boolean operators
- function calls
- `case` expressions
- null handling helpers
- casts

The expression language is used inside node details, not for large relational structure. Large query shape stays in structured nodes. Scalar transforms, predicates, grouping expressions, and similar fields use the expression editor.

Examples of fields backed by the expression language:

- `Where` predicate
- `Join` predicate
- `Select` output expressions
- grouping expressions
- aggregate argument expressions
- sort expressions

## Semantic Validation

Compilation starts by lowering the graph document into a validated semantic graph for a selected output node.

Validation produces diagnostics tied to:

- node ids
- field identifiers inside node payloads
- edge endpoints where relevant

This allows both canvas-level and modal-level error highlighting.

Validation covers:

### Graph Legality

- missing required inputs
- invalid input arity
- disconnected outputs
- duplicate output names
- cycles that would break acyclic compilation

### Node Contracts

- `Join` must have valid `left` and `right` inputs
- `Where` must type-check to boolean
- `Select` must define valid output mappings
- `Aggregation` must define legal grouping and aggregate rows
- `Sort` must contain valid sort items
- `Limit` must contain valid numeric settings
- `Output` must have a relational upstream input

### Schema Flow

Each relational node computes an output schema from its validated input schemas.

### Name Resolution

Column references inside expressions resolve against the visible input scope of the current node.

### Type Checking

Expressions, casts, predicates, aggregates, and sort items are type-checked before IR lowering.

## Intermediate Representation

The semantic graph lowers into a dialect-neutral relational IR.

v1 IR node kinds:

- `IRInput(name, schema)`
- `IRScan(tableRef, schema)`
- `IRJoin(kind, left, right, predicate)`
- `IRFilter(input, predicate)`
- `IRProject(input, projections)`
- `IRAggregate(input, groupBy, aggregates)`
- `IRSort(input, items)`
- `IRLimit(input, count, offset?)`
- `IROutput(name, input)`

Scalar expression IR is typed and includes:

- literals
- column references
- unary operators
- binary operators
- function calls
- case expressions
- casts
- null-aware operators or helper forms

The IR must be deterministic and decoupled from editor concerns such as XY positions or modal state.

## Optimizer

v1 optimizer passes should be conservative and predictable.

Planned passes:

- prune unreachable nodes for the selected output
- normalize expressions into canonical forms
- merge adjacent compatible `Project` nodes
- merge adjacent compatible `Filter` nodes
- push filters below projects when symbol dependencies allow it
- trim unused projected columns
- normalize aliases and output ordering for stable SQL generation

The optimizer must preserve semantics and produce deterministic output suitable for snapshot testing.

## SQL Rendering

The initial renderer target is generic ANSI SQL.

Dialect rendering is an abstraction boundary, not just a formatting helper. The renderer layer must be structured so future dialects can be added without rewriting editor or IR code.

Known future dialect targets:

- PostgreSQL
- SQLite
- HetuEngine SQL

The ANSI renderer should produce readable SQL from optimized IR for any selected output node.

## User Experience

The UX should keep the canvas readable and use modals for detail work.

### Canvas

Each node card shows compact summary information only:

- node title and kind
- one-line summary of main configuration
- input and output handles
- error status badge when invalid
- small schema preview when useful

The node should not attempt to expose full editing controls inline.

### Modal Editing

Clicking a node opens a centered modal dialog.

Each modal should use a consistent structure:

- header with node kind, label, and validation status
- body with structured form sections
- row editors for repeated definitions
- embedded raw expression editors for scalar fields
- footer with save, cancel, and inline validation feedback

Examples:

- `FromTable`: table reference and column map editor
- `Join`: join kind, left/right summaries, predicate editor
- `Select`: list of output rows where each row is `columnName = expression`
- `Where`: boolean expression editor
- `Aggregation`: grouping rows and aggregate output rows
- `Sort`: ordered sort items
- `Limit`: count and optional offset
- `Output`: output name and upstream binding

### App Layout

The SPA should use a three-part layout:

- left sidebar for node palette and document commands
- center canvas for XYFlow editing
- lower or side debug panel for diagnostics and compiler artifacts

The debug panel should provide tabs for:

- diagnostics
- semantic model
- IR
- optimized IR
- SQL

## Persistence

v1 persistence is local save and load of graph JSON documents.

Required capabilities:

- create a new document
- save the current document to JSON
- load a document from JSON

SQL export is not required in v1.

## Project Structure

The initial codebase should preserve a sharp boundary between UI and compiler code.

Suggested structure:

- `src/app/` for app shell and high-level state wiring
- `src/features/graph-editor/` for XYFlow integration and graph editing flows
- `src/features/document-storage/` for save and load behavior
- `src/components/` for reusable UI components
- `src/domain/schema/` for table references, schema, and type helpers
- `src/domain/expr/` for expression AST, parser, typer, and lowering
- `src/domain/graph/` for semantic graph definitions and validation
- `src/domain/ir/` for IR definitions and optimizer passes
- `src/domain/sql/` for SQL rendering and dialect abstractions
- `src/domain/compile/` for end-to-end compile orchestration

## Testing Strategy

Compiler functionality should be tested more heavily than UI behavior.

### Domain Tests

- expression parser tests
- expression type-checking tests
- graph validation tests
- semantic-to-IR lowering tests
- optimizer golden tests
- SQL renderer golden tests

### UI Tests

- node summary rendering tests
- modal interaction tests for each node kind
- save and load tests
- integration tests that verify diagnostics and compiler artifacts update after edits

## Technical Stack

v1 stack:

- Bun runtime
- Bun package manager
- Bun bundler
- React
- React DOM
- TypeScript
- XYFlow

The implementation should avoid introducing another bundler.

## Success Criteria

v1 is successful if a user can:

- open the SPA
- create a graph with the defined node kinds
- wire nodes into valid output pipelines or DAG slices
- edit node details in centered modal dialogs
- use the custom expression language in scalar fields
- save and load the graph as JSON
- select an output node
- inspect semantic model, raw IR, optimized IR, and generated ANSI SQL
- receive clear diagnostics tied to nodes and fields

## Future Extensions

The design intentionally leaves room for:

- graph composition via graph-as-node
- additional SQL dialects
- richer expression language features
- SQL export actions
- schema catalogs and reusable source definitions

These are future additions and must not distort the v1 implementation scope.
