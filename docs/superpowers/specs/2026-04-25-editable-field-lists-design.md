# Editable Field Lists Design

## Summary

Add reusable list-editing controls to the centered node editor modal for
`fromTable`, `select`, and `aggregation` nodes so users can add, remove,
reorder, and duplicate rows directly in the editor instead of being limited to
the rows already present in node data.

The persisted graph document format does not change. The behavior is a modal UI
improvement over the existing node data model.

## Goals

- Make `fromTable` fields editable as an ordered list inside the modal
- Make `select` mappings editable as an add/remove/reorder/duplicate list
- Make `aggregation` `groupBy` rows and `aggregates` rows editable with the same
  row-list controls
- Keep at least one visible blank row in each editable list
- Drop fully blank placeholder rows on save
- Keep current compiler, validation, and persisted document model unchanged

## Non-Goals

- Changing the saved document shape from `ColumnMap` to ordered arrays
- Making row ordering meaningful outside modal editing for `fromTable` columns
- Adding inline semantic validation beyond current compiler diagnostics
- Extending the same row-list controls to unrelated node kinds in this change

## Current Context

The current modal editor already renders:

- `fromTable` columns via `ColumnMapEditor`
- `select` mappings via `MappingRows`
- `aggregation` rows via two separate `MappingRows` sections

Those editors let the user modify existing rows but do not let them add new
rows, remove rows, reorder rows, or duplicate rows. This creates unnecessary
friction for the most common structured nodes.

## Chosen Approach

Implement reusable row-list editor helpers over the current document model.

This approach keeps the change scoped to editor behavior:

- `fromTable` uses an editor-local ordered row draft and converts it back to
  `ColumnMap` on save
- `select` continues to edit `NamedExpression[]`
- `aggregation` continues to edit `NamedExpression[]` for both `groupBy` and
  `aggregates`

This avoids a document-format migration and keeps compiler-facing types stable
while still delivering the needed UX.

## UI Behavior

### Shared Row Actions

Each editable list gets the same controls on every row:

- move up
- move down
- duplicate
- remove

Each list also gets an add button below or after the list:

- `fromTable`: `Add field`
- `select`: `Add mapping`
- `aggregation` `groupBy`: `Add group key`
- `aggregation` `aggregates`: `Add aggregate`

Boundary behavior:

- `move up` is disabled for the first row
- `move down` is disabled for the last row
- removing the final remaining row replaces it with a new blank row instead of
  leaving the list empty

### FromTable Rows

Each field row contains:

- field name input
- type dropdown
- row action controls

The type dropdown is limited to the currently supported column types:

- `boolean`
- `int`
- `float`
- `string`
- `date`
- `timestamp`
- `null`
- `unknown`

### Select Rows

Each mapping row contains:

- output column name input
- expression textarea
- row action controls

### Aggregation Rows

The modal keeps the current two-section structure:

- `Group By`
- `Aggregates`

Each section uses the same list editor behavior independently, so reordering or
removing rows in one section does not affect the other.

## Draft And Save Behavior

### Placeholder Rows

Every editable list must always display at least one row.

If a node opens with an empty persisted list:

- `fromTable` shows one blank field row
- `select` shows one blank mapping row
- each `aggregation` section shows one blank row

Blank placeholder rows are editor-only convenience, not meaningful persisted
data.

### Save Sanitization

On save, sanitize each list before writing back to the node:

- `fromTable`: drop rows whose field name is blank after trimming
- `select`: drop rows whose name and expression are both blank after trimming
- `aggregation groupBy`: drop rows whose name and expression are both blank
  after trimming
- `aggregation aggregates`: drop rows whose name and expression are both blank
  after trimming

Partially filled rows are preserved on save. Existing semantic validation and
compiler diagnostics remain responsible for reporting incomplete or invalid
expressions.

### FromTable Conversion

`fromTable` still persists as `ColumnMap`.

The modal may edit fields as ordered rows, but on save it converts those rows
back into an object map:

- the saved value remains `Record<string, ColumnType>`
- duplicate field names collapse according to normal object semantics, meaning
  the last matching row wins

This tradeoff is acceptable for this feature because it preserves document
compatibility and avoids touching compiler code.

## Component Design

Refactor `src/features/graph-editor/nodeEditors.tsx` toward small reusable list
helpers:

- a reusable row action strip for move/duplicate/remove
- a reusable list state helper for add/remove/reorder/duplicate behavior
- specialized row renderers for:
  - `fromTable` field rows
  - `NamedExpression` rows

The modal shell in `NodeEditorModal.tsx` does not need behavioral changes
beyond using the updated editor output.

## Testing

Add focused modal tests covering the new editor behavior:

- `fromTable` can add a field row, choose a type, and save it into `columns`
- `select` can add a mapping row
- `select` can duplicate a mapping row
- `select` can reorder mapping rows
- removing the last row leaves one blank row visible
- blank placeholder rows are stripped on save
- partially filled rows are preserved on save
- `aggregation` `groupBy` and `aggregates` support the same row actions
  independently

Testing remains concentrated in `src/features/graph-editor/NodeEditorModal.test.tsx`
unless the refactor naturally warrants a small helper test.

## Risks And Tradeoffs

- `fromTable` ordering is an editor affordance, not a durable schema-order
  contract
- duplicate `fromTable` field names are not prevented in the modal and will
  collapse on save
- the modal UI will become denser, so control labels should stay explicit and
  predictable rather than overly compact

## Acceptance Criteria

- Users can add, remove, move, and duplicate rows in `fromTable`, `select`, and
  both `aggregation` sections
- Each list always shows at least one row while editing
- Saving removes only fully blank placeholder rows
- `fromTable` type selection is a constrained dropdown of supported column types
- Existing persisted graph shape and compiler pipeline remain unchanged
