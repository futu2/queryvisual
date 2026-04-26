import type { Edge, Node } from "@xyflow/react";
import type { Diagnostic } from "../../domain/diagnostics/types";
import type { GraphDocument, GraphNode } from "../../domain/document/types";
import type { DeletableEdgeData } from "./edges/DeletableEdge";

export interface FlowNodeData {
  node: GraphNode;
  diagnostics: Diagnostic[];
}

export interface FlowNodeRuntime {
  measured?: {
    width: number;
    height: number;
  };
  width?: number;
  height?: number;
  dragging?: boolean;
}

export function toFlowNodes(
  document: GraphDocument,
  diagnostics: Diagnostic[],
  selectedNodeId: string | null,
  runtimeByNodeId: Record<string, FlowNodeRuntime> = {},
): Array<Node<FlowNodeData>> {
  return document.nodes.map((node) => ({
    ...runtimeByNodeId[node.id],
    id: node.id,
    type: "queryNode",
    position: node.position,
    selected: node.id === selectedNodeId,
    data: {
      node,
      diagnostics: diagnostics.filter(
        (diagnostic) => diagnostic.ref?.nodeId === node.id,
      ),
    },
  }));
}

export function toFlowEdges(
  document: GraphDocument,
  onDelete: (edgeId: string) => void,
): Array<Edge<DeletableEdgeData, "deletableEdge">> {
  return document.edges.map((edge) => ({
    id: edge.id,
    type: "deletableEdge",
    source: edge.source,
    sourceHandle: edge.sourceHandle,
    target: edge.target,
    targetHandle: edge.targetHandle,
    data: {
      onDelete,
    },
  }));
}
