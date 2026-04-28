import type { ColumnMap } from "../schema/types";
import type {
  GraphDefinition,
  GraphNode,
  GraphWorkspace,
  SubgraphTarget,
} from "../document/types";
import { resolveInstalledPackageExport } from "../package/install";
import type {
  GraphPackageExport,
  InstalledGraphPackage,
} from "../package/types";

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

type SubgraphDataLike = Pick<
  Extract<GraphNode, { kind: "subgraph" }>["data"],
  "graphId" | "target"
>;

export type ResolvedSubgraphReference = {
  target: SubgraphTarget | null;
  graph: GraphDefinition | null;
  pkg: InstalledGraphPackage | null;
  exportEntry: GraphPackageExport | null;
  label: string | null;
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

export function inferSubgraphTarget(
  value: string | SubgraphTarget | SubgraphDataLike | null | undefined,
): SubgraphTarget | null {
  if (value == null) {
    return null;
  }

  if (typeof value === "string") {
    return { kind: "local", graphId: value };
  }

  if ("kind" in value) {
    return value;
  }

  return value.target ?? { kind: "local", graphId: value.graphId };
}

export function resolveSubgraphTarget(
  workspace: GraphWorkspace | null | undefined,
  value: string | SubgraphTarget | SubgraphDataLike | null | undefined,
): ResolvedSubgraphReference {
  const target = inferSubgraphTarget(value);

  if (!workspace || !target) {
    return {
      target,
      graph: null,
      pkg: null,
      exportEntry: null,
      label: null,
    };
  }

  if (target.kind === "local") {
    const graph = findGraphById(workspace, target.graphId);
    return {
      target,
      graph,
      pkg: null,
      exportEntry: null,
      label: graph?.metadata.name ?? null,
    };
  }

  const resolved = resolveInstalledPackageExport(workspace, target);
  if (!resolved) {
    return {
      target,
      graph: null,
      pkg: null,
      exportEntry: null,
      label: null,
    };
  }

  const exportEntry =
    resolved.pkg.exports.find((entry) => entry.exportKey === target.exportKey) ??
    null;
  const label = exportEntry
    ? `${resolved.pkg.metadata.name} / ${exportEntry.displayName}`
    : resolved.graph.metadata.name;

  return {
    target,
    graph: resolved.graph,
    pkg: resolved.pkg,
    exportEntry,
    label,
  };
}

export function buildSubgraphWorkspace(
  workspace: GraphWorkspace,
  resolved: ResolvedSubgraphReference,
): GraphWorkspace {
  if (resolved.target?.kind !== "package" || !resolved.pkg || !resolved.graph) {
    return workspace;
  }

  return {
    ...workspace,
    entryGraphId: resolved.graph.id,
    graphs: resolved.pkg.graphs,
  };
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
  value: string | SubgraphTarget | SubgraphDataLike | null | undefined,
): { graph: GraphDefinition | null; iface: InferredGraphInterface; label: string | null } {
  const resolved = resolveSubgraphTarget(workspace, value);
  if (!resolved.graph) {
    return { graph: null, iface: { inputs: [], outputs: [] }, label: null };
  }

  return {
    graph: resolved.graph,
    iface: inferGraphInterface(resolved.graph),
    label: resolved.label,
  };
}
