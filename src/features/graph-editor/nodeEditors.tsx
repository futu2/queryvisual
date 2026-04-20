import { useEffect, useState } from "react";
import type {
  GraphNode,
  NamedExpression,
  SortItem,
} from "../../domain/document/types";
import type { ColumnMap, ColumnType } from "../../domain/schema/types";

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
  const [draft, setDraft] = useState<GraphNode>(node);

  useEffect(() => {
    setDraft(node);
  }, [node.id]);

  return { draft, setDraft };
}

export function renderNodeEditor(
  draft: GraphNode,
  setDraft: (node: GraphNode) => void,
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
          <ColumnMapEditor
            columns={draft.data.columns}
            onChange={(columns) =>
              setDraft({ ...draft, data: { ...draft.data, columns } })
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
