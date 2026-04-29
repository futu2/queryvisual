import { createDefaultOutputListenerConfig } from "../../domain/document/outputListeners";
import type { GraphNode, NodeKind } from "../../domain/document/types";

export const paletteItems: Array<{
  kind: NodeKind;
  canonicalLabel: string;
  messageKey:
    | "nodeKinds.graphInput"
    | "nodeKinds.fromTable"
    | "nodeKinds.subgraph"
    | "nodeKinds.helperFunctions"
    | "nodeKinds.importHelperFunctions"
    | "nodeKinds.importGraphHelpers"
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
  { kind: "helperFunctions", canonicalLabel: "Helper Functions", messageKey: "nodeKinds.helperFunctions" },
  { kind: "importGraphHelpers", canonicalLabel: "Import Graph Helpers", messageKey: "nodeKinds.importGraphHelpers" },
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

export type NodePlacementRequest = {
  kind: NodeKind;
  label: string;
};

export function createNode(
  kind: NodeKind,
  index: number,
  position?: GraphNode["position"],
  id?: string,
): GraphNode {
  const base = {
    id: id ?? `${kind}-${crypto.randomUUID()}`,
    kind,
    label:
      paletteItems.find((item) => item.kind === kind)?.canonicalLabel ?? kind,
    position: position ?? { x: 160 + index * 24, y: 120 + index * 24 },
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
    case "helperFunctions":
      return {
        ...base,
        kind,
        data: { moduleName: "", helpers: [{ name: "add10", expression: "$1 + 10" }] },
      };
    case "importHelperFunctions":
      return {
        ...base,
        kind,
        data: { moduleName: "" },
      };
    case "importGraphHelpers":
      return {
        ...base,
        kind,
        data: { graphId: "", moduleName: "" },
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
