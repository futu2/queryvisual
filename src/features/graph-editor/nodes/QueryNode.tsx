import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { GraphNode } from "../../../domain/document/types";
import { formatTableRef } from "../../../domain/schema/types";
import { inferChildGraphInterface } from "../../../domain/workspace/interfaces";
import type { FlowNodeData } from "../flowAdapter";
import "./queryNode.css";

const PRESENTATION_BY_KIND: Record<
  GraphNode["kind"],
  { family: "source" | "transform" | "terminal"; glyph: string }
> = {
  graphInput: { family: "source", glyph: "IN" },
  fromTable: { family: "source", glyph: "TB" },
  subgraph: { family: "transform", glyph: "SG" },
  join: { family: "transform", glyph: "+" },
  where: { family: "transform", glyph: "?" },
  select: { family: "transform", glyph: "[]" },
  aggregation: { family: "transform", glyph: "#" },
  sort: { family: "transform", glyph: "::" },
  limit: { family: "transform", glyph: "1" },
  output: { family: "terminal", glyph: "OUT" },
};

function handleTop(index: number, count: number) {
  if (count <= 1) {
    return 48;
  }

  const min = 32;
  const max = 72;
  const ratio = index / (count - 1);
  return min + (max - min) * ratio;
}

function formatInterfaceSummary(inputCount: number, outputCount: number) {
  return `${inputCount} inputs / ${outputCount} outputs`;
}

function summaryText(node: GraphNode, workspace?: FlowNodeData["workspace"]) {
  switch (node.kind) {
    case "fromTable":
      return `${formatTableRef(node.data.tableRef)} · ${Object.keys(node.data.columns).length} cols`;
    case "graphInput":
      return `${Object.keys(node.data.columns).length} cols`;
    case "subgraph": {
      const { graph, iface } = inferChildGraphInterface(workspace, node.data.graphId);
      const base = formatInterfaceSummary(iface.inputs.length, iface.outputs.length);
      if (!node.data.graphId.trim()) {
        return base;
      }
      if (!graph) {
        return `Missing graph · ${base}`;
      }
      return base;
    }
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
          type="target"
          id="left"
          position={Position.Left}
          style={{ top: 34 }}
          data-query-node-handle="target-left"
        />
        <span hidden data-query-node-handle-marker="target-right" />
        <Handle
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

  if (node.kind === "subgraph") {
    const { iface } = inferChildGraphInterface(workspace, node.data.graphId);

    return (
      <>
        {iface.inputs.map((port) => (
          <span
            key={`subgraph-target-${port.handleId}`}
            hidden
            data-query-node-handle-marker={`target-${port.handleId}`}
          />
        ))}
        {iface.inputs.map((port, index) => (
          <Handle
            key={`subgraph-target-handle-${port.handleId}`}
            type="target"
            id={port.handleId}
            position={Position.Left}
            style={{ top: handleTop(index, iface.inputs.length) }}
            data-query-node-handle={`target-${port.handleId}`}
          />
        ))}
      </>
    );
  }

  return (
    <>
      <span hidden data-query-node-handle-marker="target-in" />
      <Handle
        type="target"
        id="in"
        position={Position.Left}
        data-query-node-handle="target-in"
      />
    </>
  );
}

export function QueryNode({ data, selected }: NodeProps<FlowNodeData>) {
  const hasErrors = data.diagnostics.some(
    (diagnostic) => diagnostic.level === "error",
  );
  const presentation = PRESENTATION_BY_KIND[data.node.kind];
  const subgraphInterface =
    data.node.kind === "subgraph"
      ? inferChildGraphInterface(data.workspace, data.node.data.graphId)
      : null;

  return (
    <div
      className={`query-node query-node--${presentation.family} query-node--${data.node.kind} ${selected ? "is-selected" : ""} ${hasErrors ? "has-errors" : ""}`}
      data-node-kind={data.node.kind}
      data-node-family={presentation.family}
    >
      <TargetHandles node={data.node} workspace={data.workspace} />
      {data.node.kind === "join" ? <span className="query-node__accent" aria-hidden="true" /> : null}
      <div className="query-node__header">
        <span className="query-node__glyph" aria-hidden="true">
          {presentation.glyph}
        </span>
        <div className="query-node__kind">{data.node.kind}</div>
      </div>
      <div className="query-node__title">{data.node.label}</div>
      <div className="query-node__summary">{summaryText(data.node, data.workspace)}</div>
      {data.node.kind === "subgraph" ? (
        <div className="query-node__ports" aria-label="Subgraph interface">
          {subgraphInterface && subgraphInterface.graph ? (
            <div className="query-node__ports-heading">
              {subgraphInterface.graph.metadata.name}
            </div>
          ) : null}
          {subgraphInterface && !subgraphInterface.graph && data.node.data.graphId.trim() ? (
            <div className="query-node__ports-heading is-missing">
              Missing graph
            </div>
          ) : null}
          {subgraphInterface ? (
            <div className="query-node__ports-grid">
              <div className="query-node__ports-column">
                <div className="query-node__ports-title">Inputs</div>
                {subgraphInterface.iface.inputs.map((port) => (
                  <div
                    key={`in-${port.handleId}`}
                    className="query-node__port-row"
                  >
                    <span className="query-node__port-pill">{port.name}</span>
                  </div>
                ))}
              </div>
              <div className="query-node__ports-column">
                <div className="query-node__ports-title">Outputs</div>
                {subgraphInterface.iface.outputs.map((port) => (
                  <div
                    key={`out-${port.handleId}`}
                    className="query-node__port-row"
                  >
                    <span className="query-node__port-pill">{port.name}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      {hasErrors ? <span className="query-node__badge">error</span> : null}
      {data.node.kind === "output" ? null : data.node.kind === "subgraph" ? (
        <>
          {(subgraphInterface?.iface.outputs ?? []).map((port) => (
            <span
              key={`subgraph-source-marker-${port.handleId}`}
              hidden
              data-query-node-handle-marker={`source-${port.handleId}`}
            />
          ))}
          {(subgraphInterface?.iface.outputs ?? []).map((port, index) => (
            <Handle
              key={`subgraph-source-handle-${port.handleId}`}
              type="source"
              id={port.handleId}
              position={Position.Right}
              style={{
                top: handleTop(index, subgraphInterface?.iface.outputs.length ?? 0),
              }}
              data-query-node-handle={`source-${port.handleId}`}
            />
          ))}
        </>
      ) : (
        <>
          <span hidden data-query-node-handle-marker="source-out" />
          <Handle
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
