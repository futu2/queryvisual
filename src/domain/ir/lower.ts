import { parseExpression } from "../expr/parser";
import { renderExpressionSql } from "../expr/render";
import type { GraphNode } from "../document/types";
import type { SemanticOutput } from "../graph/semantic";
import { formatTableRef } from "../schema/types";
import type { IRRelNode } from "./types";

export function lowerOutputToIr(semantic: SemanticOutput): IRRelNode | null {
  if (semantic.diagnostics.some((diagnostic) => diagnostic.level === "error")) {
    return null;
  }

  const cache = new Map<string, IRRelNode>();
  const inProgress = new Set<string>();
  const edgesByTarget = new Map(
    semantic.document.nodes.map((node) => [
      node.id,
      semantic.document.edges.filter((edge) => edge.target === node.id),
    ]),
  );

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
        const source = semantic.nodesById[edge.source];
        if (!source) return null;
        return lowerNode(source);
      };

      let lowered: IRRelNode | null = null;

      switch (node.kind) {
        case "graphInput":
          lowered = { kind: "input", name: node.label, schema: node.data.columns };
          break;
        case "fromTable":
          lowered = {
            kind: "scan",
            tableSql: formatTableRef(node.data.tableRef),
            schema: node.data.columns,
          };
          break;
        case "join": {
          const leftEdge = inputs.find((edge) => edge.targetHandle === "left");
          const rightEdge = inputs.find((edge) => edge.targetHandle === "right");
          if (!leftEdge || !rightEdge) return null;
          const leftNode = semantic.nodesById[leftEdge.source];
          const rightNode = semantic.nodesById[rightEdge.source];
          const left = lowerNode(leftNode);
          const right = lowerNode(rightNode);
          const schema = semantic.schemas[node.id];
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
          const schema = semantic.schemas[node.id];
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
          const schema = semantic.schemas[node.id];
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
      }

      if (lowered) cache.set(node.id, lowered);
      return lowered;
    } finally {
      inProgress.delete(node.id);
    }
  }

  const outputNode = semantic.nodesById[semantic.outputId];
  if (!outputNode) return null;
  return lowerNode(outputNode);
}
