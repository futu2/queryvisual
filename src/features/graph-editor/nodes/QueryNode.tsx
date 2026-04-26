import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { GraphNode } from "../../../domain/document/types";
import { formatTableRef } from "../../../domain/schema/types";
import type { FlowNodeData } from "../flowAdapter";
import "./queryNode.css";

const PRESENTATION_BY_KIND: Record<
  GraphNode["kind"],
  { family: "source" | "transform" | "terminal"; glyph: string }
> = {
  graphInput: { family: "source", glyph: "IN" },
  fromTable: { family: "source", glyph: "TB" },
  join: { family: "transform", glyph: "+" },
  where: { family: "transform", glyph: "?" },
  select: { family: "transform", glyph: "[]" },
  aggregation: { family: "transform", glyph: "#" },
  sort: { family: "transform", glyph: "::" },
  limit: { family: "transform", glyph: "1" },
  output: { family: "terminal", glyph: "OUT" },
};

function summaryText(node: GraphNode) {
  switch (node.kind) {
    case "fromTable":
      return `${formatTableRef(node.data.tableRef)} · ${Object.keys(node.data.columns).length} cols`;
    case "graphInput":
      return `${Object.keys(node.data.columns).length} cols`;
    case "join":
      return `${node.data.joinType} join`;
    case "where":
      return node.data.predicate;
    case "select":
      return `${node.data.mappings.length} expressions`;
    case "aggregation":
      return `${node.data.groupBy.length} groups · ${node.data.aggregates.length} aggs`;
    case "sort":
      return `${node.data.items.length} sort keys`;
    case "limit":
      return `limit ${node.data.count}`;
    case "output":
      return node.data.outputName;
  }
}

function TargetHandles({ node }: { node: GraphNode }) {
  if (node.kind === "join") {
    return (
      <>
        <Handle type="target" id="left" position={Position.Left} style={{ top: 34 }} />
        <Handle type="target" id="right" position={Position.Left} style={{ top: 62 }} />
      </>
    );
  }

  if (node.kind === "fromTable" || node.kind === "graphInput") {
    return null;
  }

  return <Handle type="target" id="in" position={Position.Left} />;
}

export function QueryNode({ data, selected }: NodeProps<FlowNodeData>) {
  const hasErrors = data.diagnostics.some(
    (diagnostic) => diagnostic.level === "error",
  );
  const presentation = PRESENTATION_BY_KIND[data.node.kind];

  return (
    <div
      className={`query-node query-node--${presentation.family} query-node--${data.node.kind} ${selected ? "is-selected" : ""} ${hasErrors ? "has-errors" : ""}`}
      data-node-kind={data.node.kind}
      data-node-family={presentation.family}
    >
      <TargetHandles node={data.node} />
      <div className="query-node__header">
        <span className="query-node__glyph" aria-hidden="true">
          {presentation.glyph}
        </span>
        <div className="query-node__kind">{data.node.kind}</div>
      </div>
      <div className="query-node__title">{data.node.label}</div>
      <div className="query-node__summary">{summaryText(data.node)}</div>
      {hasErrors ? <span className="query-node__badge">error</span> : null}
      {data.node.kind === "output" ? null : (
        <Handle type="source" id="out" position={Position.Right} />
      )}
    </div>
  );
}
