# Output Modal And Edge Delete Design

## Goal

Remove the global Outputs side panel, move output inspection into each output node modal, add built-in automatic output listeners, and let users remove edges directly from the canvas through a compact edge delete control.

## Current Context

- The app currently compiles exactly one globally selected output in [`App.tsx`](../../../../src/App.tsx) and renders its artifacts in [`DebugPanel.tsx`](../../../../src/features/debug/DebugPanel.tsx).
- Canvas node diagnostics are derived from that single active output result and passed into [`GraphCanvas.tsx`](../../../../src/features/graph-editor/GraphCanvas.tsx).
- Output nodes already have a modal editor entry in [`nodeEditors.tsx`](../../../../src/features/graph-editor/nodeEditors.tsx), but it only edits `outputName`.
- React Flow edges are still emitted as plain edges by [`flowAdapter.ts`](../../../../src/features/graph-editor/flowAdapter.ts) with no custom delete affordance.
- Editor state still tracks `activeOutputId` in [`documentReducer.ts`](../../../../src/app/state/documentReducer.ts), which only exists to support the global Outputs panel.

## Approved Decisions

### Output Inspection Placement

- The Outputs side panel goes away entirely.
- Output inspection lives in the output node modal only.
- Output node modals show:
  - diagnostics
  - semantic output
  - IR
  - optimized IR
  - SQL
- Non-output node modals do not gain compile tabs in this change.

### Listener Model

- No new listener node kind will be added.
- Listener behavior is configured inside each output node.
- Listener actions are built-in only for now:
  - copy SQL to clipboard
  - log SQL to console
  - save SQL to `localStorage`
- Listeners run automatically when that output node's compiled SQL changes.
- Listeners run even if the output modal is closed.

### Edge Removal

- Edge deletion is done from the edge itself, not from a side panel or keyboard-only flow.
- The delete affordance appears only when the edge is hovered or selected.
- The affordance should stay compact and icon-based so the graph remains readable.

## Architecture

### Shared Output Runtime

Compilation should stop being tied to one selected output. Instead, the app should build a shared output runtime from the current saved graph document:

- discover all output nodes in the document
- compile each output with `compileOutput(document, outputId)`
- expose a `resultsByOutputId` map
- expose a deduped canvas diagnostic list aggregated from all outputs
- expose transient listener execution status per output

This runtime should be derived centrally from the saved document so every consumer sees one consistent view:

- canvas badges
- output modal compile tabs
- automatic listeners

The output runtime should live beside the app shell, either as a focused hook or a small feature-local helper module, instead of spreading compile logic across `App.tsx`, `GraphCanvas.tsx`, and the modal.

### Saved Graph Versus Modal Drafts

Compile artifacts shown in an output modal must always reflect the current saved graph document, not unsaved draft edits inside the modal.

That means:

- changing `outputName` or listener settings in the modal does not immediately recompile
- compile tabs remain based on the last saved node/document state
- listeners only begin or stop running after the modal is saved

This keeps runtime behavior deterministic and avoids mixing global compilation with local draft state.

### Canvas Diagnostics Without Active Output

Once `activeOutputId` is removed, canvas diagnostics still need a stable source. The canvas should receive a deduped union of diagnostics from all compiled outputs.

Deduping should be structural, based on the combination of:

- `level`
- `code`
- `message`
- diagnostic ref payload

This avoids showing the same upstream validation failure multiple times when several outputs depend on the same broken branch, while still preserving full per-output diagnostics inside each output modal.

## Output Node Data Model

Output nodes should gain persisted listener configuration. The target saved shape should be:

```ts
type OutputListenerConfig = {
  copyToClipboard: boolean;
  logToConsole: boolean;
  saveToLocalStorage: {
    enabled: boolean;
    key: string;
  };
};

type OutputNodeData = {
  outputName: string;
  listeners: OutputListenerConfig;
};
```

Default listener values:

```ts
{
  copyToClipboard: false,
  logToConsole: false,
  saveToLocalStorage: {
    enabled: false,
    key: "queryvisual.output.<outputName>",
  },
}
```

The key template should be resolved from the saved output name at the time defaults are created.

### Backward Compatibility

Existing saved documents only contain `outputName`. They must remain loadable without a migration step.

Implementation should therefore accept legacy output nodes that omit `listeners`, then normalize them to the default config during parsing or document hydration. After normalization, the live app state can assume `listeners` is present.

Document version can remain `1` for this change because the app is only adding backward-compatible optional input data and normalizing it on load.

## Listener Semantics

### When Listeners Fire

Listeners should evaluate per output node whenever that output's compiled SQL string changes in the shared runtime.

They should only fire when all of the following are true:

- the compile completed for that output
- the rendered SQL is non-empty
- the new SQL differs from the last successfully handled SQL for that listener runtime

They should not fire when:

- semantic or lowering errors produce an empty SQL string
- the SQL string has not changed
- the listener is disabled

This prevents repeated clipboard writes and prevents blank invalid output from overwriting previous successful artifacts.

### Listener Actions

- `copyToClipboard`
  - calls `navigator.clipboard.writeText(sql)`
- `logToConsole`
  - logs the SQL string with an output-specific prefix for debugging
- `saveToLocalStorage`
  - writes the SQL string to the configured key

Each action should run independently. One failing listener must not block the others.

### Runtime Status

Listener execution state should stay transient, not persisted in the graph document. Per output, runtime state should track:

- last successful SQL string
- last run timestamp
- last error message, if any

The output modal can show this status in a lightweight runtime section so the user can see whether automatic listeners are active and whether the last run succeeded.

## UI Changes

### App Shell

The right-side Outputs pane should be removed from the app shell. After this change the layout becomes:

- left sidebar for document tools and node palette
- main canvas pane taking the freed horizontal space

There is no replacement mini-panel elsewhere in the shell.

### Output Modal Content

The output modal should have two clearly separated areas:

1. editable output settings
2. read-only runtime inspection

Editable output settings:

- output name
- copy-to-clipboard toggle
- console-log toggle
- localStorage toggle
- localStorage key input

Runtime inspection:

- listener status summary
- compiler artifact tabs

The SQL tab remains the default active tab because it is the primary user-facing artifact.

If the output is invalid:

- diagnostics tab shows semantic diagnostics
- IR and optimized IR show `null`
- SQL shows an empty result message or empty output consistent with existing behavior

### Non-Output Modals

Non-output node modals keep their current editor-first behavior. This change should not introduce compile tabs or global runtime controls into other node kinds.

### Edge Delete Control

Edges should switch to a custom React Flow edge renderer that:

- renders the edge path normally
- computes a midpoint/label anchor
- overlays a compact delete button at that anchor
- only shows the button while hovered or selected

The control should:

- stop propagation so it does not trigger unrelated canvas interactions
- delete only the targeted edge
- preserve normal edge hit testing and selection behavior

Keyboard delete support is out of scope unless it falls out naturally from the same selected-edge wiring with negligible extra complexity.

## State Changes

### Reducer

`activeOutputId` should be removed from editor state and reducer actions.

That includes:

- removing the field from `EditorState`
- removing the `set-active-output` action
- removing any reducer logic that keeps output selection in sync
- updating tests that currently assert active-output behavior

The reducer should gain a focused `delete-edge` action that removes one edge by id from the document.

### Flow Adapter And Canvas

The flow adapter should emit custom edge definitions rather than anonymous default edges so the canvas can register an `edgeTypes` map and pass delete metadata through cleanly.

`GraphCanvas` should receive the aggregated diagnostics from the shared output runtime and continue passing node-local filtered diagnostics into `QueryNode`.

Node opening behavior should no longer special-case output nodes for active-output selection, because that concept no longer exists.

## Component And File Responsibilities

### [`App.tsx`](../../../../src/App.tsx)

- remove `DebugPanel`
- derive the shared output runtime from the saved document
- pass aggregated diagnostics and output runtime access down to the canvas/modal layer
- expand the canvas region to consume the removed pane

### New output runtime helper

A focused helper or hook should own:

- output discovery
- per-output compilation
- cross-output diagnostic dedupe
- automatic listener execution
- transient listener status

Keeping this logic out of `App.tsx` and out of the modal prevents compilation and automation concerns from leaking into unrelated UI components.

### [`nodeEditors.tsx`](../../../../src/features/graph-editor/nodeEditors.tsx)

- extend output node editing to include listener configuration controls
- preserve current draft/save behavior
- keep output compile tabs out of the draft serializer because they are runtime-only

### [`NodeEditorModal.tsx`](../../../../src/features/graph-editor/NodeEditorModal.tsx)

- accept runtime inspection data for output nodes
- render output-specific compile tabs and listener status
- keep the existing dirty-close behavior unchanged

### [`documentReducer.ts`](../../../../src/app/state/documentReducer.ts)

- remove active-output state and actions
- add `delete-edge`

### [`flowAdapter.ts`](../../../../src/features/graph-editor/flowAdapter.ts)

- emit custom edge type metadata

### New custom edge component

Add a focused edge renderer component under the graph editor feature that owns:

- midpoint delete button positioning
- hover/selected visibility behavior
- delete callback wiring

### [`fileIO.ts`](../../../../src/features/document-storage/fileIO.ts)

- accept legacy output nodes without listeners
- validate normalized listener config for newer documents
- preserve listener config during round-trip serialization

## Failure Handling

### Listener Failures

Listener failures must not break output compilation or the rest of the UI.

Examples:

- clipboard permission denied
- `localStorage` quota or availability errors
- unexpected console/logging issues

Handling rules:

- catch each listener action independently
- record the error in transient runtime status
- keep other listeners running
- keep compile artifacts visible

### Invalid Outputs

Invalid outputs should still produce modal diagnostics just as they do today through `compileOutput`, but automatic listeners should skip firing when SQL is empty.

### Edge Delete Safety

Deleting an edge should immediately mutate the saved document and let the shared runtime recompute derived outputs. No extra confirmation dialog is required for this change.

## Testing Strategy

### Reducer And Runtime Tests

- reducer coverage for removing `activeOutputId`
- reducer coverage for `delete-edge`
- output runtime tests for:
  - compiling all outputs
  - deduping shared diagnostics
  - firing listeners only on SQL changes
  - skipping listeners on empty SQL
  - isolating listener failures

### File I/O Tests

- parsing legacy output nodes without listener config
- round-tripping normalized listener config
- rejecting malformed listener payloads

### Modal And App Tests

- app no longer renders the Outputs panel
- output modal shows compile tabs using saved runtime data
- output modal edits listener config and saves it
- unsaved listener edits do not immediately affect runtime status
- output modal runtime section shows listener success or failure state

### Edge UI Tests

- custom edge shows delete affordance on hover
- custom edge shows delete affordance on selection
- clicking delete removes exactly one targeted edge
- edge delete does not trigger unrelated node-open behavior

### Regression Coverage

- canvas node badges still reflect output diagnostics after removing global output selection
- opening an output node no longer depends on `set-active-output`
- existing node modal dirty-close behavior remains intact

## Non-Goals

- adding JavaScript snippets or arbitrary user code listeners
- adding a separate listener node kind
- adding compile tabs to non-output nodes
- adding keyboard-first edge deletion workflows
- changing SQL generation semantics
- introducing reusable graph-as-node behavior

## Risks And Guardrails

### Diagnostics Explosion

Risk: compiling all outputs causes duplicated diagnostics or noisy node badges.

Guardrail: aggregate diagnostics centrally and dedupe them structurally before passing them to the canvas.

### Runtime And Draft Confusion

Risk: users assume output modal compile tabs reflect unsaved edits.

Guardrail: keep compile tabs explicitly tied to saved state and keep listener execution save-gated.

### Backward Compatibility Drift

Risk: old documents fail to load once listener config is introduced.

Guardrail: normalize missing listener config to defaults during parsing/hydration and keep parser coverage for legacy payloads.

### Edge Control Visual Noise

Risk: edge delete controls clutter dense graphs.

Guardrail: show the delete affordance only on hover or selection and keep the control small, icon-based, and centered on the edge path.
