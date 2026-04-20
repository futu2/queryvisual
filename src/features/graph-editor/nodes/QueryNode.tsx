import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { GraphNode } from "../../../domain/document/types";
import { formatTableRef } from "../../../domain/schema/types";
import type { FlowNodeData } from "../flowAdapter";
import "./queryNode.css";

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

  return (
    <div
      className={`query-node ${selected ? "is-selected" : ""} ${hasErrors ? "has-errors" : ""}`}
    >
      <TargetHandles node={data.node} />
      <div className="query-node__kind">{data.node.kind}</div>
      <div className="query-node__title">{data.node.label}</div>
      <div className="query-node__summary">{summaryText(data.node)}</div>
      {hasErrors ? <span className="query-node__badge">error</span> : null}
      {data.node.kind === "output" ? null : (
        <Handle type="source" id="out" position={Position.Right} />
      )}
    </div>
  );
}
