import type { SemanticOutput } from "../graph/semantic";
import { validateOutput } from "../graph/validate";
import { lowerOutputToIr } from "../ir/lower";
import { optimizeOutput } from "../ir/optimize";
import type { IRRelNode } from "../ir/types";
import { renderSql } from "../sql/renderer";
import type { GraphDocument, GraphNode, GraphWorkspace } from "../document/types";
import type { ColumnMap } from "../schema/types";
import { formatTableRef } from "../schema/types";
import { parseExpression } from "../expr/parser";
import { renderExpressionSql } from "../expr/render";
import { isGraphWorkspaceLikeRuntime, normalizeGraphWorkspaceLikeRuntime } from "../document/types";

export interface CompileOutputResult {
  semantic: SemanticOutput;
  ir: IRRelNode | null;
  optimizedIr: IRRelNode | null;
  sql: string;
}

function isWorkspace(value: unknown): value is GraphWorkspace {
  return isGraphWorkspaceLikeRuntime(value);
}

function parseOutputHandle(handle: string): string | null {
  if (!handle.startsWith("out:")) return null;
  const id = handle.slice("out:".length);
  return id === "" ? null : id;
}

function parseInputHandle(handle: string): string | null {
  if (!handle.startsWith("in:")) return null;
  const id = handle.slice("in:".length);
  return id === "" ? null : id;
}

function lowerWorkspaceOutputToIr(params: {
  workspace: GraphWorkspace;
  semantic: SemanticOutput;
  graphInputRelations?: Record<string, IRRelNode>;
}): IRRelNode | null {
  if (params.semantic.diagnostics.some((diagnostic) => diagnostic.level === "error")) {
    return null;
  }

  const cache = new Map<string, IRRelNode>();
  const inProgress = new Set<string>();
  const edgesByTarget = new Map(
    params.semantic.document.nodes.map((node) => [
      node.id,
      params.semantic.document.edges.filter((edge) => edge.target === node.id),
    ]),
  );

  function subgraphInputSchemas(subgraphNodeId: string) {
    const schemas: Record<string, ColumnMap> = {};
    for (const edge of params.semantic.document.edges) {
      if (edge.target !== subgraphNodeId) continue;
      const childInputId = parseInputHandle(edge.targetHandle);
      if (!childInputId) continue;
      schemas[childInputId] = params.semantic.schemas[edge.source] ?? {};
    }
    return schemas;
  }

  function subgraphInputRelations(subgraphNodeId: string) {
    const relations: Record<string, IRRelNode> = {};
    for (const edge of params.semantic.document.edges) {
      if (edge.target !== subgraphNodeId) continue;
      const childInputId = parseInputHandle(edge.targetHandle);
      if (!childInputId) continue;

      const relation = lowerEdgeSource(edge);
      if (!relation) continue;
      relations[childInputId] = relation;
    }
    return relations;
  }

  function lowerEdgeSource(edge: { source: string; sourceHandle: string }): IRRelNode | null {
    const sourceNode = params.semantic.nodesById[edge.source];
    if (!sourceNode) return null;

    if (sourceNode.kind !== "subgraph") {
      return lowerNode(sourceNode);
    }

    if (sourceNode.data.target?.kind === "package") {
      // Defensive: package subgraph targets are not supported in lowering yet.
      return null;
    }

    const childOutputId = parseOutputHandle(edge.sourceHandle);
    if (!childOutputId) return null;
    const childGraphId = sourceNode.data.graphId;

    const childResult = compileOutput(
      params.workspace,
      childGraphId,
      childOutputId,
      subgraphInputSchemas(sourceNode.id),
      subgraphInputRelations(sourceNode.id),
    );
    if (childResult.semantic.diagnostics.some((diagnostic) => diagnostic.level === "error")) {
      return null;
    }
    return childResult.optimizedIr ?? childResult.ir;
  }

  function lowerNode(node: GraphNode | undefined): IRRelNode | null {
    if (!node) return null;

    const cached = cache.get(node.id);
    if (cached) return cached;
    if (inProgress.has(node.id)) return null;
    inProgress.add(node.id);

    try {
      const inputs = edgesByTarget.get(node.id) ?? [];
      const oneInput = () => {
        const edge = inputs.find((candidate) => candidate.targetHandle === "in");
        if (!edge) return null;
        return lowerEdgeSource(edge);
      };

      let lowered: IRRelNode | null = null;

      switch (node.kind) {
        case "graphInput": {
          const overridden = params.graphInputRelations?.[node.id];
          if (overridden) {
            lowered = overridden;
            break;
          }
          lowered = {
            kind: "input",
            name: node.data.inputName,
            schema: params.semantic.schemas[node.id] ?? node.data.columns,
          };
          break;
        }
        case "fromTable":
          lowered = {
            kind: "scan",
            tableSql: formatTableRef(node.data.tableRef),
            schema: params.semantic.schemas[node.id] ?? node.data.columns,
          };
          break;
        case "join": {
          const leftEdge = inputs.find((edge) => edge.targetHandle === "left");
          const rightEdge = inputs.find((edge) => edge.targetHandle === "right");
          if (!leftEdge || !rightEdge) return null;
          const left = lowerEdgeSource(leftEdge);
          const right = lowerEdgeSource(rightEdge);
          const schema = params.semantic.schemas[node.id];
          if (!left || !right || !schema) return null;
          lowered = {
            kind: "join",
            joinType: node.data.joinType,
            predicateSql: renderExpressionSql(parseExpression(node.data.predicate)),
            left,
            right,
            schema,
          };
          break;
        }
        case "where": {
          const input = oneInput();
          if (!input) return null;
          lowered = {
            kind: "filter",
            predicateSql: renderExpressionSql(parseExpression(node.data.predicate)),
            input,
          };
          break;
        }
        case "select": {
          const input = oneInput();
          const schema = params.semantic.schemas[node.id];
          if (!input || !schema) return null;
          lowered = {
            kind: "project",
            projections: node.data.mappings.map((mapping) => ({
              alias: mapping.name,
              expressionSql: renderExpressionSql(parseExpression(mapping.expression)),
            })),
            input,
            schema,
          };
          break;
        }
        case "aggregation": {
          const input = oneInput();
          const schema = params.semantic.schemas[node.id];
          if (!input || !schema) return null;
          lowered = {
            kind: "aggregate",
            groupBy: node.data.groupBy.map((row) => ({
              alias: row.name,
              expressionSql: renderExpressionSql(parseExpression(row.expression)),
            })),
            aggregates: node.data.aggregates.map((row) => ({
              alias: row.name,
              expressionSql: renderExpressionSql(parseExpression(row.expression)),
            })),
            input,
            schema,
          };
          break;
        }
        case "sort": {
          const input = oneInput();
          if (!input) return null;
          lowered = {
            kind: "sort",
            items: node.data.items.map((item) => ({
              expressionSql: renderExpressionSql(parseExpression(item.expression)),
              direction: item.direction,
            })),
            input,
          };
          break;
        }
        case "limit": {
          const input = oneInput();
          if (!input) return null;
          lowered = {
            kind: "limit",
            count: node.data.count,
            offset: node.data.offset,
            input,
          };
          break;
        }
        case "output":
          lowered = oneInput();
          break;
        case "subgraph":
          // Lowering must be driven by the connected output handle (edge sourceHandle).
          lowered = null;
          break;
      }

      if (lowered) cache.set(node.id, lowered);
      return lowered;
    } finally {
      inProgress.delete(node.id);
    }
  }

  const outputNode = params.semantic.nodesById[params.semantic.outputId];
  if (!outputNode) return null;
  return lowerNode(outputNode);
}

export function compileOutput(document: GraphDocument, outputId: string): CompileOutputResult;
export function compileOutput(
  workspace: GraphWorkspace,
  graphId: string,
  outputId: string,
  graphInputSchemas?: Record<string, ColumnMap>,
  graphInputRelations?: Record<string, IRRelNode>,
): CompileOutputResult;
export function compileOutput(
  arg1: GraphDocument | GraphWorkspace,
  arg2: string,
  arg3?: string,
  arg4?: Record<string, ColumnMap>,
  arg5?: Record<string, IRRelNode>,
): CompileOutputResult {
  if (isWorkspace(arg1)) {
    const workspace = normalizeGraphWorkspaceLikeRuntime(arg1);
    const graphId = arg2;
    const outputId = arg3 ?? arg2;
    const graphInputSchemas = arg4 ?? {};
    const graphInputRelations = arg5 ?? {};

    const semantic = validateOutput(workspace, graphId, outputId, graphInputSchemas);
    const ir = lowerWorkspaceOutputToIr({ workspace, semantic, graphInputRelations });
    const optimizedIr = ir ? optimizeOutput(ir) : null;

    return {
      semantic,
      ir,
      optimizedIr,
      sql: optimizedIr ? renderSql(optimizedIr) : "",
    };
  }

  const document = arg1;
  const outputId = arg2;
  const semantic = validateOutput(document, outputId);
  const ir = lowerOutputToIr(semantic);
  const optimizedIr = ir ? optimizeOutput(ir) : null;

  return {
    semantic,
    ir,
    optimizedIr,
    sql: optimizedIr ? renderSql(optimizedIr) : "",
  };
}
