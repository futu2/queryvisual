import { Handle, Position, type NodeProps, useUpdateNodeInternals } from "@xyflow/react";
import { useLayoutEffect, useMemo, useState } from "react";
import type { GraphNode } from "../../../domain/document/types";
import { formatTableRef } from "../../../domain/schema/types";
import {
  inferChildGraphInterface,
  inferSubgraphTarget,
} from "../../../domain/workspace/interfaces";
import type { FlowNodeData } from "../flowAdapter";
import { useI18n } from "../../i18n/I18nContext";
import type { MessageKey } from "../../i18n/types";
import "./queryNode.css";

const PRESENTATION_BY_KIND: Record<
  GraphNode["kind"],
  { family: "source" | "transform" | "terminal"; glyph: string }
> = {
  graphInput: { family: "source", glyph: "IN" },
  fromTable: { family: "source", glyph: "TB" },
  subgraph: { family: "transform", glyph: "SG" },
  helperFunctions: { family: "terminal", glyph: "FN" },
  importHelperFunctions: { family: "terminal", glyph: "IMP" },
  importGraphHelpers: { family: "terminal", glyph: "GH" },
  join: { family: "transform", glyph: "+" },
  where: { family: "transform", glyph: "?" },
  select: { family: "transform", glyph: "[]" },
  aggregation: { family: "transform", glyph: "#" },
  sort: { family: "transform", glyph: "::" },
  limit: { family: "transform", glyph: "1" },
  output: { family: "terminal", glyph: "OUT" },
};

const NODE_KIND_LABEL_KEYS: Record<GraphNode["kind"], MessageKey> = {
  graphInput: "nodeKinds.graphInput",
  fromTable: "nodeKinds.fromTable",
  subgraph: "nodeKinds.subgraph",
  helperFunctions: "nodeKinds.helperFunctions",
  importHelperFunctions: "nodeKinds.importHelperFunctions",
  importGraphHelpers: "nodeKinds.importGraphHelpers",
  join: "nodeKinds.join",
  where: "nodeKinds.where",
  select: "nodeKinds.select",
  aggregation: "nodeKinds.aggregation",
  sort: "nodeKinds.sort",
  limit: "nodeKinds.limit",
  output: "nodeKinds.output",
};

const JOIN_TYPE_LABEL_KEYS: Record<
  Extract<GraphNode, { kind: "join" }>["data"]["joinType"],
  MessageKey
> = {
  inner: "editor.joinType.inner",
  left: "editor.joinType.left",
  right: "editor.joinType.right",
  full: "editor.joinType.full",
};

function summaryText(
  t: (key: MessageKey, vars?: Record<string, string | number>) => string,
  node: GraphNode,
  workspace?: FlowNodeData["workspace"],
) {
  switch (node.kind) {
    case "fromTable":
      return `${formatTableRef(node.data.tableRef)} · ${t("queryNode.summary.cols", { count: Object.keys(node.data.columns).length })}`;
    case "graphInput":
      return t("queryNode.summary.cols", { count: Object.keys(node.data.columns).length });
    case "subgraph": {
      const { graph, iface } = inferChildGraphInterface(workspace, node.data);
      const target = inferSubgraphTarget(node.data);
      const base = t("queryNode.interfaceSummary", {
        inputs: iface.inputs.length,
        outputs: iface.outputs.length,
      });
      if (
        !target ||
        (target.kind === "local" && target.graphId.trim() === "") ||
        (target.kind === "package" &&
          (target.packageId.trim() === "" ||
            target.version.trim() === "" ||
            target.exportKey.trim() === ""))
      ) {
        return base;
      }
      if (!graph) {
        return `${t("queryNode.missingGraph")} · ${base}`;
      }
      return base;
    }
    case "helperFunctions":
      return t("queryNode.summary.helpers", { count: node.data.helpers.length });
    case "importHelperFunctions":
    case "importGraphHelpers":
      return node.data.moduleName.trim()
        ? t("queryNode.summary.importedModule", { moduleName: node.data.moduleName.trim() })
        : t("queryNode.summary.importedHelpers");
    case "join":
      return t("queryNode.summary.join", {
        joinType: t(JOIN_TYPE_LABEL_KEYS[node.data.joinType]),
      });
    case "where":
      return node.data.predicate;
    case "select":
      return t("queryNode.summary.expressions", { count: node.data.mappings.length });
    case "aggregation":
      return t("queryNode.summary.groupsAndAggs", {
        groups: node.data.groupBy.length,
        aggs: node.data.aggregates.length,
      });
    case "sort":
      return t("queryNode.summary.sortKeys", { count: node.data.items.length });
    case "limit":
      return t("queryNode.summary.limit", { count: node.data.count });
    case "output":
      return node.data.outputName;
  }
}

function TargetHandles({
  node,
  workspace,
}: {
  node: GraphNode;
  workspace?: FlowNodeData["workspace"];
}) {
  if (node.kind === "join") {
    return (
      <>
        <span hidden data-query-node-handle-marker="target-left" />
        <Handle
          className="query-node__handle"
          type="target"
          id="left"
          position={Position.Left}
          style={{ top: 34 }}
          data-query-node-handle="target-left"
        />
        <span hidden data-query-node-handle-marker="target-right" />
        <Handle
          className="query-node__handle"
          type="target"
          id="right"
          position={Position.Left}
          style={{ top: 62 }}
          data-query-node-handle="target-right"
        />
      </>
    );
  }

  if (node.kind === "fromTable" || node.kind === "graphInput") {
    return null;
  }

  if (
    node.kind === "subgraph" ||
    node.kind === "helperFunctions" ||
    node.kind === "importHelperFunctions" ||
    node.kind === "importGraphHelpers"
  ) {
    return null;
  }

  return (
    <>
      <span hidden data-query-node-handle-marker="target-in" />
      <Handle
        className="query-node__handle"
        type="target"
        id="in"
        position={Position.Left}
        data-query-node-handle="target-in"
      />
    </>
  );
}

export function QueryNode({ id, data, selected }: NodeProps<FlowNodeData>) {
  const { t } = useI18n();
  const [isHovered, setIsHovered] = useState(false);
  const hasErrors = data.diagnostics.some(
    (diagnostic) => diagnostic.level === "error",
  );
  const presentation = PRESENTATION_BY_KIND[data.node.kind];
  const updateNodeInternals = useUpdateNodeInternals();
  const subgraphInterface =
    data.node.kind === "subgraph"
      ? inferChildGraphInterface(data.workspace, data.node.data)
      : null;

  const subgraphInterfaceSignature = useMemo(() => {
    if (!subgraphInterface) {
      return "";
    }

    return [
      subgraphInterface.graph?.id ?? "missing",
      subgraphInterface.iface.inputs.map((port) => port.handleId).join("|"),
      subgraphInterface.iface.outputs.map((port) => port.handleId).join("|"),
    ].join("::");
  }, [subgraphInterface]);

  useLayoutEffect(() => {
    if (data.isPreview || data.node.kind !== "subgraph") {
      return;
    }

    // Handles are dynamic for subgraph nodes; React Flow needs an explicit refresh
    // so internal handle geometry stays in sync with the DOM.
    updateNodeInternals(id);
  }, [data.node.kind, id, subgraphInterfaceSignature, updateNodeInternals]);

  return (
    <div
      className={`query-node query-node--${presentation.family} query-node--${data.node.kind} ${data.isPreview ? "query-node--preview" : ""} ${selected ? "is-selected" : ""} ${hasErrors ? "has-errors" : ""}`}
      data-node-kind={data.node.kind}
      data-node-family={presentation.family}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {data.isPreview ? null : (
        <TargetHandles node={data.node} workspace={data.workspace} />
      )}
      {data.node.kind === "join" ? <span className="query-node__accent" aria-hidden="true" /> : null}
      {data.onDelete && (selected || isHovered) ? (
        <button
          type="button"
          className="query-node__delete"
          aria-label={t("queryNode.delete")}
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            data.onDelete?.(id);
          }}
        >
          ×
        </button>
      ) : null}
      <div className="query-node__header">
        <span className="query-node__glyph" aria-hidden="true">
          {presentation.glyph}
        </span>
        <div className="query-node__kind">{t(NODE_KIND_LABEL_KEYS[data.node.kind])}</div>
      </div>
      <div className="query-node__title">{data.node.label}</div>
      <div className="query-node__summary">{summaryText(t, data.node, data.workspace)}</div>
      {data.node.kind === "subgraph" && !data.isPreview ? (
        <div className="query-node__ports" aria-label={t("queryNode.subgraphInterface")}>
          {subgraphInterface && subgraphInterface.graph ? (
            <div className="query-node__ports-heading">
              {subgraphInterface.label ?? subgraphInterface.graph.metadata.name}
            </div>
          ) : null}
          {subgraphInterface &&
          !subgraphInterface.graph &&
          inferSubgraphTarget(data.node.data) ? (
            <div className="query-node__ports-heading is-missing">
              {t("queryNode.missingGraph")}
            </div>
          ) : null}
          {subgraphInterface ? (
            <div className="query-node__ports-grid">
              <div className="query-node__ports-column">
                <div className="query-node__ports-title">{t("queryNode.inputs")}</div>
                {subgraphInterface.iface.inputs.map((port) => (
                  <div
                    key={`in-${port.handleId}`}
                    className="query-node__port-row"
                  >
                    <span
                      hidden
                      data-query-node-handle-marker={`target-${port.handleId}`}
                    />
                    <Handle
                      className="query-node__handle"
                      type="target"
                      id={port.handleId}
                      position={Position.Left}
                      data-query-node-handle={`target-${port.handleId}`}
                    />
                    <span className="query-node__port-pill">{port.name}</span>
                  </div>
                ))}
              </div>
              <div className="query-node__ports-column">
                <div className="query-node__ports-title">{t("queryNode.outputs")}</div>
                {subgraphInterface.iface.outputs.map((port) => (
                  <div
                    key={`out-${port.handleId}`}
                    className="query-node__port-row"
                  >
                    <span
                      hidden
                      data-query-node-handle-marker={`source-${port.handleId}`}
                    />
                    <Handle
                      className="query-node__handle"
                      type="source"
                      id={port.handleId}
                      position={Position.Right}
                      data-query-node-handle={`source-${port.handleId}`}
                    />
                    <span className="query-node__port-pill">{port.name}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      {hasErrors ? <span className="query-node__badge">{t("queryNode.error")}</span> : null}
      {data.isPreview ||
      data.node.kind === "output" ||
      data.node.kind === "subgraph" ||
      data.node.kind === "helperFunctions" ||
      data.node.kind === "importGraphHelpers" ||
      data.node.kind === "importHelperFunctions" ? null : (
        <>
          <span hidden data-query-node-handle-marker="source-out" />
          <Handle
            className="query-node__handle"
            type="source"
            id="out"
            position={Position.Right}
            data-query-node-handle="source-out"
          />
        </>
      )}
    </div>
  );
}
