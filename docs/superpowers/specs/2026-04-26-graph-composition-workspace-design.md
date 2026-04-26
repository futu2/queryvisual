# Graph Composition Workspace Design

## Goal

Let one saved graph build on top of other saved graphs in the same local workspace, similar to reusable libraries or packages. Composition should be live: changing a child graph should immediately affect parent graphs that reference it. JSON import/export should operate on the whole workspace, not a single graph.

## Scope

This design adds:

- a workspace model containing multiple named graphs
- reusable graph composition through a new subgraph reference node
- live parent-child dependency updates
- whole-workspace JSON import/export
- graph catalog and switching UI

This design does not add:

- remote/shared package registries
- versioning or pinned dependency snapshots
- cross-workspace references
- recursive graph dependencies
- merge-import for workspace JSON
- multiple simultaneously opened workspaces

## Decisions

- Reusable graphs live inside the same local workspace.
- JSON import/export uses a whole-workspace file.
- A referenced child graph updates parents immediately.
- A child graph may expose multiple named `graphInput` nodes.
- A child graph may expose multiple named `output` nodes.
- A single subgraph-use node exposes all child outputs, not just one selected output.
- Parent inputs may contain extra columns, but must provide all child-required columns with compatible types.
- Graph dependency cycles are forbidden.

## User Model

The app becomes a single-workspace editor. A workspace contains many graphs. The user opens one graph at a time on the canvas, but may reference other graphs in that same workspace through a `subgraph` node.

Each child graph defines its public interface through ordinary graph nodes:

- `graphInput` nodes define named input entry points and their field schemas
- `output` nodes define named output entry points

The parent graph does not clone child nodes. Instead, it references the child graph by id. The parent subgraph node exposes one input handle for each child `graphInput` and one output handle for each child `output`.

## Data Model

### Workspace Root

Replace the single-graph persistence root with a workspace root:

```ts
export interface GraphWorkspace {
  version: 2;
  metadata: {
    name: string;
  };
  entryGraphId: string;
  graphs: GraphDefinition[];
}
```

`entryGraphId` identifies the graph the app should open by default after load/import.

### Graph Definition

Each graph keeps the same overall shape as the current single document:

```ts
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
```

### Node Changes

Add a new node kind:

```ts
type NodeKind =
  | "graphInput"
  | "fromTable"
  | "join"
  | "where"
  | "select"
  | "aggregation"
  | "sort"
  | "limit"
  | "output"
  | "subgraph";
```

Update node payloads:

```ts
type GraphNode =
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
```

`graphInput` needs `inputName` so child graph interfaces are stable and user-addressable. Existing `outputName` continues to serve as the exported output name.

### Edge Model

The current edge shape can remain, but `targetHandle` and `sourceHandle` must support dynamic subgraph handle names instead of only the current fixed literals.

Conceptually:

- ordinary nodes keep their existing handles
- `subgraph` target handles are keyed by child `graphInput.inputName`
- `subgraph` source handles are keyed by child `output.outputName`

The exact TypeScript representation can be widened from the current literal union to a string-based handle model plus validation.

## Interface Inference

Child graph interfaces are inferred, not manually declared elsewhere.

### Child Inputs

Every `graphInput` node in a child graph contributes:

- one named input port on parent subgraph-use nodes
- one required schema contract based on its editable field list

Constraints:

- `inputName` must be unique within a graph
- empty `inputName` is invalid

### Child Outputs

Every `output` node in a child graph contributes:

- one named output port on parent subgraph-use nodes
- one exported result contract

Constraints:

- `outputName` must be unique within a graph
- empty `outputName` is invalid

## Compilation And Validation

### Compile Entry Point

Compilation changes from:

- compile one output in one document

to:

- compile one output in one graph inside one workspace

The compile API should accept both workspace and graph context, for example:

```ts
compileWorkspaceOutput(workspace, graphId, outputNodeId)
```

### Subgraph Semantics

`subgraph` nodes behave as live references to child graphs.

For each `subgraph` node:

- every child `graphInput` must be satisfied by exactly one incoming parent edge to the matching named handle
- every child `output` becomes one available outgoing result/schema on the matching named handle

### Recommended v1 Strategy

Use logical inlining during validation and compilation:

1. resolve the referenced child graph
2. derive child input schemas from the parent-connected upstream schemas
3. validate and compile the child graph in that contextualized input environment
4. expose each compiled child output back to the parent as a subgraph-node output

This keeps execution simple while preserving reusable graph authoring.

### Validation Rules

Validation must reject:

- missing referenced child graph
- duplicate `graphInput.inputName` within one graph
- duplicate `output.outputName` within one graph
- missing required parent connection for a child `graphInput`
- multiple parent connections to the same child input handle
- incompatible parent schema for a child input
- dependency cycles across graphs

Input compatibility rule:

- parent may provide extra columns
- parent must provide every child-required column
- provided column types must be compatible with child-required types

### Dependency Cycles

Graph dependency cycles are invalid, including indirect cycles.

Examples:

- graph A references graph A
- graph A references graph B, and graph B references graph A
- graph A references graph B, graph B references graph C, and graph C references graph A

Cycle detection should run at least during validation and before saving/importing if practical.

### Diagnostics

Diagnostics from child graphs should remain understandable from the parent context.

They should include:

- the parent `subgraph` node reference
- the child graph id or graph name
- the child node id when available
- the child field path when available

This avoids flattening away all source context during logical inlining.

## Live Update Behavior

Parent graphs should update immediately when a referenced child graph changes.

That means:

- canvas diagnostics for parent graphs should recompute
- output runtime snapshots for parent outputs should recompute
- output listeners for parent outputs should observe new compiled SQL under the existing listener rules

No explicit refresh or republish step exists in v1.

## Editor UX

### Workspace Catalog

Add a workspace-level graph catalog UI with:

- list of graphs by name
- create graph
- rename graph
- switch active graph
- delete graph

Delete guardrail:

- a graph cannot be deleted while referenced by any `subgraph` node

### Active Editing Model

Only one graph is open on the canvas at a time.

Switching graphs should preserve per-graph viewport and content as saved in the workspace state.

### Graph Input Editing

`graphInput` editor should include:

- editable input name
- editable field list using the same compact row-editor pattern as `fromTable`

This gives child graph authors an explicit contract surface.

### Output Editing

`output` nodes remain the public exported outputs of a graph.

Their current modal/runtime behavior stays, but now they also serve as the subgraph public interface.

### Subgraph Node Creation

Add `Subgraph` to the node palette.

When creating a subgraph node:

- user chooses one target graph from the local workspace catalog
- node label defaults to that child graph name

### Subgraph Presentation

Subgraph node should show:

- one left input handle per child `graphInput`
- one right output handle per child `output`
- visible handle labels using input/output names
- summary text such as referenced graph name and `2 inputs / 3 outputs`

### Subgraph Modal

Subgraph node modal should allow:

- changing the referenced graph
- inspecting the inferred child interface
- quick-jumping to open that child graph in the editor

Changing the referenced graph should refresh available handles and invalidate incompatible existing edges.

## Import And Export

### Export

Export writes the whole current workspace JSON, including:

- workspace metadata
- all graphs
- all cross-graph references by graph id

### Import

For v1, import replaces the current workspace. It does not merge.

This keeps identity and dependency handling straightforward.

### Compatibility

Because this changes the persistence root from a single graph to a workspace, the loader should support at least one of:

- explicit migration from old single-graph files into a one-graph workspace
- clear rejection with a guided error

Recommended v1 behavior:

- accept old single-graph JSON by wrapping it into a one-graph workspace during load

## Guardrails

- cannot save duplicate `graphInput` names in a graph
- cannot save duplicate `outputName` values in a graph
- cannot create or keep a subgraph reference that forms a dependency cycle
- cannot delete a referenced graph
- cannot keep edges bound to removed child interface handles after referenced graph changes
- cannot compile parents with missing child input connections

## Testing

Add coverage for:

- workspace JSON import/export
- legacy single-graph migration into workspace form
- duplicate graph input names
- duplicate output names
- subgraph input/output interface inference
- parent schema superset compatibility
- incompatible parent-child schema diagnostics
- cycle detection across graphs
- live parent recompilation when child graphs change
- graph catalog create/rename/switch/delete guardrails
- subgraph node modal and handle rendering

## Recommended Implementation Boundaries

Keep the implementation split into these units:

- workspace persistence and migration
- graph catalog/editor state
- subgraph interface inference
- cross-graph validation
- cross-graph compilation
- UI for subgraph node creation and editing

This will matter because composition touches storage, graph semantics, compiler flow, and editor UI at once.

## Risks

### Risk: cross-graph compilation logic becomes hard to reason about

Guardrail:

- keep child graph interface inference explicit
- keep diagnostics tagged with both parent and child context
- keep cycle detection isolated in one place

### Risk: live updates trigger unnecessary recomputation

Guardrail:

- memoize workspace-derived runtime slices carefully
- only invalidate dependents of changed graphs

### Risk: interface churn breaks parent edges unexpectedly

Guardrail:

- surface clear diagnostics when child inputs/outputs are renamed or removed
- remove invalidated edges deterministically rather than leaving silent broken state

## Recommended v1 Boundaries

This design intentionally stops short of:

- versioned package dependencies
- namespaced imports from external libraries
- partial workspace merge/import
- recursive graphs
- publishing graphs outside the local workspace

Those can be added later once the local live-composition model is stable.
