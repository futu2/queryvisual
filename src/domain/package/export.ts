import type { GraphWorkspace } from "../document/types";
import type { GraphDefinition, GraphNode } from "../document/types";
import type { GraphPackageFile } from "./types";

function getLocalSubgraphTargetGraphId(
  node: Extract<GraphNode, { kind: "subgraph" }>,
): string | null {
  if (node.data.target?.kind === "local") {
    return node.data.target.graphId;
  }

  if (typeof node.data.graphId === "string" && node.data.graphId !== "") {
    return node.data.graphId;
  }

  return null;
}

function collectReachableLocalGraphIds(
  graphsById: Map<string, GraphDefinition>,
  rootGraphId: string,
  seen = new Set<string>(),
): Set<string> {
  if (seen.has(rootGraphId)) {
    return seen;
  }

  seen.add(rootGraphId);

  const graph = graphsById.get(rootGraphId);
  if (!graph) {
    return seen;
  }

  for (const node of graph.nodes) {
    if (node.kind !== "subgraph") {
      continue;
    }

    const childGraphId = getLocalSubgraphTargetGraphId(node);
    if (!childGraphId) {
      continue;
    }

    collectReachableLocalGraphIds(graphsById, childGraphId, seen);
  }

  return seen;
}

export function buildPackageFileFromWorkspace(
  workspace: GraphWorkspace,
): GraphPackageFile {
  const manifest = workspace.packageManifest;
  if (!manifest) {
    throw new Error("Workspace package manifest is missing");
  }

  const graphsById = new Map(workspace.graphs.map((graph) => [graph.id, graph]));
  const graphIds = new Set<string>();

  for (const exportEntry of manifest.exports) {
    for (const graphId of collectReachableLocalGraphIds(
      graphsById,
      exportEntry.graphId,
    )) {
      graphIds.add(graphId);
    }
  }

  return {
    formatVersion: 1,
    packageId: manifest.packageId,
    version: manifest.version,
    metadata: {
      name: manifest.name,
      ...(manifest.description ? { description: manifest.description } : {}),
    },
    exports: manifest.exports,
    graphs: workspace.graphs.filter((graph) => graphIds.has(graph.id)),
    dependencies: workspace.installedPackages.map((pkg) => ({
      formatVersion: 1,
      packageId: pkg.packageId,
      version: pkg.version,
      metadata: pkg.metadata,
      exports: pkg.exports,
      graphs: pkg.graphs,
      dependencies: [],
    })),
  };
}
