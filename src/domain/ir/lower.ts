import { parseExpression } from "../expr/parser";
import { renderExpressionSql } from "../expr/render";
import type { GraphNode } from "../document/types";
import type { SemanticOutput } from "../graph/semantic";
import { formatTableRef } from "../schema/types";
import type { IRRelNode } from "./types";

export function lowerOutputToIr(semantic: SemanticOutput): IRRelNode | null {
  const cache = new Map<string, IRRelNode>();
  const edgesByTarget = new Map(
    semantic.document.nodes.map((node) => [
      node.id,
      semantic.document.edges.filter((edge) => edge.target === node.id),
    ]),
  );

  function lowerNode(node: GraphNode): IRRelNode | null {
    if (cache.has(node.id)) return cache.get(node.id)!;

    const inputs = edgesByTarget.get(node.id) ?? [];
    const oneInput = () => {
      const edge = inputs.find((candidate) => candidate.targetHandle === "in");
      return edge ? lowerNode(semantic.nodesById[edge.source]) : null;
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
        lowered = {
          kind: "join",
          joinType: node.data.joinType,
          predicateSql: renderExpressionSql(parseExpression(node.data.predicate)),
          left: lowerNode(semantic.nodesById[leftEdge.source])!,
          right: lowerNode(semantic.nodesById[rightEdge.source])!,
          schema: semantic.schemas[node.id],
        };
        break;
      }
      case "where":
        lowered = {
          kind: "filter",
          predicateSql: renderExpressionSql(parseExpression(node.data.predicate)),
          input: oneInput()!,
        };
        break;
      case "select":
        lowered = {
          kind: "project",
          projections: node.data.mappings.map((mapping) => ({
            alias: mapping.name,
            expressionSql: renderExpressionSql(parseExpression(mapping.expression)),
          })),
          input: oneInput()!,
          schema: semantic.schemas[node.id],
        };
        break;
      case "aggregation":
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
          input: oneInput()!,
          schema: semantic.schemas[node.id],
        };
        break;
      case "sort":
        lowered = {
          kind: "sort",
          items: node.data.items.map((item) => ({
            expressionSql: renderExpressionSql(parseExpression(item.expression)),
            direction: item.direction,
          })),
          input: oneInput()!,
        };
        break;
      case "limit":
        lowered = {
          kind: "limit",
          count: node.data.count,
          offset: node.data.offset,
          input: oneInput()!,
        };
        break;
      case "output":
        lowered = oneInput();
        break;
    }

    if (lowered) cache.set(node.id, lowered);
    return lowered;
  }

  const outputNode = semantic.nodesById[semantic.outputId];
  return lowerNode(outputNode);
}
