import { useEffect, useState } from "react";
import type { DragEvent as ReactDragEvent } from "react";
import type {
  GraphDocument,
  GraphNode,
  GraphWorkspace,
  HelperFunctionDefinition,
  NamedExpression,
  SortItem,
} from "../../domain/document/types";
import type { ColumnMap, ColumnType, TableRef } from "../../domain/schema/types";
import {
  inferGraphInterface,
  inferSubgraphTarget,
  resolveSubgraphTarget,
} from "../../domain/workspace/interfaces";
import { isPackageUpgradeCompatible } from "../../domain/package/compatibility";
import { ExpressionInput } from "./ExpressionInput";
import { RowActionBar } from "./RowActionBar";
import { RowCard } from "./RowCard";
import type { MessageKey, TranslationVars } from "../i18n/types";
import {
  addDraftRow,
  duplicateDraftRow,
  ensureDraftRows,
  moveDraftRow,
  removeDraftRow,
  stripDraftRows,
} from "./rowDrafts";
import type { DraftRow } from "./rowDrafts";

type Translator = (key: MessageKey, vars?: TranslationVars) => string;

type FieldRow = {
  name: string;
  type: ColumnType;
};

type FromTableNode = Extract<GraphNode, { kind: "fromTable" }>;
type SelectNode = Extract<GraphNode, { kind: "select" }>;
type AggregationNode = Extract<GraphNode, { kind: "aggregation" }>;
type SortNode = Extract<GraphNode, { kind: "sort" }>;
type HelperFunctionsNode = Extract<GraphNode, { kind: "helperFunctions" }>;
type NamedExpressionDraftRow = DraftRow<NamedExpression>;
type HelperFunctionDraftRow = DraftRow<HelperFunctionDefinition>;
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

type HelperFunctionsEditorDraft = Omit<HelperFunctionsNode, "data"> & {
  data: {
    helpers: HelperFunctionDraftRow[];
  };
};

type EditableNodeDraft =
  | Exclude<
      GraphNode,
      FromTableNode | SelectNode | AggregationNode | SortNode | HelperFunctionsNode
    >
  | SelectEditorDraft
  | AggregationEditorDraft
  | SortEditorDraft
  | HelperFunctionsEditorDraft
  | FromTableEditorDraft;

const rowActionItemMessageKeys = {
  mapping: "rowActions.mapping",
  field: "rowActions.field",
  column: "rowActions.column",
  groupKey: "rowActions.groupKey",
  aggregate: "rowActions.aggregate",
  sortItem: "rowActions.sortItem",
  helper: "rowActions.helper",
} as const satisfies Record<
  | "mapping"
  | "field"
  | "column"
  | "groupKey"
  | "aggregate"
  | "sortItem"
  | "helper",
  MessageKey
>;

const columnTypeMessageKeys = {
  boolean: "editor.columnType.boolean",
  int: "editor.columnType.int",
  float: "editor.columnType.float",
  string: "editor.columnType.string",
  date: "editor.columnType.date",
  timestamp: "editor.columnType.timestamp",
  null: "editor.columnType.null",
  unknown: "editor.columnType.unknown",
} as const satisfies Record<ColumnType, MessageKey>;

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

function blankHelperFunction(): HelperFunctionDefinition {
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
  t,
  onChange,
}: {
  rows: DraftRow<FieldRow>[];
  t: Translator;
  onChange: (rows: DraftRow<FieldRow>[]) => void;
}) {
  const [draggedRowId, setDraggedRowId] = useState<string | null>(null);
  const fieldLabel = t(rowActionItemMessageKeys.field);

  return (
    <div className="editor-stack">
      {rows.map((row, index) => (
        <div key={row.rowId} className="mapping-row">
          <RowCard
            testId={`field-row-card-${index + 1}`}
            dragLabel={t("rowDrag.label", { item: fieldLabel, row: index + 1 })}
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
                label={t("editor.fieldName", { row: index + 1 })}
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
                itemKey="field"
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
              {t("editor.fieldType", { row: index + 1 })}
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
                    {t(columnTypeMessageKeys[type])}
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
        {t("editor.addField")}
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

  if (node.kind === "helperFunctions") {
    return {
      ...node,
      data: {
        helpers: ensureDraftRows(node.data.helpers, blankHelperFunction),
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

  if (draft.kind === "helperFunctions") {
    const helpers = stripDraftRows(draft.data.helpers);

    return {
      ...draft,
      data: {
        helpers: sanitizeNamedExpressions(helpers),
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
  itemKey,
  addButtonLabel,
  nameLabel,
  expressionLabel,
  rowCardTestIdPrefix,
  document,
  nodeId,
  schemaOverrides,
  t,
  onChange,
}: {
  rows: NamedExpressionDraftRow[];
  itemKey: "mapping" | "groupKey" | "aggregate" | "helper";
  addButtonLabel: string;
  nameLabel: (rowNumber: number) => string;
  expressionLabel: (rowNumber: number) => string;
  rowCardTestIdPrefix?: string;
  document: GraphDocument;
  nodeId: string;
  schemaOverrides?: Record<string, ColumnMap>;
  t: Translator;
  onChange: (rows: NamedExpressionDraftRow[]) => void;
}) {
  const [draggedRowId, setDraggedRowId] = useState<string | null>(null);
  const itemLabel = t(rowActionItemMessageKeys[itemKey]);

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
            dragLabel={t("rowDrag.label", { item: itemLabel, row: index + 1 })}
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
              itemKey === "helper" ? (
                <div
                  className="row-action-bar"
                  role="group"
                  aria-label={t("rowActions.group", {
                    item: itemLabel,
                    row: index + 1,
                  })}
                >
                  <button
                    className="row-icon-button"
                    type="button"
                    aria-label={t("rowActions.moveUp", {
                      item: itemLabel,
                      row: index + 1,
                    })}
                    onClick={() => onChange(moveDraftRow(rows, index, index - 1))}
                    disabled={index === 0}
                  >
                    ↑
                  </button>
                  <button
                    className="row-icon-button"
                    type="button"
                    aria-label={t("rowActions.moveDown", {
                      item: itemLabel,
                      row: index + 1,
                    })}
                    onClick={() => onChange(moveDraftRow(rows, index, index + 1))}
                    disabled={index === rows.length - 1}
                  >
                    ↓
                  </button>
                  <button
                    className="row-icon-button"
                    type="button"
                    aria-label={t("rowActions.duplicate", {
                      item: itemLabel,
                      row: index + 1,
                    })}
                    onClick={() =>
                      onChange(duplicateDraftRow(rows, index, (item) => ({ ...item })))
                    }
                  >
                    ⧉
                  </button>
                  <button
                    className="row-icon-button row-icon-button-danger"
                    type="button"
                    aria-label={t("rowActions.remove", {
                      item: itemLabel,
                      row: index + 1,
                    })}
                    onClick={() =>
                      onChange(removeDraftRow(rows, index, blankNamedExpression))
                    }
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <RowActionBar
                  itemKey={itemKey}
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
              )
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
  t,
  onChange,
}: {
  rows: SortItemDraftRow[];
  document: GraphDocument;
  nodeId: string;
  schemaOverrides?: Record<string, ColumnMap>;
  t: Translator;
  onChange: (rows: SortItemDraftRow[]) => void;
}) {
  const [draggedRowId, setDraggedRowId] = useState<string | null>(null);
  const sortItemLabel = t(rowActionItemMessageKeys.sortItem);

  return (
    <div className="editor-stack">
      {rows.map((row, index) => (
        <div key={row.rowId} className="mapping-row">
          <RowCard
            testId={`sort-row-card-${index + 1}`}
            dragLabel={t("rowDrag.label", { item: sortItemLabel, row: index + 1 })}
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
                itemKey="sortItem"
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
              label={t("editor.sortExpression", { row: index + 1 })}
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
              {t("editor.direction")}
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
                <option value="asc">{t("editor.sortDirection.asc")}</option>
                <option value="desc">{t("editor.sortDirection.desc")}</option>
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
        {t("editor.addSortItem")}
      </button>
    </div>
  );
}

function SelectMappingRows({
  rows,
  document,
  nodeId,
  schemaOverrides,
  t,
  onChange,
}: {
  rows: NamedExpressionDraftRow[];
  document: GraphDocument;
  nodeId: string;
  schemaOverrides?: Record<string, ColumnMap>;
  t: Translator;
  onChange: (rows: NamedExpressionDraftRow[]) => void;
}) {
  return (
    <NamedExpressionRows
      rows={rows}
      itemKey="mapping"
      addButtonLabel={t("editor.addMapping")}
      nameLabel={(rowNumber) => t("editor.mappingName", { row: rowNumber })}
      expressionLabel={() => t("editor.expression")}
      rowCardTestIdPrefix="mapping-row-card"
      document={document}
      nodeId={nodeId}
      schemaOverrides={schemaOverrides}
      t={t}
      onChange={onChange}
    />
  );
}

function HelperFunctionRows(props: {
  rows: HelperFunctionDraftRow[];
  document: GraphDocument;
  nodeId: string;
  t: Translator;
  onChange: (rows: HelperFunctionDraftRow[]) => void;
}) {
  return (
    <NamedExpressionRows
      rows={props.rows}
      itemKey="helper"
      addButtonLabel={props.t("editor.addHelper")}
      nameLabel={(rowNumber) => props.t("editor.helperName", { row: rowNumber })}
      expressionLabel={(rowNumber) =>
        props.t("editor.helperExpression", { row: rowNumber })
      }
      rowCardTestIdPrefix="helper-row-card"
      document={props.document}
      nodeId={props.nodeId}
      t={props.t}
      onChange={props.onChange}
    />
  );
}

function createNewColumnName(columns: ColumnMap) {
  let index = Object.keys(columns).length + 1;
  let candidate = `field_${index}`;

  while (candidate in columns) {
    index += 1;
    candidate = `field_${index}`;
  }

  return candidate;
}

function ColumnMapEditor({
  columns,
  t,
  onChange,
}: {
  columns: ColumnMap;
  t: Translator;
  onChange: (columns: ColumnMap) => void;
}) {
  const rows = Object.entries(columns);

  return (
    <div className="editor-stack">
      {rows.map(([name, type], index) => (
        <div key={index} className="mapping-row">
          <label>
            {t("editor.columnName", { row: index + 1 })}
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
            {t("editor.fieldType", { row: index + 1 })}
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
      <button
        type="button"
        className="row-add-button"
        onClick={() =>
          onChange({
            ...columns,
            [createNewColumnName(columns)]: "string",
          })
        }
      >
        {t("editor.addField")}
      </button>
    </div>
  );
}

export function useEditableNode(node: GraphNode) {
  const [initialDraft, setInitialDraft] = useState<EditableNodeDraft>(() =>
    toEditableNodeDraft(node),
  );
  const [draft, setDraft] = useState<EditableNodeDraft>(initialDraft);

  useEffect(() => {
    const nextDraft = toEditableNodeDraft(node);
    setDraft(nextDraft);
    setInitialDraft(nextDraft);
  }, [node.id]);

  return { draft, initialDraft, setDraft };
}

export function renderNodeEditor(
  draft: EditableNodeDraft,
  setDraft: (node: EditableNodeDraft) => void,
  document: GraphDocument,
  t: Translator,
  schemaOverrides?: Record<string, ColumnMap>,
  options?: {
    workspace?: GraphWorkspace;
    activeGraphId?: string;
    onOpenGraph?: (graphId: string) => void;
  },
) {
  switch (draft.kind) {
    case "fromTable":
      return (
        <>
          <label>
            {t("editor.tableName")}
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
            t={t}
            onChange={(fieldRows) =>
              setDraft({ ...draft, data: { ...draft.data, fieldRows } })
            }
          />
        </>
      );
    case "where":
      return (
        <ExpressionInput
          label={t("editor.predicate")}
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
          t={t}
          onChange={(rows) =>
            setDraft({ ...draft, data: { mappings: rows } })
          }
        />
      );
    case "aggregation":
      return (
        <>
          <div className="editor-section">
            <h3>{t("editor.groupBy")}</h3>
            <NamedExpressionRows
              rows={draft.data.groupBy}
              itemKey="groupKey"
              addButtonLabel={t("editor.addGroupKey")}
              nameLabel={(rowNumber) => t("editor.groupKeyName", { row: rowNumber })}
              expressionLabel={(rowNumber) =>
                t("editor.groupKeyExpression", { row: rowNumber })
              }
              rowCardTestIdPrefix="group-key-row-card"
              document={document}
              nodeId={draft.id}
              schemaOverrides={schemaOverrides}
              t={t}
              onChange={(rows) =>
                setDraft({ ...draft, data: { ...draft.data, groupBy: rows } })
              }
            />
          </div>
          <div className="editor-section">
            <h3>{t("editor.aggregates")}</h3>
            <NamedExpressionRows
              rows={draft.data.aggregates}
              itemKey="aggregate"
              addButtonLabel={t("editor.addAggregate")}
              nameLabel={(rowNumber) => t("editor.aggregateName", { row: rowNumber })}
              expressionLabel={(rowNumber) =>
                t("editor.aggregateExpression", { row: rowNumber })
              }
              rowCardTestIdPrefix="aggregate-row-card"
              document={document}
              nodeId={draft.id}
              schemaOverrides={schemaOverrides}
              t={t}
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
          t={t}
          onChange={(items) =>
            setDraft({ ...draft, data: { items } })
          }
        />
      );
    case "helperFunctions":
      return (
        <HelperFunctionRows
          rows={draft.data.helpers}
          document={document}
          nodeId={draft.id}
          t={t}
          onChange={(helpers) => setDraft({ ...draft, data: { helpers } })}
        />
      );
    case "importHelperFunctions":
      return (
        <label>
          {t("editor.moduleName")}
          <input
            value={draft.data.moduleName}
            onChange={(event) =>
              setDraft({ ...draft, data: { moduleName: event.target.value } })
            }
          />
        </label>
      );
    case "limit":
      return (
        <>
          <label>
            {t("editor.count")}
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
            {t("editor.offset")}
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
        <div className="editor-stack">
          <label>
            {t("editor.outputName")}
            <input
              value={draft.data.outputName}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  data: {
                    ...draft.data,
                    outputName: event.target.value,
                  },
                })
              }
            />
          </label>
          <label className="editor-checkbox-row">
            <input
              type="checkbox"
              checked={draft.data.listeners.copyToClipboard}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  data: {
                    ...draft.data,
                    listeners: {
                      ...draft.data.listeners,
                      copyToClipboard: event.target.checked,
                    },
                  },
                })
              }
            />
            {t("editor.copyToClipboard")}
          </label>
          <label className="editor-checkbox-row">
            <input
              type="checkbox"
              checked={draft.data.listeners.logToConsole}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  data: {
                    ...draft.data,
                    listeners: {
                      ...draft.data.listeners,
                      logToConsole: event.target.checked,
                    },
                  },
                })
              }
            />
            {t("editor.logToConsole")}
          </label>
          <label className="editor-checkbox-row">
            <input
              type="checkbox"
              checked={draft.data.listeners.saveToLocalStorage.enabled}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  data: {
                    ...draft.data,
                    listeners: {
                      ...draft.data.listeners,
                      saveToLocalStorage: {
                        ...draft.data.listeners.saveToLocalStorage,
                        enabled: event.target.checked,
                      },
                    },
                  },
                })
              }
            />
            {t("editor.saveToLocalStorage")}
          </label>
          <label>
            {t("editor.localStorageKey")}
            <input
              value={draft.data.listeners.saveToLocalStorage.key}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  data: {
                    ...draft.data,
                    listeners: {
                      ...draft.data.listeners,
                      saveToLocalStorage: {
                        ...draft.data.listeners.saveToLocalStorage,
                        key: event.target.value,
                      },
                    },
                  },
                })
              }
            />
          </label>
        </div>
      );
    case "join":
      return (
        <>
          <label>
            {t("editor.joinType")}
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
              <option value="inner">{t("editor.joinType.inner")}</option>
              <option value="left">{t("editor.joinType.left")}</option>
              <option value="right">{t("editor.joinType.right")}</option>
              <option value="full">{t("editor.joinType.full")}</option>
            </select>
          </label>
          <ExpressionInput
            label={t("editor.joinPredicate")}
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
        <div className="editor-stack">
          <label>
            {t("editor.inputName")}
            <input
              value={draft.data.inputName}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  data: {
                    ...draft.data,
                    inputName: event.target.value,
                  },
                })
              }
            />
          </label>
          <ColumnMapEditor
            columns={draft.data.columns}
            t={t}
            onChange={(columns) =>
              setDraft({ ...draft, data: { ...draft.data, columns } })
            }
          />
        </div>
      );
    case "subgraph": {
      const workspace = options?.workspace;
      const graphs = workspace?.graphs ?? [];
      const currentTarget = inferSubgraphTarget(draft.data);
      const sourceKind = currentTarget?.kind === "package" ? "package" : "local";
      const currentPackageTarget =
        currentTarget?.kind === "package" ? currentTarget : null;
      const selectedGraphId =
        currentTarget?.kind === "local" ? currentTarget.graphId : draft.data.graphId;
      const selectedGraph =
        sourceKind === "local" && selectedGraphId.trim() !== ""
          ? graphs.find((graph) => graph.id === selectedGraphId) ?? null
          : null;
      const rawPackageExports =
        workspace?.installedPackages.flatMap((pkg) =>
          pkg.exports.map((entry) => ({
            key: `${pkg.packageId}@${pkg.version}#${entry.exportKey}`,
            target: {
              kind: "package" as const,
              packageId: pkg.packageId,
              version: pkg.version,
              exportKey: entry.exportKey,
            },
            displayName: `${pkg.metadata.name} / ${entry.displayName}`,
            graphId: entry.graphId,
          })),
        ) ?? [];
      const packageExports = rawPackageExports.filter((entry) => {
        if (!currentPackageTarget) {
          return true;
        }

        const isPinnedSiblingVersion =
          entry.target.packageId === currentPackageTarget.packageId &&
          entry.target.exportKey === currentPackageTarget.exportKey &&
          entry.target.version !== currentPackageTarget.version;

        return !isPinnedSiblingVersion;
      });
      const selectedPackageKey =
        currentTarget?.kind === "package"
          ? `${currentTarget.packageId}@${currentTarget.version}#${currentTarget.exportKey}`
          : "";
      const resolvedTarget = resolveSubgraphTarget(workspace, draft.data);
      const currentPackageInterface =
        currentPackageTarget && resolvedTarget.graph
          ? inferGraphInterface(resolvedTarget.graph)
          : null;
      const usedInputHandles = Array.from(
        new Set(
          document.edges
            .filter((edge) => edge.target === draft.id)
            .map((edge) => edge.targetHandle),
        ),
      );
      const usedOutputHandles = Array.from(
        new Set(
          document.edges
            .filter((edge) => edge.source === draft.id)
            .map((edge) => edge.sourceHandle),
        ),
      );
      const currentInputSchemas = currentPackageInterface
        ? Object.fromEntries(
            currentPackageInterface.inputs.map((port) => [port.handleId, port.columns]),
          )
        : {};
      const availableUpgrades =
        currentPackageTarget && workspace
          ? workspace.installedPackages
              .filter(
                (pkg) =>
                  pkg.packageId === currentPackageTarget.packageId &&
                  pkg.version.localeCompare(currentPackageTarget.version, undefined, {
                    numeric: true,
                    sensitivity: "base",
                  }) > 0,
              )
              .map((pkg) => {
                const exportEntry =
                  pkg.exports.find(
                    (entry) => entry.exportKey === currentPackageTarget.exportKey,
                  ) ?? null;
                if (!exportEntry) {
                  return null;
                }

                const graph =
                  pkg.graphs.find((candidate) => candidate.id === exportEntry.graphId) ??
                  null;
                if (!graph) {
                  return null;
                }

                const nextInterface = inferGraphInterface(graph);
                const nextInputSchemas = Object.fromEntries(
                  nextInterface.inputs.map((port) => [port.handleId, port.columns]),
                );
                const compatibility = isPackageUpgradeCompatible({
                  currentInputs: usedInputHandles,
                  currentOutputs: usedOutputHandles,
                  nextInputs: nextInterface.inputs.map((port) => port.handleId),
                  nextOutputs: nextInterface.outputs.map((port) => port.handleId),
                  currentInputSchemas,
                  nextInputSchemas,
                });

                return {
                  pkg,
                  graph,
                  exportEntry,
                  compatibility,
                };
              })
              .filter((entry) => entry !== null)
              .sort((left, right) =>
                right.pkg.version.localeCompare(left.pkg.version, undefined, {
                  numeric: true,
                  sensitivity: "base",
                }),
              )
          : [];
      const canOpen =
        sourceKind === "local" &&
        Boolean(selectedGraph) &&
        selectedGraph!.id !== options?.activeGraphId;

      return (
        <div className="editor-stack">
          <label>
            {t("editor.subgraphSource")}
            <select
              aria-label={t("editor.subgraphSource")}
              value={sourceKind}
              onChange={(event) => {
                const nextSource = event.target.value;

                if (nextSource === "package") {
                  const firstPackageExport = packageExports[0] ?? null;
                  setDraft({
                    ...draft,
                    data: {
                      ...draft.data,
                      graphId: firstPackageExport?.graphId ?? "",
                      target: firstPackageExport?.target ?? {
                        kind: "package",
                        packageId: "",
                        version: "",
                        exportKey: "",
                      },
                    },
                  });
                  return;
                }

                const localGraphId =
                  currentTarget?.kind === "local" ? currentTarget.graphId : "";
                setDraft({
                  ...draft,
                  data: {
                    ...draft.data,
                    graphId: localGraphId,
                    target: { kind: "local", graphId: localGraphId },
                  },
                });
              }}
            >
              <option value="local">{t("editor.subgraphSource.local")}</option>
              <option value="package">{t("editor.subgraphSource.package")}</option>
            </select>
          </label>

          {sourceKind === "local" ? (
          <label>
            {t("editor.childGraph")}
            <select
              aria-label={t("editor.childGraph")}
              value={selectedGraphId}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  data: {
                    ...draft.data,
                    graphId: event.target.value,
                    target: { kind: "local", graphId: event.target.value },
                  },
                })
              }
            >
              <option value="">{t("editor.selectGraphPrompt")}</option>
              {graphs.map((graph) => (
                <option key={graph.id} value={graph.id}>
                  {graph.metadata.name}
                </option>
              ))}
            </select>
          </label>
          ) : (
            <label>
              {t("editor.packageExport")}
              <select
                aria-label={t("editor.packageExport")}
                value={selectedPackageKey}
                onChange={(event) => {
                  const nextPackageExport =
                    packageExports.find(
                      (entry) => entry.key === event.target.value,
                    ) ?? null;

                  setDraft({
                    ...draft,
                    data: {
                      ...draft.data,
                      graphId: nextPackageExport?.graphId ?? "",
                      target: nextPackageExport?.target ?? {
                        kind: "package",
                        packageId: "",
                        version: "",
                        exportKey: "",
                      },
                    },
                  });
                }}
              >
                <option value="">{t("editor.selectPackageExportPrompt")}</option>
                {packageExports.map((entry) => (
                  <option key={entry.key} value={entry.key}>
                    {entry.displayName}
                  </option>
                ))}
              </select>
            </label>
          )}

          {sourceKind === "local" && selectedGraphId.trim() !== "" && !selectedGraph ? (
            <div role="status" aria-live="polite">
              {t("queryNode.missingGraph")}
            </div>
          ) : null}
          {sourceKind === "package" &&
          currentTarget?.kind === "package" &&
          currentTarget.exportKey.trim() !== "" &&
          !resolvedTarget.graph ? (
            <div role="status" aria-live="polite">
              {t("queryNode.missingGraph")}
            </div>
          ) : null}
          {sourceKind === "package" && availableUpgrades.length > 0 ? (
            <div className="editor-section">
              <div className="row-editor-actions">
                {availableUpgrades.map((upgrade) => (
                  <button
                    key={upgrade.pkg.version}
                    type="button"
                    className="ghost-button"
                    disabled={!upgrade.compatibility.ok}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        data: {
                          ...draft.data,
                          graphId: upgrade.graph.id,
                          target: {
                            kind: "package",
                            packageId: currentPackageTarget!.packageId,
                            version: upgrade.pkg.version,
                            exportKey: currentPackageTarget!.exportKey,
                          },
                        },
                      })
                    }
                  >
                    {t("editor.packageUpgradeTo", {
                      version: upgrade.pkg.version,
                    })}
                  </button>
                ))}
              </div>
              {availableUpgrades.some((upgrade) => !upgrade.compatibility.ok) ? (
                <div role="status" aria-live="polite">
                  {t("editor.packageUpgradeBlocked")}
                </div>
              ) : null}
            </div>
          ) : null}
          {sourceKind === "local" ? (
            <button
              type="button"
              className="ghost-button"
              disabled={!canOpen}
              onClick={() => {
                if (!canOpen) return;
                options?.onOpenGraph?.(selectedGraph!.id);
              }}
            >
              {t("editor.openChildGraph")}
            </button>
          ) : null}
        </div>
      );
    }
  }
}
