import type { IRRelNode } from "../ir/types";

interface RenderContext {
  nextAlias: number;
}

function createRenderContext(): RenderContext {
  return { nextAlias: 1 };
}

function quoteIdentifier(identifier: string) {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function allocateAlias(context: RenderContext) {
  const alias = `q${context.nextAlias}`;
  context.nextAlias += 1;
  return alias;
}

function renderJoinType(joinType: string) {
  switch (joinType) {
    case "inner":
      return "INNER";
    case "left":
      return "LEFT";
    case "right":
      return "RIGHT";
    case "full":
      return "FULL";
    default:
      return "INNER";
  }
}

function renderProjection(
  projection: { alias: string; expressionSql: string },
) {
  return `${projection.expressionSql} AS ${quoteIdentifier(projection.alias)}`;
}

function renderRelation(node: IRRelNode, context: RenderContext): string {
  switch (node.kind) {
    case "input":
      return quoteIdentifier(node.name);
    case "scan":
      return node.tableSql;
    default:
      return `(${renderSqlWithContext(node, context)}) AS ${allocateAlias(context)}`;
  }
}

function renderSqlWithContext(node: IRRelNode, context: RenderContext): string {
  switch (node.kind) {
    case "input":
      return `SELECT * FROM ${quoteIdentifier(node.name)}`;
    case "scan":
      return `SELECT * FROM ${node.tableSql}`;
    case "join":
      return `SELECT * FROM ${renderRelation(node.left, context)} ${renderJoinType(node.joinType)} JOIN ${renderRelation(node.right, context)} ON ${node.predicateSql}`;
    case "filter":
      return `SELECT * FROM ${renderRelation(node.input, context)} WHERE ${node.predicateSql}`;
    case "project":
      return `SELECT ${node.projections.map(renderProjection).join(", ")} FROM ${renderRelation(node.input, context)}`;
    case "aggregate": {
      const selectItems = [
        ...node.groupBy.map(renderProjection),
        ...node.aggregates.map(renderProjection),
      ];
      const groupByItems = node.groupBy.map((item) => item.expressionSql).join(", ");
      return `SELECT ${selectItems.join(", ")} FROM ${renderRelation(node.input, context)}${groupByItems === "" ? "" : ` GROUP BY ${groupByItems}`}`;
    }
    case "sort":
      return `SELECT * FROM ${renderRelation(node.input, context)} ORDER BY ${node.items.map((item) => `${item.expressionSql} ${item.direction.toUpperCase()}`).join(", ")}`;
    case "limit":
      return `SELECT * FROM ${renderRelation(node.input, context)} LIMIT ${node.count}${node.offset === null ? "" : ` OFFSET ${node.offset}`}`;
  }
}

export function renderSql(node: IRRelNode): string {
  return renderSqlWithContext(node, createRenderContext());
}
