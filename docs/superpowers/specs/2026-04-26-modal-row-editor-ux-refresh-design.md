# Modal Row Editor UX Refresh Design

## Summary

Refresh the node editor modal so repeated row editing feels like a compact query
editor instead of a generic form.

The main changes are:

- replace verbose row action buttons with compact icon controls
- add drag-handle reordering with icon-button fallback
- remove redundant row numbering labels such as `Mapping 1`
- move short row-name fields into the same header line as row controls
- improve modal spacing, grouping, and hierarchy while keeping current editing
  semantics intact

This pass is modal-first. Canvas/node-card changes are out of scope unless a
small shared style adjustment incidentally improves them without adding new
component work.

## Goals

- Make repeated row editing denser and faster to scan
- Reduce visual noise from repeated labels and large text buttons
- Preserve all current editing behaviors and save semantics
- Keep expression validation, diagnostics, and autocomplete readable inside the
  denser layout
- Improve modal visual hierarchy without a full redesign

## Non-Goals

- Changing graph semantics or persisted document structure
- Replacing modal editing with inline canvas editing
- Rewriting expression editor behavior beyond layout/styling integration
- Doing a full canvas/node-card redesign in this change

## Current Context

The modal currently uses stacked form rows with full-text action buttons:
`Up`, `Down`, `Duplicate`, and `Remove`.

That creates three problems:

1. repeated rows consume too much space
2. row actions look bulky compared with the actual editing fields
3. repeated labels like `Mapping 1`, `Mapping 2` add noise without adding much
   meaning

The current structure already has reusable row logic for:

- add row
- duplicate row
- remove row
- move row up/down
- preserving at least one blank row
- serializing/sanitizing draft state on save

That behavior is correct and should remain intact.

## Chosen Direction

Use a balanced grouped-row layout inside the modal:

- each repeated row becomes a compact card
- each row card has a header line
- the header line uses:
  - left: drag handle
  - middle: short name field
  - right: compact icon action buttons
- the larger expression editor stays below the header

This keeps the row visually grouped while making the highest-frequency controls
faster to use and easier to scan.

## Layout Design

### Repeated Row Cards

Repeated row groups should render each item as a soft card with:

- light border
- moderate rounding
- compact internal padding
- tighter spacing within a row than between rows

The card structure should feel like a lightweight editor block, not a generic
fieldset.

### Row Header

Each row header should contain:

- drag handle on the left
- short name field in the center
- action icons on the right

Redundant labels like `Mapping 1`, `Aggregate 2`, or `Field 3` should be
removed from the visible layout for repeated rows.

The short name field is intentionally inline because names are usually brief and
do not need a full-width stacked layout.

### Expression Body

For rows with expressions:

- the expression field stays below the row header
- it remains the primary visual element in the row body
- validation diagnostics stay attached directly below the expression field
- autocomplete suggestions should continue to appear near the field in the
  current style family

For rows without long expressions, such as `fromTable` fields, the row can stay
single-level if that remains visually cleaner.

## Interaction Design

### Reordering

Reordering should support both:

- drag handle reorder as the primary interaction
- move-up/move-down icon buttons as the fallback interaction

The fallback buttons are required for:

- precision adjustments
- keyboard-accessible reordering
- users who do not use drag comfortably

### Row Actions

Row actions should become compact icon buttons:

- move up
- move down
- duplicate
- remove

These buttons should keep explicit `aria-label`s describing the action and row.

Disabled states for first/last row movement should remain visible but subdued.

### Add Row Actions

Add-row actions should remain text buttons rather than icons. They are lower
frequency and benefit from clearer labeling.

They should still be visually lighter and cleaner than the current row-action
button cluster.

## Modal Hierarchy Refresh

The modal shell should get a modest hierarchy pass:

- stronger section separation
- clearer section titles such as `Group By` and `Aggregates`
- tighter spacing inside sections
- larger spacing between major sections
- more stable footer separation from the body

Use a sticky footer for the modal if it can be added without restructuring the
modal state flow. If it introduces disproportionate implementation complexity,
omit it from this pass.

The intent is not a dramatic redesign. The modal should simply feel more like a
purpose-built query editor.

## Scope by Editor Type

This refresh applies primarily to repeated-row editors:

- `fromTable` field rows
- `select` mapping rows
- `aggregation` group-by rows
- `aggregation` aggregate rows
- `sort` item rows

Single-field editors like `where`, `join`, and `limit` should only receive
indirect visual benefit from improved modal spacing and hierarchy.

## Component Design

### Reusable Row Action Bar

Introduce a reusable compact row action bar component responsible for:

- icon rendering
- disabled states
- consistent spacing/sizing
- accessible labels

This should replace the current text-button row action cluster.

### Reorderable Row Wrapper

Introduce a reusable wrapper for repeated row groups that can host:

- drag handle UI
- reorder callbacks
- row card layout

This wrapper should be applied only where the row group is naturally
reorderable.

### Data Logic Boundaries

The row data mutation logic should remain close to the existing editor code
unless there is very obvious duplication worth extracting. This keeps the
change focused on UX structure rather than broad refactoring.

## Accessibility

Even with denser controls, accessibility requirements remain:

- all icon buttons need descriptive `aria-label`s
- drag handles need a clear focus/hover affordance
- move-up/move-down buttons remain available as keyboard-accessible fallback
- focus states should remain visible against the modal background
- diagnostics must remain readable and visually associated with the edited field

## Error Handling and Edge Cases

- removing the last row must still leave one blank row
- duplicate, remove, reorder, and save flows must preserve current data behavior
- drag reordering must not break controlled input state within the row
- expression diagnostics must remain stable during row movement
- rows with invalid expressions must still save unchanged

## Testing Strategy

Add or update tests to cover:

- icon-button row actions still performing move, duplicate, and remove correctly
- drag reorder updates row order correctly for at least one repeated row group
- save behavior remains unchanged after the UI refactor
- blank-row preservation remains unchanged
- modal expression diagnostics still render correctly inside the refreshed row
  layout

At least one modal test should exercise:

- drag reorder path
- icon fallback reorder path

## Risks and Mitigations

### Risk: Drag reorder complicates controlled row inputs

Mitigation:

- apply drag behavior only to repeated row groups
- keep stable row identity handling explicit in the implementation
- cover reorder flows with modal tests

### Risk: Denser layout could make diagnostics feel cramped

Mitigation:

- keep expression body visually separate from the header line
- preserve padding around diagnostics and suggestions

### Risk: Icon-only actions could become unclear

Mitigation:

- use conventional icons
- keep `aria-label`s
- ensure hover/focus states make each action readable and intentional

## Implementation Notes

Recommended implementation direction:

1. refactor row action UI into compact icon controls
2. convert repeated rows into grouped cards with inline name headers
3. add drag-handle reorder support
4. tighten modal section spacing and hierarchy
5. apply only light node-card polish if a very low-cost improvement is obvious

This ordering keeps behavioral regressions easier to isolate while improving the
highest-impact UX surfaces first.
