import type { GraphDefinition, GraphWorkspace } from "../document/types";

export type InferredGraphPort = {
  name: string;
  nodeId: string;
};

export type InferredGraphInterface = {
  inputs: InferredGraphPort[];
  outputs: InferredGraphPort[];
};

function byName(a: InferredGraphPort, b: InferredGraphPort) {
  return a.name.localeCompare(b.name);
}

export function findGraphById(
  workspace: GraphWorkspace,
  graphId: string,
): GraphDefinition | null {
  return workspace.graphs.find((graph) => graph.id === graphId) ?? null;
}

export function inferGraphInterface(graph: GraphDefinition): InferredGraphInterface {
  const inputs = graph.nodes
    .filter((node) => node.kind === "graphInput")
    .map((node) => ({ name: node.data.inputName, nodeId: node.id }))
    .sort(byName);

  const outputs = graph.nodes
    .filter((node) => node.kind === "output")
    .map((node) => ({ name: node.data.outputName, nodeId: node.id }))
    .sort(byName);

  return { inputs, outputs };
}

export function inferChildGraphInterface(
  workspace: GraphWorkspace | null | undefined,
  graphId: string,
): { graph: GraphDefinition | null; iface: InferredGraphInterface } {
  if (!workspace) {
    return { graph: null, iface: { inputs: [], outputs: [] } };
  }

  const graph = findGraphById(workspace, graphId);
  if (!graph) {
    return { graph: null, iface: { inputs: [], outputs: [] } };
  }

  return { graph, iface: inferGraphInterface(graph) };
}

