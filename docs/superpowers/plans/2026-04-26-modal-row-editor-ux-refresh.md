# Modal Row Editor UX Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh the node editor modal so repeated row editing uses compact row cards, icon actions, and drag-handle reordering while preserving all current save and validation behavior.

**Architecture:** Introduce stable draft row identities first so drag reorder does not destabilize controlled inputs. Then add reusable row UI primitives for icon actions and grouped row cards, integrate them into the repeated-row editors in `nodeEditors.tsx`, and finish with CSS hierarchy work plus regression coverage in the modal tests.

**Tech Stack:** Bun 1.3, React 19, TypeScript, Testing Library, Bun test, existing app CSS in `src/index.css`

---

## File Structure

- Create: `src/features/graph-editor/rowDrafts.ts`
  Stable row-id helpers for repeated draft rows used by drag reorder and keyed rendering.
- Create: `src/features/graph-editor/rowDrafts.test.ts`
  Unit tests for row-id assignment, duplicate, move, remove, and stripping row ids before save.
- Create: `src/features/graph-editor/RowActionBar.tsx`
  Reusable compact icon-button action cluster for move up, move down, duplicate, and remove.
- Create: `src/features/graph-editor/RowActionBar.test.tsx`
  Component tests for labels, disabled states, and button callbacks.
- Create: `src/features/graph-editor/RowCard.tsx`
  Reusable grouped row shell with left drag handle, inline header content, and row body slot.
- Modify: `src/features/graph-editor/nodeEditors.tsx`
  Convert repeated rows to stable draft-row shapes, integrate drag reorder, inline header name fields, icon actions, and grouped row cards.
- Modify: `src/features/graph-editor/NodeEditorModal.test.tsx`
  Add drag reorder regression coverage, verify accessible labels remain stable, and verify redundant visible numbering is removed.
- Modify: `src/index.css`
  Add compact icon-button styles, grouped row card styles, modal section hierarchy polish, optional sticky footer styles, and screen-reader-only utility styles.

## Task 1: Add Stable Draft Row Identity Helpers

**Files:**
- Create: `src/features/graph-editor/rowDrafts.ts`
- Create: `src/features/graph-editor/rowDrafts.test.ts`
- Test: `src/features/graph-editor/rowDrafts.test.ts`

- [ ] **Step 1: Write the failing helper tests**

```ts
// src/features/graph-editor/rowDrafts.test.ts
import { describe, expect, test } from "bun:test";
import {
  addDraftRow,
  duplicateDraftRow,
  ensureDraftRows,
  moveDraftRow,
  removeDraftRow,
  stripDraftRows,
  type DraftRow,
} from "./rowDrafts";

type MappingRow = {
  name: string;
  expression: string;
};

function blankMapping(): MappingRow {
  return { name: "", expression: "" };
}

describe("rowDrafts", () => {
  test("ensures at least one blank row and strips row ids before save", () => {
    const rows = ensureDraftRows<MappingRow>([], blankMapping);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.rowId).toBeString();
    expect(stripDraftRows(rows)).toEqual([{ name: "", expression: "" }]);
  });

  test("duplicate row gets a fresh row id while preserving field values", () => {
    const rows = ensureDraftRows<MappingRow>(
      [{ name: "gross_total", expression: "sum(total)" }],
      blankMapping,
    );

    const duplicated = duplicateDraftRow(rows, 0, (row) => ({
      name: row.name,
      expression: row.expression,
    }));

    expect(duplicated).toHaveLength(2);
    expect(duplicated[1]?.name).toBe("gross_total");
    expect(duplicated[1]?.expression).toBe("sum(total)");
    expect(duplicated[1]?.rowId).not.toBe(duplicated[0]?.rowId);
  });

  test("move and remove preserve row order semantics and one blank fallback row", () => {
    const rows = ensureDraftRows<MappingRow>(
      [
        { name: "a", expression: "1" },
        { name: "b", expression: "2" },
        { name: "c", expression: "3" },
      ],
      blankMapping,
    );

    const moved = moveDraftRow(rows, 2, 0);
    expect(moved.map((row) => row.name)).toEqual(["c", "a", "b"]);

    const removedToOne = removeDraftRow(
      ensureDraftRows([{ name: "solo", expression: "x" }], blankMapping),
      0,
      blankMapping,
    );

    expect(removedToOne).toHaveLength(1);
    expect(stripDraftRows(removedToOne)).toEqual([{ name: "", expression: "" }]);
  });
});
```

- [ ] **Step 2: Run the helper tests to verify they fail**

Run: `bun test src/features/graph-editor/rowDrafts.test.ts`  
Expected: FAIL with `Cannot find module "./rowDrafts"` or missing export errors.

- [ ] **Step 3: Write the minimal row-draft helper implementation**

```ts
// src/features/graph-editor/rowDrafts.ts
export type DraftRow<T> = T & {
  rowId: string;
};

function createRowId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `row-${Math.random().toString(36).slice(2, 10)}`;
}

function withRowId<T extends object>(row: T): DraftRow<T> {
  return { ...row, rowId: createRowId() };
}

export function ensureDraftRows<T extends object>(
  rows: T[],
  createBlank: () => T,
): DraftRow<T>[] {
  const source = rows.length > 0 ? rows : [createBlank()];
  return source.map(withRowId);
}

export function addDraftRow<T extends object>(
  rows: DraftRow<T>[],
  createBlank: () => T,
) {
  return [...rows, withRowId(createBlank())];
}

export function moveDraftRow<T extends object>(
  rows: DraftRow<T>[],
  fromIndex: number,
  toIndex: number,
) {
  if (
    fromIndex < 0 ||
    fromIndex >= rows.length ||
    toIndex < 0 ||
    toIndex >= rows.length ||
    fromIndex === toIndex
  ) {
    return rows;
  }

  const next = [...rows];
  const [moved] = next.splice(fromIndex, 1);
  if (!moved) return rows;
  next.splice(toIndex, 0, moved);
  return next;
}

export function duplicateDraftRow<T extends object>(
  rows: DraftRow<T>[],
  index: number,
  cloneRow: (row: DraftRow<T>) => T,
) {
  const source = rows[index];
  if (!source) return rows;

  return [
    ...rows.slice(0, index + 1),
    withRowId(cloneRow(source)),
    ...rows.slice(index + 1),
  ];
}

export function removeDraftRow<T extends object>(
  rows: DraftRow<T>[],
  index: number,
  createBlank: () => T,
) {
  const next = rows.filter((_, rowIndex) => rowIndex !== index);
  return next.length > 0 ? next : [withRowId(createBlank())];
}

export function stripDraftRows<T extends object>(rows: DraftRow<T>[]): T[] {
  return rows.map(({ rowId: _rowId, ...rest }) => rest as T);
}
```

- [ ] **Step 4: Run the helper tests to verify they pass**

Run: `bun test src/features/graph-editor/rowDrafts.test.ts`  
Expected: PASS with `3 pass, 0 fail`.

- [ ] **Step 5: Commit the helper foundation**

```bash
git add src/features/graph-editor/rowDrafts.ts src/features/graph-editor/rowDrafts.test.ts
git commit -m "feat: add stable draft row helpers"
```

## Task 2: Add Compact Row Action and Row Card Primitives

**Files:**
- Create: `src/features/graph-editor/RowActionBar.tsx`
- Create: `src/features/graph-editor/RowActionBar.test.tsx`
- Create: `src/features/graph-editor/RowCard.tsx`
- Test: `src/features/graph-editor/RowActionBar.test.tsx`

- [ ] **Step 1: Write the failing action-bar component tests**

```tsx
// src/features/graph-editor/RowActionBar.test.tsx
import { describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RowActionBar } from "./RowActionBar";

describe("RowActionBar", () => {
  test("keeps accessible labels and callbacks while rendering icon-only controls", async () => {
    const user = userEvent.setup();
    const onMoveUp = mock();
    const onMoveDown = mock();
    const onDuplicate = mock();
    const onRemove = mock();

    render(
      <RowActionBar
        itemName="mapping"
        rowNumber={2}
        rowCount={3}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        onDuplicate={onDuplicate}
        onRemove={onRemove}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Move mapping 2 up" }));
    await user.click(screen.getByRole("button", { name: "Move mapping 2 down" }));
    await user.click(screen.getByRole("button", { name: "Duplicate mapping 2" }));
    await user.click(screen.getByRole("button", { name: "Remove mapping 2" }));

    expect(onMoveUp).toHaveBeenCalledTimes(1);
    expect(onMoveDown).toHaveBeenCalledTimes(1);
    expect(onDuplicate).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  test("disables move controls at the list boundaries", () => {
    render(
      <RowActionBar
        itemName="field"
        rowNumber={1}
        rowCount={1}
        onMoveUp={() => {}}
        onMoveDown={() => {}}
        onDuplicate={() => {}}
        onRemove={() => {}}
      />,
    );

    expect(screen.getByRole("button", { name: "Move field 1 up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move field 1 down" })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run the action-bar tests to verify they fail**

Run: `bun test src/features/graph-editor/RowActionBar.test.tsx`  
Expected: FAIL with `Cannot find module "./RowActionBar"`.

- [ ] **Step 3: Write the reusable action bar and row card components**

```tsx
// src/features/graph-editor/RowActionBar.tsx
type RowActionBarProps = {
  itemName: string;
  rowNumber: number;
  rowCount: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
};

export function RowActionBar({
  itemName,
  rowNumber,
  rowCount,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onRemove,
}: RowActionBarProps) {
  return (
    <div className="row-action-bar">
      <button
        type="button"
        className="row-icon-button"
        aria-label={`Move ${itemName} ${rowNumber} up`}
        disabled={rowNumber === 1}
        onClick={onMoveUp}
      >
        ↑
      </button>
      <button
        type="button"
        className="row-icon-button"
        aria-label={`Move ${itemName} ${rowNumber} down`}
        disabled={rowNumber === rowCount}
        onClick={onMoveDown}
      >
        ↓
      </button>
      <button
        type="button"
        className="row-icon-button"
        aria-label={`Duplicate ${itemName} ${rowNumber}`}
        onClick={onDuplicate}
      >
        ⧉
      </button>
      <button
        type="button"
        className="row-icon-button row-icon-button-danger"
        aria-label={`Remove ${itemName} ${rowNumber}`}
        onClick={onRemove}
      >
        ×
      </button>
    </div>
  );
}

// src/features/graph-editor/RowCard.tsx
import type { ReactNode } from "react";

type RowCardProps = {
  dragLabel: string;
  draggable?: boolean;
  onDragStart?: () => void;
  onDragOver?: () => void;
  onDrop?: () => void;
  header: ReactNode;
  actions: ReactNode;
  children?: ReactNode;
};

export function RowCard({
  dragLabel,
  draggable = false,
  onDragStart,
  onDragOver,
  onDrop,
  header,
  actions,
  children,
}: RowCardProps) {
  return (
    <section
      className="row-card"
      draggable={draggable}
      onDragStart={draggable ? onDragStart : undefined}
      onDragOver={
        draggable
          ? (event) => {
              event.preventDefault();
              onDragOver?.();
            }
          : undefined
      }
      onDrop={
        draggable
          ? (event) => {
              event.preventDefault();
              onDrop?.();
            }
          : undefined
      }
    >
      <div className="row-card-header">
        <button
          type="button"
          className="row-drag-handle"
          aria-label={dragLabel}
          tabIndex={-1}
        >
          ⋮⋮
        </button>
        <div className="row-card-title">{header}</div>
        {actions}
      </div>
      {children ? <div className="row-card-body">{children}</div> : null}
    </section>
  );
}
```

- [ ] **Step 4: Run the primitive tests to verify they pass**

Run: `bun test src/features/graph-editor/RowActionBar.test.tsx`  
Expected: PASS with `2 pass, 0 fail`.

- [ ] **Step 5: Commit the reusable row primitives**

```bash
git add src/features/graph-editor/RowActionBar.tsx src/features/graph-editor/RowActionBar.test.tsx src/features/graph-editor/RowCard.tsx
git commit -m "feat: add compact row editor primitives"
```

## Task 3: Integrate Grouped Row Cards and Drag Reordering Into Modal Editors

**Files:**
- Modify: `src/features/graph-editor/nodeEditors.tsx`
- Modify: `src/features/graph-editor/NodeEditorModal.test.tsx`
- Test: `src/features/graph-editor/NodeEditorModal.test.tsx`

- [ ] **Step 1: Write the failing modal integration tests**

```tsx
// Add to src/features/graph-editor/NodeEditorModal.test.tsx
import { fireEvent } from "@testing-library/react";

test("reorders select mappings by dragging the row handle", async () => {
  const user = userEvent.setup();
  const onSave = mock();

  const node: GraphNode = {
    id: "select-orders",
    kind: "select",
    label: "Project",
    position: { x: 0, y: 0 },
    data: {
      mappings: [
        { name: "gross_total", expression: "total" },
        { name: "status_text", expression: "status" },
      ],
    },
  };

  renderModal({ node, onSave });

  const firstCard = screen.getByTestId("mapping-row-card-1");
  const secondCard = screen.getByTestId("mapping-row-card-2");

  fireEvent.dragStart(firstCard);
  fireEvent.dragOver(secondCard);
  fireEvent.drop(secondCard);

  await user.click(screen.getByRole("button", { name: "Save" }));

  expect(onSave).toHaveBeenCalled();
  expect(onSave.mock.calls[0][0].data.mappings).toEqual([
    { name: "status_text", expression: "status" },
    { name: "gross_total", expression: "total" },
  ]);
});

test("removes visible mapping numbering while keeping accessible field labels", () => {
  const node: GraphNode = {
    id: "select-orders",
    kind: "select",
    label: "Project",
    position: { x: 0, y: 0 },
    data: {
      mappings: [{ name: "gross_total", expression: "total" }],
    },
  };

  renderModal({ node });

  expect(screen.queryByText("Mapping 1")).toBeNull();
  expect(screen.getByLabelText("Mapping name 1")).toBeTruthy();
  expect(screen.getByLabelText("Expression")).toBeTruthy();
});
```

- [ ] **Step 2: Run the modal tests to verify they fail**

Run: `bun test src/features/graph-editor/NodeEditorModal.test.tsx`  
Expected: FAIL because there are no drag-card test ids, rows are still keyed by index, and visible numbering is still rendered.

- [ ] **Step 3: Integrate stable draft rows, grouped row cards, and drag reorder in `nodeEditors.tsx`**

```tsx
// Key additions inside src/features/graph-editor/nodeEditors.tsx
import { RowActionBar } from "./RowActionBar";
import { RowCard } from "./RowCard";
import {
  addDraftRow,
  duplicateDraftRow,
  ensureDraftRows,
  moveDraftRow,
  removeDraftRow,
  stripDraftRows,
  type DraftRow,
} from "./rowDrafts";

type FieldRowValue = {
  name: string;
  type: ColumnType;
};

type SelectEditorDraft = Omit<Extract<GraphNode, { kind: "select" }>, "data"> & {
  data: {
    mappings: DraftRow<NamedExpression>[];
  };
};

type AggregationEditorDraft = Omit<Extract<GraphNode, { kind: "aggregation" }>, "data"> & {
  data: {
    groupBy: DraftRow<NamedExpression>[];
    aggregates: DraftRow<NamedExpression>[];
  };
};

type SortEditorDraft = Omit<Extract<GraphNode, { kind: "sort" }>, "data"> & {
  data: {
    items: DraftRow<SortItem>[];
  };
};

type FromTableEditorDraft = Omit<FromTableNode, "data"> & {
  data: {
    tableRef: TableRef;
    fieldRows: DraftRow<FieldRowValue>[];
  };
};

type EditableNodeDraft =
  | Exclude<GraphNode, FromTableNode | Extract<GraphNode, { kind: "select" | "aggregation" | "sort" }>>
  | FromTableEditorDraft
  | SelectEditorDraft
  | AggregationEditorDraft
  | SortEditorDraft;

function renderFieldRowCard(...) {
  return (
    <RowCard
      dragLabel={`Reorder field ${index + 1}`}
      draggable={rows.length > 1}
      onDragStart={() => setDraggedRowId(row.rowId)}
      onDrop={() => {
        const fromIndex = rows.findIndex((item) => item.rowId === draggedRowId);
        onChange(moveDraftRow(rows, fromIndex, index));
        setDraggedRowId(null);
      }}
      header={
        <>
          <span className="sr-only">{`Field name ${index + 1}`}</span>
          <input
            aria-label={`Field name ${index + 1}`}
            value={row.name}
            onChange={...}
          />
          <span className="sr-only">{`Field type ${index + 1}`}</span>
          <select
            aria-label={`Field type ${index + 1}`}
            value={row.type}
            onChange={...}
          >
            {columnTypes.map(...)}
          </select>
        </>
      }
      actions={
        <RowActionBar
          itemName="field"
          rowNumber={index + 1}
          rowCount={rows.length}
          onMoveUp={() => onChange(moveDraftRow(rows, index, index - 1))}
          onMoveDown={() => onChange(moveDraftRow(rows, index, index + 1))}
          onDuplicate={() =>
            onChange(
              duplicateDraftRow(rows, index, (item) => ({
                name: item.name,
                type: item.type,
              })),
            )
          }
          onRemove={() => onChange(removeDraftRow(rows, index, blankFieldRow))}
        />
      }
    />
  );
}

function renderNamedExpressionRowCard(...) {
  return (
    <RowCard
      dragLabel={`Reorder ${itemName} ${index + 1}`}
      draggable={rows.length > 1}
      onDragStart={() => setDraggedRowId(row.rowId)}
      onDrop={() => {
        const fromIndex = rows.findIndex((item) => item.rowId === draggedRowId);
        onChange(moveDraftRow(rows, fromIndex, index));
        setDraggedRowId(null);
      }}
      header={
        <>
          <span className="sr-only">{nameLabel(index + 1)}</span>
          <input
            aria-label={nameLabel(index + 1)}
            value={row.name}
            onChange={...}
          />
        </>
      }
      actions={
        <RowActionBar
          itemName={itemName}
          rowNumber={index + 1}
          rowCount={rows.length}
          onMoveUp={() => onChange(moveDraftRow(rows, index, index - 1))}
          onMoveDown={() => onChange(moveDraftRow(rows, index, index + 1))}
          onDuplicate={() =>
            onChange(
              duplicateDraftRow(rows, index, (item) => ({
                name: item.name,
                expression: item.expression,
              })),
            )
          }
          onRemove={() =>
            onChange(removeDraftRow(rows, index, blankNamedExpression))
          }
        />
      }
    >
      <ExpressionInput
        label={expressionLabel(index + 1)}
        value={row.expression}
        document={document}
        nodeId={nodeId}
        schemaOverrides={schemaOverrides}
        multiline
        onChange={...}
      />
    </RowCard>
  );
}

// Update toEditableNodeDraft() to wrap select/aggregation/sort/fromTable rows with ensureDraftRows()
// Update serializeNodeEditorDraft() to call stripDraftRows() before existing sanitization logic
// Give row cards stable keys: key={row.rowId}
// Add data-testid={`mapping-row-card-${index + 1}`} and equivalent names for field/group/aggregate cards
```

- [ ] **Step 4: Run the modal tests to verify they pass**

Run: `bun test src/features/graph-editor/NodeEditorModal.test.tsx`  
Expected: PASS with all existing modal tests plus the new drag reorder and numbering-removal tests green.

- [ ] **Step 5: Commit the modal row-card integration**

```bash
git add src/features/graph-editor/nodeEditors.tsx src/features/graph-editor/NodeEditorModal.test.tsx
git commit -m "feat: add compact reorderable modal row cards"
```

## Task 4: Polish Modal Hierarchy and Row/Card Styling

**Files:**
- Modify: `src/index.css`
- Test: `src/features/graph-editor/NodeEditorModal.test.tsx`
- Test: `src/features/graph-editor/RowActionBar.test.tsx`

- [ ] **Step 1: Add a failing modal test for the compact row action affordances**

```tsx
// Add to src/features/graph-editor/NodeEditorModal.test.tsx
test("renders row action controls with accessible icon buttons", () => {
  const node: GraphNode = {
    id: "select-orders",
    kind: "select",
    label: "Project",
    position: { x: 0, y: 0 },
    data: {
      mappings: [{ name: "gross_total", expression: "total" }],
    },
  };

  renderModal({ node });

  expect(screen.getByRole("button", { name: "Move mapping 1 up" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Move mapping 1 down" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Duplicate mapping 1" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Remove mapping 1" })).toBeTruthy();
});
```

- [ ] **Step 2: Run the targeted tests to verify the styling task is anchored**

Run: `bun test src/features/graph-editor/NodeEditorModal.test.tsx src/features/graph-editor/RowActionBar.test.tsx`  
Expected: PASS once the previous task is complete; this anchors the CSS task so later visual cleanup does not remove accessible controls.

- [ ] **Step 3: Update modal and row/card styling in `src/index.css`**

```css
/* Add to src/index.css */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.modal-card {
  display: grid;
  gap: 20px;
}

.modal-footer {
  position: sticky;
  bottom: 0;
  padding-top: 16px;
  background: linear-gradient(180deg, rgba(255, 253, 248, 0) 0%, #fffdf8 32px);
}

.editor-section {
  display: grid;
  gap: 14px;
}

.editor-section > h3 {
  margin: 8px 0 0;
  font-size: 0.95rem;
  letter-spacing: 0.02em;
}

.row-card {
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid rgba(57, 47, 35, 0.12);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.74);
}

.row-card-header {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 10px;
  align-items: center;
}

.row-card-title {
  display: grid;
  gap: 8px;
}

.row-card-body {
  display: grid;
  gap: 8px;
}

.row-drag-handle,
.row-icon-button {
  width: 32px;
  height: 32px;
  display: inline-grid;
  place-items: center;
  border-radius: 10px;
  border: 1px solid rgba(31, 29, 26, 0.14);
  background: rgba(255, 255, 255, 0.96);
  color: #1f1d1a;
  cursor: pointer;
}

.row-drag-handle {
  cursor: grab;
}

.row-action-bar {
  display: inline-flex;
  gap: 6px;
}

.row-icon-button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.row-icon-button-danger {
  color: #7a3524;
}

.row-add-button {
  padding: 7px 12px;
}
```

- [ ] **Step 4: Run the focused UI tests and then the full suite**

Run: `bun test src/features/graph-editor/NodeEditorModal.test.tsx src/features/graph-editor/RowActionBar.test.tsx`  
Expected: PASS.

Run: `bun test`  
Expected: PASS with `0 fail` across the full suite.

- [ ] **Step 5: Commit the modal polish pass**

```bash
git add src/index.css src/features/graph-editor/NodeEditorModal.test.tsx src/features/graph-editor/RowActionBar.test.tsx
git commit -m "style: polish modal row editor hierarchy"
```

## Task 5: Final Verification

**Files:**
- Test: `src/features/graph-editor/rowDrafts.test.ts`
- Test: `src/features/graph-editor/RowActionBar.test.tsx`
- Test: `src/features/graph-editor/NodeEditorModal.test.tsx`
- Test: all repo tests

- [ ] **Step 1: Run the focused regression suite**

Run: `bun test src/features/graph-editor/rowDrafts.test.ts src/features/graph-editor/RowActionBar.test.tsx src/features/graph-editor/NodeEditorModal.test.tsx`  
Expected: PASS with the new helper, primitive, and modal regression coverage green.

- [ ] **Step 2: Run the full repo suite**

Run: `bun test`  
Expected: PASS with `0 fail`.

- [ ] **Step 3: Review the spec against the implementation surface**

Use this checklist before declaring the work complete:

```text
- compact icon row controls added
- drag handle reorder added
- move up/down fallback preserved
- redundant visible row numbering removed
- inline short-name header layout added
- grouped row cards added for repeated modal editors
- modal hierarchy tightened
- save semantics unchanged
- diagnostics/autocomplete still readable
```

- [ ] **Step 4: Confirm the worktree is clean after verification**

```bash
git status --short
```

Expected: no unexpected modified files and no unreviewed test artifacts. If the
worktree is not clean, stop and resolve the remaining changes before declaring
the task complete.
