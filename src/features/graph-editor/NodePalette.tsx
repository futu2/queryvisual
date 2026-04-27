import { useDocumentContext } from "../../app/state/DocumentContext";
import { createDefaultOutputListenerConfig } from "../../domain/document/outputListeners";
import type { GraphNode, NodeKind } from "../../domain/document/types";
import { useI18n } from "../i18n/I18nContext";

const paletteItems: Array<{
  kind: NodeKind;
  canonicalLabel: string;
  messageKey:
    | "nodeKinds.graphInput"
    | "nodeKinds.fromTable"
    | "nodeKinds.subgraph"
    | "nodeKinds.join"
    | "nodeKinds.where"
    | "nodeKinds.select"
    | "nodeKinds.aggregation"
    | "nodeKinds.sort"
    | "nodeKinds.limit"
    | "nodeKinds.output";
}> = [
  { kind: "graphInput", canonicalLabel: "Graph Input", messageKey: "nodeKinds.graphInput" },
  { kind: "fromTable", canonicalLabel: "From", messageKey: "nodeKinds.fromTable" },
  { kind: "subgraph", canonicalLabel: "Subgraph", messageKey: "nodeKinds.subgraph" },
  { kind: "join", canonicalLabel: "Join", messageKey: "nodeKinds.join" },
  { kind: "where", canonicalLabel: "Where", messageKey: "nodeKinds.where" },
  { kind: "select", canonicalLabel: "Select", messageKey: "nodeKinds.select" },
  {
    kind: "aggregation",
    canonicalLabel: "Aggregation",
    messageKey: "nodeKinds.aggregation",
  },
  { kind: "sort", canonicalLabel: "Sort", messageKey: "nodeKinds.sort" },
  { kind: "limit", canonicalLabel: "Limit", messageKey: "nodeKinds.limit" },
  { kind: "output", canonicalLabel: "Output", messageKey: "nodeKinds.output" },
];

function createNode(kind: NodeKind, index: number): GraphNode {
  const base = {
    id: `${kind}-${crypto.randomUUID()}`,
    kind,
    label:
      paletteItems.find((item) => item.kind === kind)?.canonicalLabel ?? kind,
    position: { x: 160 + index * 24, y: 120 + index * 24 },
  } as const;

  switch (kind) {
    case "graphInput":
      return {
        ...base,
        kind,
        data: {
          inputName: `input_${index + 1}`,
          columns: { id: "int" },
        },
      };
    case "fromTable":
      return {
        ...base,
        kind,
        data: {
          tableRef: { tableName: "table_name" },
          columns: { id: "int" },
        },
      };
    case "join":
      return {
        ...base,
        kind,
        data: { joinType: "inner", predicate: "left.id = right.id" },
      };
    case "subgraph":
      return {
        ...base,
        kind,
        data: { graphId: "" },
      };
    case "where":
      return { ...base, kind, data: { predicate: "id > 0" } };
    case "select":
      return {
        ...base,
        kind,
        data: { mappings: [{ name: "id", expression: "id" }] },
      };
    case "aggregation":
      return {
        ...base,
        kind,
        data: { groupBy: [{ name: "id", expression: "id" }], aggregates: [] },
      };
    case "sort":
      return {
        ...base,
        kind,
        data: { items: [{ expression: "id", direction: "asc" }] },
      };
    case "limit":
      return { ...base, kind, data: { count: 100, offset: null } };
    case "output":
      return {
        ...base,
        kind,
        data: {
          outputName: `output_${index + 1}`,
          listeners: createDefaultOutputListenerConfig(`output_${index + 1}`),
        },
      };
  }
}

export function NodePalette() {
  const { state, dispatch } = useDocumentContext();
  const { t } = useI18n();

  return (
    <div>
      <h2>{t("nodePalette.title")}</h2>
      <div className="stack">
        {paletteItems.map((item) => (
          <button
            key={item.kind}
            className="ghost-button"
            type="button"
            onClick={() =>
              dispatch({
                type: "add-node",
                node: createNode(item.kind, state.document.nodes.length),
              })
            }
          >
            {t(item.messageKey)}
          </button>
        ))}
      </div>
    </div>
  );
}
