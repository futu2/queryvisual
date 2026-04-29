import type { GraphDefinition, GraphNode, GraphWorkspace } from "../document/types";
import { inferSubgraphTarget } from "./interfaces";

export function collectReferencedGraphIds(graph: Pick<GraphDefinition, "nodes">): string[] {
  return graph.nodes
    .filter(
      (
        node,
      ): node is
        | Extract<GraphNode, { kind: "subgraph" }>
        | Extract<GraphNode, { kind: "importGraphHelpers" }> =>
        node.kind === "subgraph" || node.kind === "importGraphHelpers",
    )
    .flatMap((node) => {
      if (node.kind === "importGraphHelpers") {
        const target = inferSubgraphTarget(node.data);
        if (!target || target.kind !== "local" || target.graphId === "") {
          return [];
        }
        return [target.graphId];
      }

      const target = inferSubgraphTarget(node.data);
      if (!target || target.kind !== "local" || target.graphId === "") {
        return [];
      }
      return [target.graphId];
    });
}

export type DetectedGraphCycle = {
  // Graph ids in visitation order. The first and last element will be the same id.
  path: string[];
};

export function detectGraphCycle(
  workspace: GraphWorkspace,
  startGraphId: string,
): DetectedGraphCycle | null {
  const visited = new Set<string>();
  const visiting = new Set<string>();

  const byId = new Map(workspace.graphs.map((graph) => [graph.id, graph]));

  function visit(graphId: string, stack: string[]): DetectedGraphCycle | null {
    if (visiting.has(graphId)) {
      return { path: [...stack, graphId] };
    }
    if (visited.has(graphId)) return null;

    visiting.add(graphId);
    const graph = byId.get(graphId);
    for (const childId of graph ? collectReferencedGraphIds(graph) : []) {
      const cycle = visit(childId, [...stack, graphId]);
      if (cycle) return cycle;
    }
    visiting.delete(graphId);
    visited.add(graphId);
    return null;
  }

  return visit(startGraphId, []);
}
