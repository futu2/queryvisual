import type { ColumnMap } from "../schema/types";
import type { GraphDefinition, GraphWorkspace } from "../document/types";

export type InferredGraphPort = {
  name: string;
  nodeId: string;
  handleId: string;
};

export type InferredGraphInputPort = InferredGraphPort & {
  columns: ColumnMap;
};

export type InferredGraphInterface = {
  inputs: InferredGraphInputPort[];
  outputs: InferredGraphPort[];
};

function byNameThenNodeId(a: InferredGraphPort, b: InferredGraphPort) {
  const byName = a.name.localeCompare(b.name);
  if (byName !== 0) return byName;
  return a.nodeId.localeCompare(b.nodeId);
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
    .map((node) => ({
      name: node.data.inputName,
      nodeId: node.id,
      handleId: `in:${node.id}`,
      columns: node.data.columns,
    }))
    .sort(byNameThenNodeId);

  const outputs = graph.nodes
    .filter((node) => node.kind === "output")
    .map((node) => ({
      name: node.data.outputName,
      nodeId: node.id,
      handleId: `out:${node.id}`,
    }))
    .sort(byNameThenNodeId);

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
