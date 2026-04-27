# Modal Scroll And Subgraph Inputs Design

## Goal

Fix two editor regressions:

- long node-editor modals must allow scrolling to lower mapping rows
- downstream editor scopes must correctly see subgraph output columns when a
  subgraph node is used as the input source

## Scope

This design covers only:

- centered modal layout behavior for tall editor content
- modal-side schema inference used for expression validation and autocomplete
- regression tests for both behaviors

This design does not cover:

- a redesign of the modal structure or mapping-row UI
- changes to expression language syntax or diagnostics wording
- broader graph compilation changes outside the existing schema-inference path

## Current Context

- [`src/features/graph-editor/NodeEditorModal.tsx`](../../../../src/features/graph-editor/NodeEditorModal.tsx)
  computes modal-only schema overrides so unsaved editor state can still power
  expression validation and autocomplete.
- [`src/domain/graph/inferSchemas.ts`](../../../../src/domain/graph/inferSchemas.ts)
  already knows how to infer subgraph output schemas, but that branch requires
  workspace context.
- The app-level compilation/runtime path already passes workspace where needed,
  but the modal override path currently calls `inferNodeSchemas(document,
  nodeId)` with no workspace.
- [`src/index.css`](../../../../src/index.css) defines the centered modal card
  as a column flex container with `overflow: hidden`, while the modal body has
  `overflow: auto` but no flex sizing contract.

## Root Causes

### Modal Scroll

The modal body is intended to be the scroll container, but inside the flex
column card it does not explicitly opt into shrinking and taking remaining
height. With the parent clipping overflow, tall content can become unreachable
instead of scrolling inside the body.

### Subgraph Input Schemas

Downstream editor scopes rely on modal schema overrides. Those overrides are
computed without workspace context, so `subgraph` nodes fail closed during modal
schema inference and expose no output columns to downstream `select`,
`aggregation`, `where`, `sort`, and similar node editors.

## Decisions

- Keep one scroll container for the modal content area instead of introducing
  nested scrolling sections.
- Fix scrolling by making the modal body the actual resizable flex child of the
  card.
- Keep schema inference centralized in `inferSchemas.ts`; do not create a
  separate modal-only resolver.
- Extend the modal override path to pass workspace context into schema
  inference.

## Architecture

### Modal Layout

The modal card remains a fixed centered shell with header, body, and footer.
Only the body should scroll.

Implementation should preserve the current structure and adjust CSS so the body:

- grows to fill remaining card height
- can shrink below content height
- owns vertical overflow

This keeps header and footer stable while allowing long mapping lists to remain
reachable.

### Workspace-Aware Modal Schema Inference

`inferNodeSchemas` should accept optional inference context, matching the
subgraph-aware behavior already present in the lower-level schema inference
logic.

`NodeEditorModal` should pass the current workspace when computing
`schemaOverrides`. That keeps downstream expression scope resolution aligned
with normal graph semantics without duplicating inference rules in UI code.

## Testing Strategy

Add focused regressions close to the user-visible behavior:

- a modal test that asserts the modal body has the sizing contract required to
  scroll tall content
- a modal test where a downstream node receives input from a subgraph and
  autocomplete/validation sees the child graph output columns

The second regression should exercise the modal path specifically, not only the
pure schema inference helper, because the bug is caused by missing workspace in
the UI integration layer.

## Acceptance Criteria

The fix is complete when:

- long mapping lists in the centered node editor modal remain reachable by
  scrolling the modal body
- downstream editors connected to a subgraph input show the expected visible
  columns for autocomplete and validation
- existing schema inference behavior for non-subgraph inputs remains unchanged
- focused regressions pass along with the existing test suite and build
