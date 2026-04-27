import { createSampleDocument } from "../document/sample";
import type { GraphDefinition, GraphWorkspace } from "../document/types";

function createWorkspaceGraph(): GraphDefinition {
  const document = createSampleDocument();

  return {
    id: "graph-main",
    metadata: document.metadata,
    viewport: document.viewport,
    nodes: document.nodes,
    edges: document.edges,
  };
}

export function createSampleWorkspace(): GraphWorkspace {
  const graph = createWorkspaceGraph();

  return {
    version: 2,
    metadata: {
      name: graph.metadata.name,
    },
    entryGraphId: graph.id,
    graphs: [graph],
    installedPackages: [],
    packageManifest: null,
  };
}
