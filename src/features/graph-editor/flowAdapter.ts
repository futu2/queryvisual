import type { Edge, Node } from "@xyflow/react";
import type { Diagnostic } from "../../domain/diagnostics/types";
import type { GraphDocument, GraphNode } from "../../domain/document/types";

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

export function toFlowEdges(document: GraphDocument): Edge[] {
  return document.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    sourceHandle: edge.sourceHandle,
    target: edge.target,
    targetHandle: edge.targetHandle,
  }));
}
