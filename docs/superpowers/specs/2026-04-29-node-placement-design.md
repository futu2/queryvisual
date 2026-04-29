# Node Placement Design

## Problem

Creating a node from the palette currently inserts it at an automatic offset. The user can lose track of where the new node appeared, especially once the graph has been panned or contains many nodes.

## Decision

Replace immediate palette creation with click-to-place creation:

1. Clicking a palette item enters pending placement mode for that node kind.
2. The canvas shows a placement hint: `Click canvas to place · Esc to cancel`.
3. Clicking the canvas creates the node at the clicked graph position.
4. The created node is selected and its editor opens.
5. Pressing `Esc` cancels pending placement.
6. Clicking another palette item replaces the pending node kind.

This is preferred over drag-to-canvas for the first implementation because it is simpler, requires less pointer precision, and avoids browser drag/drop edge cases. Drag-to-canvas can be added later without changing the node factory or reducer model.

## Components

### Node Factory

Move node construction out of `NodePalette` into a reusable helper. The helper accepts:

- `kind`
- `index`
- optional `position`

If no position is provided, it keeps the current default offset behavior for tests and non-canvas callers. Canvas placement always passes an explicit graph position.

### App Placement State

Store pending placement at the app/editor shell level, not inside `NodePalette`, because both palette and canvas need access to it.

The pending state contains:

- selected `NodeKind`
- localized display label for the hint

### NodePalette

Palette buttons become placement-mode triggers. A click no longer dispatches `add-node` directly. Instead, it requests pending placement for the clicked node kind.

Choosing a different palette item while placement is pending replaces the pending kind.

### GraphCanvas

`GraphCanvas` accepts pending placement props and handles canvas clicks:

- If placement is pending, pane click creates a node at the clicked graph coordinates.
- After creation, it clears pending placement.
- It dispatches `add-node`, `select-node`, and `open-node-editor`.
- If no placement is pending, existing pane-click behavior remains unchanged.

Coordinate conversion uses React Flow's screen-to-flow conversion API so node placement respects pan and zoom.

### Cancellation

While placement is pending, pressing `Esc` clears pending placement. This uses a document-level keydown listener while pending mode is active.

## Dirty Editor Handling

If a node editor is open and dirty, placing a new node is a graph transition. The existing `runEditorTransition` discard protection wraps the final creation action, so the user must confirm discard before the new node is created and selected.

If the user keeps editing, placement remains pending so they can retry after saving or canceling.

## Visual Feedback

Use direct visual feedback:

- apply a placement cursor class to the canvas frame
- show a small floating hint in the canvas frame
- show a translucent ghost node that follows the mouse while the pointer is over the canvas

The ghost node is visual only. It is not added to the document or the React Flow node list, has no handles, cannot be selected, cannot be dragged, and cannot be connected. Keeping it outside the React Flow node list avoids registering the mouse-follow preview with React Flow's node `ResizeObserver`. Clicking the canvas creates the real node at the ghost position.

## Tests

Add tests for:

1. Palette click enters placement mode without creating a node.
2. Canvas pane click while pending creates the node at the clicked flow position.
3. Created node becomes selected and opens its editor.
4. `Esc` cancels pending placement.
5. Dirty editor protection blocks placement until discard is confirmed.
6. Pending placement renders a ghost node at the latest mouse flow position without dataflow handles.

Existing tests for palette labels and node data are updated to trigger placement before asserting created nodes.
