import { useEffect, useState } from "react";
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
  DraftRow,
  duplicateDraftRow,
  ensureDraftRows,
  moveDraftRow,
  removeDraftRow,
  stripDraftRows,
} from "./rowDrafts";

type FieldRow = {
  name: string;
  type: ColumnType;
};

type FromTableNode = Extract<GraphNode, { kind: "fromTable" }>;
type SelectNode = Extract<GraphNode, { kind: "select" }>;
type AggregationNode = Extract<GraphNode, { kind: "aggregation" }>;
type NamedExpressionDraftRow = DraftRow<NamedExpression>;

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

type EditableNodeDraft =
  | Exclude<GraphNode, FromTableNode | SelectNode | AggregationNode>
  | SelectEditorDraft
  | AggregationEditorDraft
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

function blankNamedExpression(): NamedExpression {
  return { name: "", expression: "" };
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
            dragLabel={`Drag field ${index + 1}`}
            draggable={rows.length > 1}
            onDragStart={() => setDraggedRowId(row.rowId)}
            onDragOver={() => {}}
            onDrop={() => {
              if (draggedRowId === null) return;
              const fromIndex = rows.findIndex(
                (candidate) => candidate.rowId === draggedRowId,
              );
              setDraggedRowId(null);
              if (fromIndex === -1) return;
              onChange(moveDraftRow(rows, fromIndex, index));
            }}
            header={<span data-testid={`field-row-card-${index + 1}`} aria-hidden="true" />}
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
            dragLabel={`Drag ${itemName} ${index + 1}`}
            draggable={rows.length > 1}
            onDragStart={() => setDraggedRowId(row.rowId)}
            onDragOver={() => {}}
            onDrop={() => {
              if (draggedRowId === null) return;
              const fromIndex = rows.findIndex(
                (candidate) => candidate.rowId === draggedRowId,
              );
              setDraggedRowId(null);
              if (fromIndex === -1) return;
              onChange(moveDraftRow(rows, fromIndex, index));
            }}
            header={
              rowCardTestIdPrefix ? (
                <span
                  data-testid={`${rowCardTestIdPrefix}-${index + 1}`}
                  aria-hidden="true"
                />
              ) : null
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
            <label>
              {nameLabel(index + 1)}
              <input
                value={row.name}
                onChange={(event) => {
                  const next = [...rows];
                  next[index] = { ...row, name: event.target.value };
                  onChange(next);
                }}
              />
            </label>
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

function SelectMappingRows({
  rows,
  document,
  nodeId,
  schemaOverrides,
  onChange,
}: {
  rows: NamedExpression[];
  document: GraphDocument;
  nodeId: string;
  schemaOverrides?: Record<string, ColumnMap>;
  onChange: (rows: NamedExpression[]) => void;
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
        </>
      );
    case "sort":
      return (
        <div className="editor-stack">
          {draft.data.items.map((item: SortItem, index: number) => (
            <div key={index} className="mapping-row">
              <ExpressionInput
                label="Expression"
                value={item.expression}
                document={document}
                nodeId={draft.id}
                schemaOverrides={schemaOverrides}
                onChange={(expression) => {
                  const next = [...draft.data.items];
                  next[index] = { ...item, expression };
                  setDraft({ ...draft, data: { items: next } });
                }}
              />
              <label>
                Direction
                <select
                  value={item.direction}
                  onChange={(event) => {
                    const next = [...draft.data.items];
                    next[index] = {
                      ...item,
                      direction: event.target.value as "asc" | "desc",
                    };
                    setDraft({ ...draft, data: { items: next } });
                  }}
                >
                  <option value="asc">asc</option>
                  <option value="desc">desc</option>
                </select>
              </label>
            </div>
          ))}
        </div>
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
