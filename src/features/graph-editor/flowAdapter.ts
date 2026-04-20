import type { Edge, Node } from "@xyflow/react";
import type { Diagnostic } from "../../domain/diagnostics/types";
import type { GraphDocument, GraphNode } from "../../domain/document/types";

export interface FlowNodeData {
  node: GraphNode;
  diagnostics: Diagnostic[];
}

export function toFlowNodes(
  document: GraphDocument,
  diagnostics: Diagnostic[],
): Array<Node<FlowNodeData>> {
  return document.nodes.map((node) => ({
    id: node.id,
    type: "queryNode",
    position: node.position,
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
