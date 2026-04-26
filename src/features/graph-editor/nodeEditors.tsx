import { useEffect, useState } from "react";
import type { DragEvent as ReactDragEvent } from "react";
import type {
  GraphDocument,
  GraphNode,
  NamedExpression,
  SortItem,
} from "../../domain/document/types";
import type { ColumnMap, ColumnType, TableRef } from "../../domain/schema/types";
import { ExpressionInput } from "./ExpressionInput";
import { RowActionBar } from "./RowActionBar";
import { RowCard } from "./RowCard";
import {
  addDraftRow,
  duplicateDraftRow,
  ensureDraftRows,
  moveDraftRow,
  removeDraftRow,
  stripDraftRows,
} from "./rowDrafts";
import type { DraftRow } from "./rowDrafts";

type FieldRow = {
  name: string;
  type: ColumnType;
};

type FromTableNode = Extract<GraphNode, { kind: "fromTable" }>;
type SelectNode = Extract<GraphNode, { kind: "select" }>;
type AggregationNode = Extract<GraphNode, { kind: "aggregation" }>;
type SortNode = Extract<GraphNode, { kind: "sort" }>;
type NamedExpressionDraftRow = DraftRow<NamedExpression>;
type SortItemDraftValue = SortItem & {
  isPlaceholder?: boolean;
};
type SortItemDraftRow = DraftRow<SortItemDraftValue>;

type SelectEditorDraft = Omit<SelectNode, "data"> & {
  data: {
    mappings: NamedExpressionDraftRow[];
  };
};

type AggregationEditorDraft = Omit<AggregationNode, "data"> & {
  data: {
    groupBy: NamedExpressionDraftRow[];
    aggregates: NamedExpressionDraftRow[];
  };
};

type FromTableEditorDraft = Omit<FromTableNode, "data"> & {
  data: {
    tableRef: TableRef;
    fieldRows: DraftRow<FieldRow>[];
  };
};

type SortEditorDraft = Omit<SortNode, "data"> & {
  data: {
    items: SortItemDraftRow[];
  };
};

type EditableNodeDraft =
  | Exclude<GraphNode, FromTableNode | SelectNode | AggregationNode | SortNode>
  | SelectEditorDraft
  | AggregationEditorDraft
  | SortEditorDraft
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

const rowDragDataType = "application/x-queryvisual-row-id";

function blankFieldRow(): FieldRow {
  return { name: "", type: "string" };
}

function blankNamedExpression(): NamedExpression {
  return { name: "", expression: "" };
}

function blankSortItem(): SortItem {
  return { expression: "", direction: "asc" };
}

function blankSortItemDraft(options?: { isPlaceholder?: boolean }): SortItemDraftValue {
  return {
    ...blankSortItem(),
    ...(options?.isPlaceholder ? { isPlaceholder: true } : {}),
  };
}

function InlineRowNameInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="row-card-inline-label">
      <span className="sr-only">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function sanitizeNamedExpressions(rows: NamedExpression[]) {
  return rows
    .map((row) => ({
      name: row.name.trim(),
      // Preserve expression text exactly as entered; diagnostics handle invalid values.
      expression: row.expression,
    }))
    .filter((row) => row.name !== "" || row.expression.trim() !== "");
}

function sanitizeSortItems(rows: SortItemDraftRow[]) {
  return rows
    .filter((row) => !row.isPlaceholder)
    .map(({ expression, direction }) => ({ expression, direction }));
}

function ensureSortDraftRows(rows: SortItem[]) {
  if (rows.length > 0) {
    return ensureDraftRows(rows, blankSortItem) as SortItemDraftRow[];
  }

  return ensureDraftRows(
    [blankSortItemDraft({ isPlaceholder: true })],
    () => blankSortItemDraft({ isPlaceholder: true }),
  ) as SortItemDraftRow[];
}

function addSortDraftRow(rows: SortItemDraftRow[]) {
  if (rows.length === 1 && rows[0]?.isPlaceholder) {
    return [{ ...rows[0], isPlaceholder: false }];
  }

  return addDraftRow(rows, () => blankSortItemDraft()) as SortItemDraftRow[];
}

function duplicateSortDraftRow(rows: SortItemDraftRow[], index: number) {
  return duplicateDraftRow(rows, index, (item) => ({
    expression: item.expression,
    direction: item.direction,
  })) as SortItemDraftRow[];
}

function removeSortDraftRow(rows: SortItemDraftRow[], index: number) {
  const next = rows.filter((_, rowIndex) => rowIndex !== index);
  return next.length > 0 ? next : ensureSortDraftRows([]);
}

function handleRowDragStart(
  event: ReactDragEvent<HTMLElement>,
  rowId: string,
  setDraggedRowId: (rowId: string | null) => void,
) {
  setDraggedRowId(rowId);
  if (!event.dataTransfer) return;

  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData(rowDragDataType, rowId);
  event.dataTransfer.setData("text/plain", rowId);
}

function getDraggedRowId(
  event: ReactDragEvent<HTMLElement>,
  draggedRowId: string | null,
) {
  const nativeRowId =
    event.dataTransfer?.getData(rowDragDataType) ||
    event.dataTransfer?.getData("text/plain");

  return nativeRowId || draggedRowId;
}

function FromTableFieldRows({
  rows,
  onChange,
}: {
  rows: DraftRow<FieldRow>[];
  onChange: (rows: DraftRow<FieldRow>[]) => void;
}) {
  const [draggedRowId, setDraggedRowId] = useState<string | null>(null);

  return (
    <div className="editor-stack">
      {rows.map((row, index) => (
        <div key={row.rowId} className="mapping-row">
          <RowCard
            testId={`field-row-card-${index + 1}`}
            dragLabel={`Drag field ${index + 1}`}
            draggable={rows.length > 1}
            onDragStart={(event) =>
              handleRowDragStart(event, row.rowId, setDraggedRowId)
            }
            onDragEnd={() => setDraggedRowId(null)}
            onDragOver={() => {}}
            onDrop={(event) => {
              const activeRowId = getDraggedRowId(event, draggedRowId);
              const fromIndex = rows.findIndex(
                (candidate) => candidate.rowId === activeRowId,
              );
              setDraggedRowId(null);
              if (fromIndex === -1) return;
              onChange(moveDraftRow(rows, fromIndex, index));
            }}
            header={
              <InlineRowNameInput
                label={`Field name ${index + 1}`}
                value={row.name}
                onChange={(name) => {
                  const next = [...rows];
                  next[index] = { ...row, name };
                  onChange(next);
                }}
              />
            }
            actions={
              <RowActionBar
                itemName="field"
                rowNumber={index + 1}
                rowCount={rows.length}
                onMoveUp={() => onChange(moveDraftRow(rows, index, index - 1))}
                onMoveDown={() => onChange(moveDraftRow(rows, index, index + 1))}
                onDuplicate={() =>
                  onChange(duplicateDraftRow(rows, index, (item) => ({ ...item })))
                }
                onRemove={() => onChange(removeDraftRow(rows, index, blankFieldRow))}
              />
            }
          >
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
                {columnTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
          </RowCard>
        </div>
      ))}

      <button
        type="button"
        className="row-add-button"
        onClick={() => onChange(addDraftRow(rows, blankFieldRow))}
      >
        Add field
      </button>
    </div>
  );
}

function toEditableNodeDraft(node: GraphNode): EditableNodeDraft {
  if (node.kind === "select") {
    return {
      ...node,
      data: {
        mappings: ensureDraftRows(node.data.mappings, blankNamedExpression),
      },
    };
  }

  if (node.kind === "aggregation") {
    return {
      ...node,
      data: {
        groupBy: ensureDraftRows(node.data.groupBy, blankNamedExpression),
        aggregates: ensureDraftRows(node.data.aggregates, blankNamedExpression),
      },
    };
  }

  if (node.kind === "sort") {
    return {
      ...node,
      data: {
        items: ensureSortDraftRows(node.data.items),
      },
    };
  }

  if (node.kind !== "fromTable") {
    return node;
  }

  const fieldRows = ensureDraftRows(
    Object.entries(node.data.columns).map(([name, type]) => ({ name, type })),
    blankFieldRow,
  );

  return {
    ...node,
    data: {
      tableRef: node.data.tableRef,
      fieldRows,
    },
  };
}

export function serializeNodeEditorDraft(draft: EditableNodeDraft): GraphNode {
  if (draft.kind === "select") {
    const mappings = stripDraftRows(draft.data.mappings);

    return {
      ...draft,
      data: {
        mappings: sanitizeNamedExpressions(mappings),
      },
    };
  }

  if (draft.kind === "aggregation") {
    const groupBy = stripDraftRows(draft.data.groupBy);
    const aggregates = stripDraftRows(draft.data.aggregates);

    return {
      ...draft,
      data: {
        groupBy: sanitizeNamedExpressions(groupBy),
        aggregates: sanitizeNamedExpressions(aggregates),
      },
    };
  }

  if (draft.kind === "sort") {
    return {
      ...draft,
      data: {
        items: sanitizeSortItems(draft.data.items),
      },
    };
  }

  if (draft.kind !== "fromTable") {
    return draft;
  }

  const columns = Object.fromEntries(
    stripDraftRows(draft.data.fieldRows)
      .filter((row) => row.name.trim() !== "")
      .map((row) => [row.name, row.type]),
  ) as ColumnMap;

  return {
    ...draft,
    data: {
      tableRef: draft.data.tableRef,
      columns,
    },
  };
}

function NamedExpressionRows({
  rows,
  itemName,
  addButtonLabel,
  nameLabel,
  expressionLabel,
  rowCardTestIdPrefix,
  document,
  nodeId,
  schemaOverrides,
  onChange,
}: {
  rows: NamedExpressionDraftRow[];
  itemName: string;
  addButtonLabel: string;
  nameLabel: (rowNumber: number) => string;
  expressionLabel: (rowNumber: number) => string;
  rowCardTestIdPrefix?: string;
  document: GraphDocument;
  nodeId: string;
  schemaOverrides?: Record<string, ColumnMap>;
  onChange: (rows: NamedExpressionDraftRow[]) => void;
}) {
  const [draggedRowId, setDraggedRowId] = useState<string | null>(null);

  return (
    <div className="editor-stack">
      {rows.map((row, index) => (
        <div key={row.rowId} className="mapping-row">
          <RowCard
            testId={
              rowCardTestIdPrefix
                ? `${rowCardTestIdPrefix}-${index + 1}`
                : undefined
            }
            dragLabel={`Drag ${itemName} ${index + 1}`}
            draggable={rows.length > 1}
            onDragStart={(event) =>
              handleRowDragStart(event, row.rowId, setDraggedRowId)
            }
            onDragEnd={() => setDraggedRowId(null)}
            onDragOver={() => {}}
            onDrop={(event) => {
              const activeRowId = getDraggedRowId(event, draggedRowId);
              const fromIndex = rows.findIndex(
                (candidate) => candidate.rowId === activeRowId,
              );
              setDraggedRowId(null);
              if (fromIndex === -1) return;
              onChange(moveDraftRow(rows, fromIndex, index));
            }}
            header={
              <InlineRowNameInput
                label={nameLabel(index + 1)}
                value={row.name}
                onChange={(name) => {
                  const next = [...rows];
                  next[index] = { ...row, name };
                  onChange(next);
                }}
              />
            }
            actions={
              <RowActionBar
                itemName={itemName}
                rowNumber={index + 1}
                rowCount={rows.length}
                onMoveUp={() => onChange(moveDraftRow(rows, index, index - 1))}
                onMoveDown={() => onChange(moveDraftRow(rows, index, index + 1))}
                onDuplicate={() =>
                  onChange(duplicateDraftRow(rows, index, (item) => ({ ...item })))
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
              onChange={(expression) => {
                const next = [...rows];
                next[index] = { ...row, expression };
                onChange(next);
              }}
            />
          </RowCard>
        </div>
      ))}
      <button
        type="button"
        className="row-add-button"
        onClick={() => onChange(addDraftRow(rows, blankNamedExpression))}
      >
        {addButtonLabel}
      </button>
    </div>
  );
}

function SortItemRows({
  rows,
  document,
  nodeId,
  schemaOverrides,
  onChange,
}: {
  rows: SortItemDraftRow[];
  document: GraphDocument;
  nodeId: string;
  schemaOverrides?: Record<string, ColumnMap>;
  onChange: (rows: SortItemDraftRow[]) => void;
}) {
  const [draggedRowId, setDraggedRowId] = useState<string | null>(null);

  return (
    <div className="editor-stack">
      {rows.map((row, index) => (
        <div key={row.rowId} className="mapping-row">
          <RowCard
            testId={`sort-row-card-${index + 1}`}
            dragLabel={`Drag sort item ${index + 1}`}
            draggable={rows.length > 1}
            onDragStart={(event) =>
              handleRowDragStart(event, row.rowId, setDraggedRowId)
            }
            onDragEnd={() => setDraggedRowId(null)}
            onDragOver={() => {}}
            onDrop={(event) => {
              const activeRowId = getDraggedRowId(event, draggedRowId);
              const fromIndex = rows.findIndex(
                (candidate) => candidate.rowId === activeRowId,
              );
              setDraggedRowId(null);
              if (fromIndex === -1) return;
              onChange(moveDraftRow(rows, fromIndex, index));
            }}
            header={null}
            actions={
              <RowActionBar
                itemName="sort item"
                rowNumber={index + 1}
                rowCount={rows.length}
                onMoveUp={() => onChange(moveDraftRow(rows, index, index - 1))}
                onMoveDown={() => onChange(moveDraftRow(rows, index, index + 1))}
                onDuplicate={() => onChange(duplicateSortDraftRow(rows, index))}
                onRemove={() => onChange(removeSortDraftRow(rows, index))}
              />
            }
          >
            <ExpressionInput
              label={`Sort expression ${index + 1}`}
              value={row.expression}
              document={document}
              nodeId={nodeId}
              schemaOverrides={schemaOverrides}
              onChange={(expression) => {
                const next = [...rows];
                next[index] = { ...row, expression, isPlaceholder: false };
                onChange(next);
              }}
            />
            <label>
              {`Sort direction ${index + 1}`}
              <select
                value={row.direction}
                onChange={(event) => {
                  const next = [...rows];
                  next[index] = {
                    ...row,
                    direction: event.target.value as "asc" | "desc",
                    isPlaceholder: false,
                  };
                  onChange(next);
                }}
              >
                <option value="asc">asc</option>
                <option value="desc">desc</option>
              </select>
            </label>
          </RowCard>
        </div>
      ))}
      <button
        type="button"
        className="row-add-button"
        onClick={() => onChange(addSortDraftRow(rows))}
      >
        Add sort item
      </button>
    </div>
  );
}

function SelectMappingRows({
  rows,
  document,
  nodeId,
  schemaOverrides,
  onChange,
}: {
  rows: NamedExpressionDraftRow[];
  document: GraphDocument;
  nodeId: string;
  schemaOverrides?: Record<string, ColumnMap>;
  onChange: (rows: NamedExpressionDraftRow[]) => void;
}) {
  return (
    <NamedExpressionRows
      rows={rows}
      itemName="mapping"
      addButtonLabel="Add mapping"
      nameLabel={(rowNumber) => `Mapping name ${rowNumber}`}
      expressionLabel={() => "Expression"}
      rowCardTestIdPrefix="mapping-row-card"
      document={document}
      nodeId={nodeId}
      schemaOverrides={schemaOverrides}
      onChange={onChange}
    />
  );
}

function ColumnMapEditor({
  columns,
  onChange,
}: {
  columns: ColumnMap;
  onChange: (columns: ColumnMap) => void;
}) {
  const rows = Object.entries(columns);

  return (
    <div className="editor-stack">
      {rows.map(([name, type], index) => (
        <div key={index} className="mapping-row">
          <label>
            {`Column name ${index + 1}`}
            <input
              value={name}
              onChange={(event) => {
                const nextEntries = [...rows];
                nextEntries[index] = [event.target.value, type];
                onChange(
                  Object.fromEntries(nextEntries) as Record<string, ColumnType>,
                );
              }}
            />
          </label>
          <label>
            Type
            <input
              value={type}
              onChange={(event) => {
                const nextEntries = [...rows];
                nextEntries[index] = [name, event.target.value as ColumnType];
                onChange(
                  Object.fromEntries(nextEntries) as Record<string, ColumnType>,
                );
              }}
            />
          </label>
        </div>
      ))}
    </div>
  );
}

export function useEditableNode(node: GraphNode) {
  const [draft, setDraft] = useState<EditableNodeDraft>(() =>
    toEditableNodeDraft(node),
  );

  useEffect(() => {
    setDraft(toEditableNodeDraft(node));
  }, [node.id]);

  return { draft, setDraft };
}

export function renderNodeEditor(
  draft: EditableNodeDraft,
  setDraft: (node: EditableNodeDraft) => void,
  document: GraphDocument,
  schemaOverrides?: Record<string, ColumnMap>,
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
          <FromTableFieldRows
            rows={draft.data.fieldRows}
            onChange={(fieldRows) =>
              setDraft({ ...draft, data: { ...draft.data, fieldRows } })
            }
          />
        </>
      );
    case "where":
      return (
        <ExpressionInput
          label="Predicate"
          value={draft.data.predicate}
          document={document}
          nodeId={draft.id}
          schemaOverrides={schemaOverrides}
          multiline
          requireBoolean
          onChange={(predicate) =>
            setDraft({ ...draft, data: { predicate } })
          }
        />
      );
    case "select":
      return (
        <SelectMappingRows
          rows={draft.data.mappings}
          document={document}
          nodeId={draft.id}
          schemaOverrides={schemaOverrides}
          onChange={(rows) =>
            setDraft({ ...draft, data: { mappings: rows } })
          }
        />
      );
    case "aggregation":
      return (
        <>
          <div className="editor-section">
            <h3>Group By</h3>
            <NamedExpressionRows
              rows={draft.data.groupBy}
              itemName="group key"
              addButtonLabel="Add group key"
              nameLabel={(rowNumber) => `Group key name ${rowNumber}`}
              expressionLabel={(rowNumber) => `Group key expression ${rowNumber}`}
              rowCardTestIdPrefix="group-key-row-card"
              document={document}
              nodeId={draft.id}
              schemaOverrides={schemaOverrides}
              onChange={(rows) =>
                setDraft({ ...draft, data: { ...draft.data, groupBy: rows } })
              }
            />
          </div>
          <div className="editor-section">
            <h3>Aggregates</h3>
            <NamedExpressionRows
              rows={draft.data.aggregates}
              itemName="aggregate"
              addButtonLabel="Add aggregate"
              nameLabel={(rowNumber) => `Aggregate name ${rowNumber}`}
              expressionLabel={(rowNumber) => `Aggregate expression ${rowNumber}`}
              rowCardTestIdPrefix="aggregate-row-card"
              document={document}
              nodeId={draft.id}
              schemaOverrides={schemaOverrides}
              onChange={(rows) =>
                setDraft({
                  ...draft,
                  data: { ...draft.data, aggregates: rows },
                })
              }
            />
          </div>
        </>
      );
    case "sort":
      return (
        <SortItemRows
          rows={draft.data.items}
          document={document}
          nodeId={draft.id}
          schemaOverrides={schemaOverrides}
          onChange={(items) =>
            setDraft({ ...draft, data: { items } })
          }
        />
      );
    case "limit":
      return (
        <>
          <label>
            Limit
            <input
              type="number"
              value={draft.data.count}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  data: {
                    ...draft.data,
                    count: Number(event.target.value),
                  },
                })
              }
            />
          </label>
          <label>
            Offset
            <input
              type="number"
              value={draft.data.offset === null ? "" : draft.data.offset}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  data: {
                    ...draft.data,
                    offset:
                      event.target.value === ""
                        ? null
                        : Number(event.target.value),
                  },
                })
              }
            />
          </label>
        </>
      );
    case "output":
      return (
        <label>
          Output name
          <input
            value={draft.data.outputName}
            onChange={(event) =>
              setDraft({ ...draft, data: { outputName: event.target.value } })
            }
          />
        </label>
      );
    case "join":
      return (
        <>
          <label>
            Join type
            <select
              value={draft.data.joinType}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  data: {
                    ...draft.data,
                    joinType: event.target.value as typeof draft.data.joinType,
                  },
                })
              }
            >
              <option value="inner">inner</option>
              <option value="left">left</option>
              <option value="right">right</option>
              <option value="full">full</option>
            </select>
          </label>
          <ExpressionInput
            label="Predicate"
            value={draft.data.predicate}
            document={document}
            nodeId={draft.id}
            schemaOverrides={schemaOverrides}
            multiline
            requireBoolean
            onChange={(predicate) =>
              setDraft({
                ...draft,
                data: { ...draft.data, predicate },
              })
            }
          />
        </>
      );
    case "graphInput":
      return (
        <ColumnMapEditor
          columns={draft.data.columns}
          onChange={(columns) =>
            setDraft({ ...draft, data: { columns } })
          }
        />
      );
  }
}
