# Node Label And Type Visuals Design

## Goal

Make each graph node name editable through the modal editor, warn before discarding unsaved modal changes, and give each node kind a clearer visual identity on the canvas without splitting the node renderer into many separate components.

## Current Context

- Canvas nodes are rendered by a single [`QueryNode`](../../../../src/features/graph-editor/nodes/QueryNode.tsx) component with one shared visual style and a static title.
- Modal editing already uses draft state via [`useEditableNode`](../../../../src/features/graph-editor/nodeEditors.tsx), but the node label is not part of the editable draft and close paths always discard immediately.
- Node selection and modal open/close behavior are controlled by [`GraphCanvas`](../../../../src/features/graph-editor/GraphCanvas.tsx) and the document reducer in [`documentReducer.ts`](../../../../src/app/state/documentReducer.ts).

## Approved Decisions

### Node Name Editing

- Node names are editable in the modal header only.
- Name edits remain draft-only until the user clicks `Save`.
- Inline renaming on the canvas is out of scope.

### Dirty Discard Warning

- Any dirty modal close path must warn before discarding changes.
- This includes:
  - clicking `Cancel`
  - clicking the backdrop
  - pressing `Escape`
  - opening another node while a dirty modal is already open
- If there are no unsaved changes, the modal closes immediately.

### Visual Direction

- Keep one shared node renderer and drive type presentation from a per-kind theme map.
- Use strong differentiation through color, glyph, and silhouette changes.
- Use CSS-based shapes and presentation variants rather than separate per-kind React components.

## Architecture

### Modal Draft Model

Extend the existing editable node draft so `label` is treated like any other editable field. The modal works against the draft copy, not the live document node. Saving serializes the draft back into a `GraphNode` and uses the existing `replace-node` action.

Dirty detection compares the original node with the current draft, including:

- `label`
- existing node-specific editor fields
- row-based editor changes already handled by the current draft flow

This keeps discard guarding local to the modal and avoids pushing tentative node-label changes into global state.

### Guarded Close Flow

`NodeEditorModal` should stop treating `onClose` as a blind close callback. Instead, it should own a guarded close action:

1. check whether the current draft differs from the original node
2. if not dirty, call the existing close callback immediately
3. if dirty, show a centered discard-confirmation dialog
4. if the user confirms discard, close
5. if the user cancels discard, keep the modal and current draft intact

The same guarded path should be reused for all close triggers so behavior stays consistent.

### Node Presentation System

Keep [`QueryNode`](../../../../src/features/graph-editor/nodes/QueryNode.tsx) as the single canvas node component, but introduce a per-kind presentation descriptor. That descriptor should define:

- visual family
- accent color
- surface/background treatment
- border treatment
- glyph or mark
- silhouette variant class

Three visual families are enough:

- source: `graphInput`, `fromTable`
- transform: `join`, `where`, `select`, `aggregation`, `sort`, `limit`
- terminal: `output`

Within those families, each kind still gets its own specific presentation tokens. Examples:

- `fromTable`: source styling with table-oriented accent
- `join`: transform styling with a split or bridged silhouette hint
- `where`: transform styling with filter-oriented accent
- `aggregation`: transform styling with grouped or stacked accent
- `sort`: transform styling with directional accent
- `output`: terminal styling with a more report-like silhouette

Selected and error states must remain visually stronger than the type theme so editing and validation feedback still dominate.

## Component Changes

### [`NodeEditorModal.tsx`](../../../../src/features/graph-editor/NodeEditorModal.tsx)

- replace the static `<h2>{node.label}</h2>` with a controlled input bound to `draft.label`
- add dirty tracking against the original node
- add discard-confirmation UI
- intercept backdrop click and `Escape`
- route all close attempts through the guarded close action

### [`nodeEditors.tsx`](../../../../src/features/graph-editor/nodeEditors.tsx)

- ensure the editable draft preserves `label`
- keep serialization returning the edited `label`
- avoid changing current save semantics for node-specific payloads

### [`GraphCanvas.tsx`](../../../../src/features/graph-editor/GraphCanvas.tsx)

- keep node opening behavior, but ensure that clicking another node while a modal is open uses the same guarded-discard path instead of silently replacing the active editor target

### [`QueryNode.tsx`](../../../../src/features/graph-editor/nodes/QueryNode.tsx)

- add a per-kind presentation lookup
- render glyph/mark and silhouette classes from that lookup
- keep summary rendering intact
- preserve handle layout behavior, especially the special join handles

### [`queryNode.css`](../../../../src/features/graph-editor/nodes/queryNode.css)

- add family and per-kind classes for color and silhouette variations
- keep selected/error layering intact
- preserve readability of title and summary text across all themes

### Shared State / Reducer

The reducer should not gain draft persistence. The dirty-confirmation behavior should stay local to the modal/editor feature unless implementation proves that the canvas cannot route “switch node while dirty” cleanly without a small UI-state extension.

If a reducer change becomes necessary, it should stay limited to editor-target switching, not general form state storage.

## Interaction Details

### Rename Flow

1. user opens a node
2. modal header shows node kind plus editable name input
3. user changes the name
4. canvas node title does not change yet
5. user clicks `Save`
6. document node is replaced
7. canvas rerenders with the new title

### Discard Flow

1. user edits any modal field, including node name
2. user tries to close the modal through any close path
3. if dirty, a centered confirmation dialog appears
4. actions:
   - discard changes: close modal and drop draft
   - keep editing: dismiss confirmation and preserve draft

### Switch Node While Dirty

1. user has a dirty modal open
2. user clicks another node on the canvas
3. the same discard confirmation appears
4. if discard is confirmed, the old modal closes and the newly clicked node opens
5. if discard is canceled, the original modal stays active

## Visual Treatment

The node visuals should feel more intentionally differentiated without becoming noisy or cartoonish.

Key rules:

- preserve the warm/light visual language already used by the app
- use stronger color separation than today
- keep shapes readable at small canvas sizes
- do not rely on text labels alone for type recognition
- do not introduce decoration that competes with error badges, selection state, or handle visibility

The shared layout should remain:

- kind label
- title
- summary
- optional error badge

What changes per kind is the shell styling and small visual motif.

## Testing Strategy

### Modal Tests

Add or update modal coverage for:

- editing node name and saving updates the node label
- editing node name and canceling triggers discard confirmation
- backdrop click on a dirty modal triggers discard confirmation
- pressing `Escape` on a dirty modal triggers discard confirmation
- clicking another node while dirty triggers discard confirmation
- confirming discard switches node or closes modal as appropriate
- canceling discard preserves the existing draft

### Node Renderer Tests

Add renderer coverage for:

- per-kind presentation classes or data hooks
- at least one source node, one transform node, and one terminal node using distinct visual hooks
- selection and error styling hooks still layering correctly

### Integration / Canvas Tests

Add integration coverage for:

- switching nodes while dirty
- saved rename appearing on the canvas node title

## Non-Goals

- inline rename on the canvas
- new node kinds
- changing palette defaults or node creation labels
- refactoring the graph document model
- replacing the existing modal editor architecture
- redesigning edge styling or minimap behavior

## Risks And Guardrails

### Dirty State Drift

Risk: draft-vs-original comparisons become brittle as node editors evolve.

Guardrail: compute dirty state from the same serialized draft shape that would be saved, plus `label`, instead of from ad hoc field checks.

### Over-Stylized Nodes

Risk: strong silhouette changes reduce readability or make the canvas feel inconsistent.

Guardrail: keep one shared structure and vary shell classes, not the content hierarchy.

### Node Switching Semantics

Risk: clicking another node while a modal is open bypasses the discard guard because canvas selection and editor-target changes happen separately.

Guardrail: treat “open another node editor” as a guarded transition rather than a blind dispatch sequence.
