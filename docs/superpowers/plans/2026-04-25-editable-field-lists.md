# Editable Field Lists Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add add/remove/reorder/duplicate row editing to the centered modal for `fromTable`, `select`, and `aggregation` nodes while keeping the persisted graph document shape unchanged.

**Architecture:** Keep all editor-only list behavior inside `src/features/graph-editor/nodeEditors.tsx` by introducing row draft helpers, save-time sanitization, and a serialization function that converts editor drafts back to persisted `GraphNode` data. `NodeEditorModal.tsx` remains the modal shell, but saves through the serializer so placeholder rows never leak into stored node data.

**Tech Stack:** Bun 1.3, React 19, TypeScript, Testing Library, Bun test

---

## File Structure

- `src/features/graph-editor/nodeEditors.tsx`
  Own editor-only row draft types, blank-row helpers, row actions, `fromTable` row editor, shared named-expression row editor, and save-time serialization.
- `src/features/graph-editor/NodeEditorModal.tsx`
  Save the serialized editor draft instead of the raw draft object.
- `src/features/graph-editor/NodeEditorModal.test.tsx`
  Add focused modal interaction coverage for `fromTable`, `select`, and `aggregation` row-list behavior.
- `src/index.css`
  Add compact modal row-list layout and row-action button styles.

## Task 1: Add Editable FromTable Field Rows

**Files:**
- Modify: `src/features/graph-editor/NodeEditorModal.test.tsx`
- Modify: `src/features/graph-editor/nodeEditors.tsx`
- Modify: `src/features/graph-editor/NodeEditorModal.tsx`
- Modify: `src/index.css`
- Test: `src/features/graph-editor/NodeEditorModal.test.tsx`

- [ ] **Step 1: Write the failing `fromTable` modal tests**

```tsx
// src/features/graph-editor/NodeEditorModal.test.tsx
test("adds fromTable field rows and strips blank placeholders on save", async () => {
  const user = userEvent.setup();
  const onSave = mock();

  const node: GraphNode = {
    id: "from-orders",
    kind: "fromTable",
    label: "Orders",
    position: { x: 0, y: 0 },
    data: {
      tableRef: { schemaName: "sales", tableName: "orders" },
      columns: { order_id: "int" },
    },
  };

  render(<NodeEditorModal node={node} onClose={() => {}} onSave={onSave} />);

  await user.click(screen.getByRole("button", { name: "Add field" }));
  await user.type(screen.getByLabelText("Field name 2"), "status");
  await user.selectOptions(screen.getByLabelText("Field type 2"), "string");
  await user.click(screen.getByRole("button", { name: "Save" }));

  expect(onSave).toHaveBeenCalled();
  expect(onSave.mock.calls[0][0].data.columns).toEqual({
    order_id: "int",
    status: "string",
  });
});

test("keeps one blank fromTable field row when removing the last row", async () => {
  const user = userEvent.setup();

  const node: GraphNode = {
    id: "from-orders",
    kind: "fromTable",
    label: "Orders",
    position: { x: 0, y: 0 },
    data: {
      tableRef: { tableName: "orders" },
      columns: { order_id: "int" },
    },
  };

  render(<NodeEditorModal node={node} onClose={() => {}} onSave={() => {}} />);

  await user.click(screen.getByRole("button", { name: "Remove field 1" }));

  expect((screen.getByLabelText("Field name 1") as HTMLInputElement).value).toBe("");
  expect((screen.getByLabelText("Field type 1") as HTMLSelectElement).value).toBe(
    "string",
  );
});

test("duplicates and reorders fromTable field rows before save", async () => {
  const user = userEvent.setup();
  const onSave = mock();

  const node: GraphNode = {
    id: "from-orders",
    kind: "fromTable",
    label: "Orders",
    position: { x: 0, y: 0 },
    data: {
      tableRef: { tableName: "orders" },
      columns: {
        order_id: "int",
        status: "string",
      },
    },
  };

  render(<NodeEditorModal node={node} onClose={() => {}} onSave={onSave} />);

  await user.click(screen.getByRole("button", { name: "Duplicate field 2" }));
  await user.clear(screen.getByLabelText("Field name 3"));
  await user.type(screen.getByLabelText("Field name 3"), "customer_id");
  await user.click(screen.getByRole("button", { name: "Move field 3 up" }));
  await user.click(screen.getByRole("button", { name: "Save" }));

  expect(onSave).toHaveBeenCalled();
  expect(Object.entries(onSave.mock.calls[0][0].data.columns)).toEqual([
    ["order_id", "int"],
    ["customer_id", "string"],
    ["status", "string"],
  ]);
});
```

- [ ] **Step 2: Run the modal test file to verify the new `fromTable` tests fail**

Run: `bun test src/features/graph-editor/NodeEditorModal.test.tsx`  
Expected: FAIL because the modal does not render `Add field`, `Remove field 1`, `Duplicate field 2`, `Move field 3 up`, `Field name 2`, or `Field type 2`.

- [ ] **Step 3: Implement editor drafts, field-row actions, and save serialization**

```tsx
// src/features/graph-editor/NodeEditorModal.tsx
import type { GraphNode } from "../../domain/document/types";
import {
  renderNodeEditor,
  serializeNodeEditorDraft,
  useEditableNode,
} from "./nodeEditors";

export function NodeEditorModal({
  node,
  onClose,
  onSave,
}: {
  node: GraphNode;
  onClose: () => void;
  onSave: (node: GraphNode) => void;
}) {
  const { draft, setDraft } = useEditableNode(node);

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <div className="modal-kind">{node.kind}</div>
            <h2>{node.label}</h2>
          </div>
        </header>

        <section className="modal-body">{renderNodeEditor(draft, setDraft)}</section>

        <footer className="modal-footer">
          <button type="button" className="ghost-button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="solid-button"
            onClick={() => onSave(serializeNodeEditorDraft(draft))}
          >
            Save
          </button>
        </footer>
      </div>
    </div>
  );
}
```

```tsx
// src/features/graph-editor/nodeEditors.tsx
import { useEffect, useState } from "react";
import type {
  GraphNode,
  NamedExpression,
  SortItem,
} from "../../domain/document/types";
import type { ColumnMap, ColumnType, TableRef } from "../../domain/schema/types";

type FieldRow = {
  name: string;
  type: ColumnType;
};

type FromTableEditorDraft = Omit<Extract<GraphNode, { kind: "fromTable" }>, "data"> & {
  data: {
    tableRef: TableRef;
    fieldRows: FieldRow[];
  };
};

type EditableNodeDraft =
  | Exclude<GraphNode, Extract<GraphNode, { kind: "fromTable" }>>
  | FromTableEditorDraft;

const columnTypes: ColumnType[] = [
  "boolean",
  "int",
  "float",
  "string",
  "date",
  "timestamp",
  "null",
  "unknown",
];

function blankFieldRow(): FieldRow {
  return { name: "", type: "string" };
}

function ensureAtLeastOneRow<T>(rows: T[], createBlank: () => T) {
  return rows.length > 0 ? rows : [createBlank()];
}

function addRow<T>(rows: T[], createBlank: () => T) {
  return [...rows, createBlank()];
}

function moveRow<T>(rows: T[], index: number, direction: -1 | 1) {
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= rows.length) {
    return rows;
  }

  const next = [...rows];
  [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
  return next;
}

function duplicateRow<T>(rows: T[], index: number, cloneRow: (row: T) => T) {
  return [
    ...rows.slice(0, index + 1),
    cloneRow(rows[index]),
    ...rows.slice(index + 1),
  ];
}

function removeRow<T>(rows: T[], index: number, createBlank: () => T) {
  const next = rows.filter((_, rowIndex) => rowIndex !== index);
  return ensureAtLeastOneRow(next, createBlank);
}

function RowActionButtons({
  itemLabel,
  index,
  rowCount,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onRemove,
}: {
  itemLabel: string;
  index: number;
  rowCount: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="row-editor-actions">
      <button
        type="button"
        className="row-action-button"
        aria-label={`Move ${itemLabel.toLowerCase()} ${index + 1} up`}
        disabled={index === 0}
        onClick={onMoveUp}
      >
        Up
      </button>
      <button
        type="button"
        className="row-action-button"
        aria-label={`Move ${itemLabel.toLowerCase()} ${index + 1} down`}
        disabled={index === rowCount - 1}
        onClick={onMoveDown}
      >
        Down
      </button>
      <button
        type="button"
        className="row-action-button"
        aria-label={`Duplicate ${itemLabel.toLowerCase()} ${index + 1}`}
        onClick={onDuplicate}
      >
        Duplicate
      </button>
      <button
        type="button"
        className="row-action-button"
        aria-label={`Remove ${itemLabel.toLowerCase()} ${index + 1}`}
        onClick={onRemove}
      >
        Remove
      </button>
    </div>
  );
}

function toEditableNodeDraft(node: GraphNode): EditableNodeDraft {
  if (node.kind !== "fromTable") {
    return node;
  }

  return {
    ...node,
    data: {
      tableRef: node.data.tableRef,
      fieldRows: ensureAtLeastOneRow(
        Object.entries(node.data.columns).map(([name, type]) => ({ name, type })),
        blankFieldRow,
      ),
    },
  };
}

export function serializeNodeEditorDraft(draft: EditableNodeDraft): GraphNode {
  if (draft.kind !== "fromTable") {
    return draft;
  }

  return {
    ...draft,
    data: {
      tableRef: draft.data.tableRef,
      columns: Object.fromEntries(
        draft.data.fieldRows
          .map((row) => ({ ...row, name: row.name.trim() }))
          .filter((row) => row.name !== "")
          .map((row) => [row.name, row.type]),
      ) as ColumnMap,
    },
  };
}

function FieldRowsEditor({
  rows,
  onChange,
}: {
  rows: FieldRow[];
  onChange: (rows: FieldRow[]) => void;
}) {
  return (
    <div className="editor-stack">
      {rows.map((row, index) => (
        <div key={index} className="row-editor-card">
          <div className="row-editor-fields">
            <label>
              {`Field name ${index + 1}`}
              <input
                value={row.name}
                onChange={(event) => {
                  const next = [...rows];
                  next[index] = { ...row, name: event.target.value };
                  onChange(next);
                }}
              />
            </label>
            <label>
              {`Field type ${index + 1}`}
              <select
                value={row.type}
                onChange={(event) => {
                  const next = [...rows];
                  next[index] = { ...row, type: event.target.value as ColumnType };
                  onChange(next);
                }}
              >
                {columnTypes.map((columnType) => (
                  <option key={columnType} value={columnType}>
                    {columnType}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <RowActionButtons
            itemLabel="Field"
            index={index}
            rowCount={rows.length}
            onMoveUp={() => onChange(moveRow(rows, index, -1))}
            onMoveDown={() => onChange(moveRow(rows, index, 1))}
            onDuplicate={() =>
              onChange(duplicateRow(rows, index, (fieldRow) => ({ ...fieldRow })))
            }
            onRemove={() => onChange(removeRow(rows, index, blankFieldRow))}
          />
        </div>
      ))}
      <button
        type="button"
        className="ghost-button"
        onClick={() => onChange(addRow(rows, blankFieldRow))}
      >
        Add field
      </button>
    </div>
  );
}

export function useEditableNode(node: GraphNode) {
  const [draft, setDraft] = useState<EditableNodeDraft>(() => toEditableNodeDraft(node));

  useEffect(() => {
    setDraft(toEditableNodeDraft(node));
  }, [node.id]);

  return { draft, setDraft };
}

export function renderNodeEditor(
  draft: EditableNodeDraft,
  setDraft: (node: EditableNodeDraft) => void,
) {
  switch (draft.kind) {
    case "fromTable":
      return (
        <>
          <label>
            Table
            <input
              value={
                draft.data.tableRef.schemaName
                  ? `${draft.data.tableRef.schemaName}.${draft.data.tableRef.tableName}`
                  : draft.data.tableRef.tableName
              }
              onChange={(event) => {
                const [schemaName, tableName] = event.target.value.includes(".")
                  ? event.target.value.split(".", 2)
                  : [undefined, event.target.value];
                setDraft({
                  ...draft,
                  data: {
                    ...draft.data,
                    tableRef: { schemaName, tableName },
                  },
                });
              }}
            />
          </label>
          <FieldRowsEditor
            rows={draft.data.fieldRows}
            onChange={(fieldRows) =>
              setDraft({
                ...draft,
                data: {
                  ...draft.data,
                  fieldRows,
                },
              })
            }
          />
        </>
      );
    // keep all existing non-fromTable branches unchanged in this task
  }
}
```

```css
/* src/index.css */
.row-editor-card {
  display: grid;
  gap: 12px;
  padding: 14px;
  border: 1px solid rgba(57, 47, 35, 0.12);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.72);
}

.row-editor-fields {
  display: grid;
  gap: 12px;
}

.row-editor-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.row-action-button {
  border-radius: 999px;
  padding: 8px 12px;
  border: 1px solid rgba(31, 29, 26, 0.16);
  background: rgba(255, 255, 255, 0.92);
  color: #1f1d1a;
  cursor: pointer;
}

@media (min-width: 720px) {
  .row-editor-fields {
    grid-template-columns: minmax(0, 1fr) 180px;
  }
}
```

- [ ] **Step 4: Run the modal test file to verify the `fromTable` tests pass**

Run: `bun test src/features/graph-editor/NodeEditorModal.test.tsx`  
Expected: PASS for the new `fromTable` tests and the existing modal tests.

- [ ] **Step 5: Commit the `fromTable` row-list slice**

```bash
git add src/features/graph-editor/NodeEditorModal.test.tsx src/features/graph-editor/nodeEditors.tsx src/features/graph-editor/NodeEditorModal.tsx src/index.css
git commit -m "feat: add editable fromTable field rows"
```

## Task 2: Add Editable Select Mapping Lists

**Files:**
- Modify: `src/features/graph-editor/NodeEditorModal.test.tsx`
- Modify: `src/features/graph-editor/nodeEditors.tsx`
- Modify: `src/index.css`
- Test: `src/features/graph-editor/NodeEditorModal.test.tsx`

- [ ] **Step 1: Write the failing `select` modal tests**

```tsx
// src/features/graph-editor/NodeEditorModal.test.tsx
test("duplicates and reorders select mappings before save", async () => {
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

  render(<NodeEditorModal node={node} onClose={() => {}} onSave={onSave} />);

  await user.click(screen.getByRole("button", { name: "Duplicate mapping 1" }));
  await user.click(screen.getByRole("button", { name: "Move mapping 3 up" }));
  await user.click(screen.getByRole("button", { name: "Save" }));

  expect(onSave).toHaveBeenCalled();
  expect(onSave.mock.calls[0][0].data.mappings).toEqual([
    { name: "gross_total", expression: "total" },
    { name: "status_text", expression: "status" },
    { name: "gross_total", expression: "total" },
  ]);
});

test("strips blank select placeholders but preserves partially filled mappings", async () => {
  const user = userEvent.setup();
  const onSave = mock();

  const node: GraphNode = {
    id: "select-orders",
    kind: "select",
    label: "Project",
    position: { x: 0, y: 0 },
    data: {
      mappings: [],
    },
  };

  render(<NodeEditorModal node={node} onClose={() => {}} onSave={onSave} />);

  await user.type(screen.getByLabelText("Mapping name 1"), "gross_total");
  await user.click(screen.getByRole("button", { name: "Add mapping" }));
  await user.click(screen.getByRole("button", { name: "Save" }));

  expect(onSave).toHaveBeenCalled();
  expect(onSave.mock.calls[0][0].data.mappings).toEqual([
    { name: "gross_total", expression: "" },
  ]);
});
```

- [ ] **Step 2: Run the modal test file to verify the new `select` tests fail**

Run: `bun test src/features/graph-editor/NodeEditorModal.test.tsx`  
Expected: FAIL because the `select` editor does not render `Duplicate mapping 1`, `Move mapping 3 up`, `Add mapping`, or save-time placeholder filtering.

- [ ] **Step 3: Refactor shared row actions and wire them into the `select` editor**

```tsx
// src/features/graph-editor/nodeEditors.tsx
function blankNamedExpression(): NamedExpression {
  return { name: "", expression: "" };
}

function sanitizeNamedExpressions(rows: NamedExpression[]) {
  return rows
    .map((row) => ({
      name: row.name.trim(),
      expression: row.expression.trim(),
    }))
    .filter((row) => row.name !== "" || row.expression !== "");
}

function NamedExpressionListEditor({
  rows,
  itemLabel,
  addLabel,
  onChange,
}: {
  rows: NamedExpression[];
  itemLabel: string;
  addLabel: string;
  onChange: (rows: NamedExpression[]) => void;
}) {
  return (
    <div className="editor-stack">
      {rows.map((row, index) => (
        <div key={index} className="row-editor-card">
          <div className="editor-stack">
            <label>
              {`${itemLabel} name ${index + 1}`}
              <input
                value={row.name}
                onChange={(event) => {
                  const next = [...rows];
                  next[index] = { ...row, name: event.target.value };
                  onChange(next);
                }}
              />
            </label>
            <label>
              {`${itemLabel} expression ${index + 1}`}
              <textarea
                value={row.expression}
                onChange={(event) => {
                  const next = [...rows];
                  next[index] = { ...row, expression: event.target.value };
                  onChange(next);
                }}
              />
            </label>
          </div>
          <RowActionButtons
            itemLabel={itemLabel}
            index={index}
            rowCount={rows.length}
            onMoveUp={() => onChange(moveRow(rows, index, -1))}
            onMoveDown={() => onChange(moveRow(rows, index, 1))}
            onDuplicate={() =>
              onChange(duplicateRow(rows, index, (mapping) => ({ ...mapping })))
            }
            onRemove={() => onChange(removeRow(rows, index, blankNamedExpression))}
          />
        </div>
      ))}
      <button
        type="button"
        className="ghost-button"
        onClick={() => onChange(addRow(rows, blankNamedExpression))}
      >
        {addLabel}
      </button>
    </div>
  );
}

function toEditableNodeDraft(node: GraphNode): EditableNodeDraft {
  if (node.kind === "select") {
    return {
      ...node,
      data: {
        mappings: ensureAtLeastOneRow(node.data.mappings, blankNamedExpression),
      },
    };
  }

  if (node.kind === "fromTable") {
    return {
      ...node,
      data: {
        tableRef: node.data.tableRef,
        fieldRows: ensureAtLeastOneRow(
          Object.entries(node.data.columns).map(([name, type]) => ({ name, type })),
          blankFieldRow,
        ),
      },
    };
  }

  return node;
}

export function serializeNodeEditorDraft(draft: EditableNodeDraft): GraphNode {
  if (draft.kind === "select") {
    return {
      ...draft,
      data: {
        mappings: sanitizeNamedExpressions(draft.data.mappings),
      },
    };
  }

  if (draft.kind === "fromTable") {
    return {
      ...draft,
      data: {
        tableRef: draft.data.tableRef,
        columns: Object.fromEntries(
          draft.data.fieldRows
            .map((row) => ({ ...row, name: row.name.trim() }))
            .filter((row) => row.name !== "")
            .map((row) => [row.name, row.type]),
        ) as ColumnMap,
      },
    };
  }

  return draft;
}

export function renderNodeEditor(
  draft: EditableNodeDraft,
  setDraft: (node: EditableNodeDraft) => void,
) {
  switch (draft.kind) {
    case "select":
      return (
        <NamedExpressionListEditor
          rows={draft.data.mappings}
          itemLabel="Mapping"
          addLabel="Add mapping"
          onChange={(mappings) =>
            setDraft({
              ...draft,
              data: { mappings },
            })
          }
        />
      );
    // keep all other branches unchanged in this task
  }
}
```

```css
/* src/index.css */
.row-action-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
```

- [ ] **Step 4: Run the modal test file to verify the `select` tests pass**

Run: `bun test src/features/graph-editor/NodeEditorModal.test.tsx`  
Expected: PASS for the new `select` tests, the `fromTable` tests, and the existing modal tests.

- [ ] **Step 5: Commit the `select` row-list slice**

```bash
git add src/features/graph-editor/NodeEditorModal.test.tsx src/features/graph-editor/nodeEditors.tsx src/index.css
git commit -m "feat: add editable select mapping rows"
```

## Task 3: Add Editable Aggregation Group And Aggregate Lists

**Files:**
- Modify: `src/features/graph-editor/NodeEditorModal.test.tsx`
- Modify: `src/features/graph-editor/nodeEditors.tsx`
- Test: `src/features/graph-editor/NodeEditorModal.test.tsx`

- [ ] **Step 1: Write the failing `aggregation` modal test**

```tsx
// src/features/graph-editor/NodeEditorModal.test.tsx
test("edits aggregation group keys and aggregates independently", async () => {
  const user = userEvent.setup();
  const onSave = mock();

  const node: GraphNode = {
    id: "agg-orders",
    kind: "aggregation",
    label: "Aggregate",
    position: { x: 0, y: 0 },
    data: {
      groupBy: [{ name: "customer_id", expression: "customer_id" }],
      aggregates: [{ name: "gross_total", expression: "sum(total)" }],
    },
  };

  render(<NodeEditorModal node={node} onClose={() => {}} onSave={onSave} />);

  await user.click(screen.getByRole("button", { name: "Add group key" }));
  await user.type(screen.getByLabelText("Group key name 2"), "status");
  await user.type(screen.getByLabelText("Group key expression 2"), "status");

  await user.click(screen.getByRole("button", { name: "Duplicate aggregate 1" }));
  await user.clear(screen.getByLabelText("Aggregate name 2"));
  await user.clear(screen.getByLabelText("Aggregate expression 2"));
  await user.type(screen.getByLabelText("Aggregate name 2"), "order_count");
  await user.type(screen.getByLabelText("Aggregate expression 2"), "count(order_id)");

  await user.click(screen.getByRole("button", { name: "Save" }));

  expect(onSave).toHaveBeenCalled();
  expect(onSave.mock.calls[0][0].data.groupBy).toEqual([
    { name: "customer_id", expression: "customer_id" },
    { name: "status", expression: "status" },
  ]);
  expect(onSave.mock.calls[0][0].data.aggregates).toEqual([
    { name: "gross_total", expression: "sum(total)" },
    { name: "order_count", expression: "count(order_id)" },
  ]);
});
```

- [ ] **Step 2: Run the modal test file to verify the new `aggregation` test fails**

Run: `bun test src/features/graph-editor/NodeEditorModal.test.tsx`  
Expected: FAIL because the `aggregation` editor does not render `Add group key`, `Duplicate aggregate 1`, or section-specific row labels.

- [ ] **Step 3: Reuse the shared row-list editor for both aggregation sections**

```tsx
// src/features/graph-editor/nodeEditors.tsx
function toEditableNodeDraft(node: GraphNode): EditableNodeDraft {
  if (node.kind === "aggregation") {
    return {
      ...node,
      data: {
        groupBy: ensureAtLeastOneRow(node.data.groupBy, blankNamedExpression),
        aggregates: ensureAtLeastOneRow(node.data.aggregates, blankNamedExpression),
      },
    };
  }

  if (node.kind === "select") {
    return {
      ...node,
      data: {
        mappings: ensureAtLeastOneRow(node.data.mappings, blankNamedExpression),
      },
    };
  }

  if (node.kind === "fromTable") {
    return {
      ...node,
      data: {
        tableRef: node.data.tableRef,
        fieldRows: ensureAtLeastOneRow(
          Object.entries(node.data.columns).map(([name, type]) => ({ name, type })),
          blankFieldRow,
        ),
      },
    };
  }

  return node;
}

export function serializeNodeEditorDraft(draft: EditableNodeDraft): GraphNode {
  if (draft.kind === "aggregation") {
    return {
      ...draft,
      data: {
        groupBy: sanitizeNamedExpressions(draft.data.groupBy),
        aggregates: sanitizeNamedExpressions(draft.data.aggregates),
      },
    };
  }

  if (draft.kind === "select") {
    return {
      ...draft,
      data: {
        mappings: sanitizeNamedExpressions(draft.data.mappings),
      },
    };
  }

  if (draft.kind === "fromTable") {
    return {
      ...draft,
      data: {
        tableRef: draft.data.tableRef,
        columns: Object.fromEntries(
          draft.data.fieldRows
            .map((row) => ({ ...row, name: row.name.trim() }))
            .filter((row) => row.name !== "")
            .map((row) => [row.name, row.type]),
        ) as ColumnMap,
      },
    };
  }

  return draft;
}

export function renderNodeEditor(
  draft: EditableNodeDraft,
  setDraft: (node: EditableNodeDraft) => void,
) {
  switch (draft.kind) {
    case "aggregation":
      return (
        <div className="editor-stack">
          <h3>Group By</h3>
          <NamedExpressionListEditor
            rows={draft.data.groupBy}
            itemLabel="Group key"
            addLabel="Add group key"
            onChange={(groupBy) =>
              setDraft({
                ...draft,
                data: {
                  ...draft.data,
                  groupBy,
                },
              })
            }
          />

          <h3>Aggregates</h3>
          <NamedExpressionListEditor
            rows={draft.data.aggregates}
            itemLabel="Aggregate"
            addLabel="Add aggregate"
            onChange={(aggregates) =>
              setDraft({
                ...draft,
                data: {
                  ...draft.data,
                  aggregates,
                },
              })
            }
          />
        </div>
      );
    // keep all existing remaining branches unchanged
  }
}
```

- [ ] **Step 4: Run the modal test file, the full test suite, and a production build**

Run: `bun test src/features/graph-editor/NodeEditorModal.test.tsx`  
Expected: PASS

Run: `bun test`  
Expected: PASS

Run: `bun run build`  
Expected: PASS

- [ ] **Step 5: Commit the aggregation slice and final code**

```bash
git add src/features/graph-editor/NodeEditorModal.test.tsx src/features/graph-editor/nodeEditors.tsx src/features/graph-editor/NodeEditorModal.tsx src/index.css
git commit -m "feat: add editable modal field lists"
```

## Task 4: Final Verification And Handoff

**Files:**
- Modify: none
- Test: `src/features/graph-editor/NodeEditorModal.test.tsx`

- [ ] **Step 1: Verify the repository state after the final commit**

Run: `git status --short`  
Expected: clean working tree

- [ ] **Step 2: Re-read the implemented feature against the design spec**

Check these requirements against the merged code:

- `fromTable` rows support add/remove/reorder/duplicate interactions
- `select` rows support add/remove/reorder/duplicate interactions
- `aggregation` `groupBy` and `aggregates` are independent row lists
- each list keeps one blank visible row while editing
- save strips fully blank rows but preserves partially filled rows
- `fromTable` type uses a constrained dropdown of supported types
- persisted graph document shape remains unchanged

- [ ] **Step 3: Capture the final verification commands in the task log**

Run: `bun test`  
Expected: PASS

Run: `bun run build`  
Expected: PASS
