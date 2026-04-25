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

type FromTableNode = Extract<GraphNode, { kind: "fromTable" }>;

type FromTableEditorDraft = Omit<FromTableNode, "data"> & {
  data: {
    tableRef: TableRef;
    fieldRows: FieldRow[];
  };
};

type EditableNodeDraft =
  | Exclude<GraphNode, FromTableNode>
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
  if (!rows[index]) {
    return rows;
  }

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
  itemName,
  index,
  rowCount,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onRemove,
}: {
  itemName: string;
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
        aria-label={`Move ${itemName} ${index + 1} up`}
        disabled={index === 0}
        onClick={onMoveUp}
      >
        Up
      </button>
      <button
        type="button"
        className="row-action-button"
        aria-label={`Move ${itemName} ${index + 1} down`}
        disabled={index === rowCount - 1}
        onClick={onMoveDown}
      >
        Down
      </button>
      <button
        type="button"
        className="row-action-button"
        aria-label={`Duplicate ${itemName} ${index + 1}`}
        onClick={onDuplicate}
      >
        Duplicate
      </button>
      <button
        type="button"
        className="row-action-button"
        aria-label={`Remove ${itemName} ${index + 1}`}
        onClick={onRemove}
      >
        Remove
      </button>
    </div>
  );
}

function FromTableFieldRows({
  rows,
  onChange,
}: {
  rows: FieldRow[];
  onChange: (rows: FieldRow[]) => void;
}) {
  return (
    <div className="editor-stack">
      {rows.map((row, index) => (
        <div key={index} className="mapping-row">
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
          <RowActionButtons
            itemName="field"
            index={index}
            rowCount={rows.length}
            onMoveUp={() => onChange(moveRow(rows, index, -1))}
            onMoveDown={() => onChange(moveRow(rows, index, 1))}
            onDuplicate={() => onChange(duplicateRow(rows, index, (item) => ({ ...item })))}
            onRemove={() => onChange(removeRow(rows, index, blankFieldRow))}
          />
        </div>
      ))}

      <button
        type="button"
        className="row-add-button"
        onClick={() => onChange([...rows, blankFieldRow()])}
      >
        Add field
      </button>
    </div>
  );
}

function toEditableNodeDraft(node: GraphNode): EditableNodeDraft {
  if (node.kind !== "fromTable") {
    return node;
  }

  const fieldRows = ensureAtLeastOneRow(
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
  if (draft.kind !== "fromTable") {
    return draft;
  }

  const columns = Object.fromEntries(
    draft.data.fieldRows
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

function MappingRows({
  rows,
  onChange,
}: {
  rows: NamedExpression[];
  onChange: (rows: NamedExpression[]) => void;
}) {
  return (
    <div className="editor-stack">
      {rows.map((row, index) => (
        <div key={index} className="mapping-row">
          <label>
            {`Mapping name ${index + 1}`}
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
            Expression
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
        <label>
          Predicate
          <textarea
            value={draft.data.predicate}
            onChange={(event) =>
              setDraft({ ...draft, data: { predicate: event.target.value } })
            }
          />
        </label>
      );
    case "select":
      return (
        <MappingRows
          rows={draft.data.mappings}
          onChange={(rows) =>
            setDraft({ ...draft, data: { mappings: rows } })
          }
        />
      );
    case "aggregation":
      return (
        <>
          <h3>Group By</h3>
          <MappingRows
            rows={draft.data.groupBy}
            onChange={(rows) =>
              setDraft({ ...draft, data: { ...draft.data, groupBy: rows } })
            }
          />
          <h3>Aggregates</h3>
          <MappingRows
            rows={draft.data.aggregates}
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
              <label>
                Expression
                <input
                  value={item.expression}
                  onChange={(event) => {
                    const next = [...draft.data.items];
                    next[index] = { ...item, expression: event.target.value };
                    setDraft({ ...draft, data: { items: next } });
                  }}
                />
              </label>
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
          <label>
            Predicate
            <textarea
              value={draft.data.predicate}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  data: { ...draft.data, predicate: event.target.value },
                })
              }
            />
          </label>
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
