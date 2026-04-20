import type { IRRelNode } from "../ir/types";

function renderInput(node: IRRelNode) {
  switch (node.kind) {
    case "input":
      return node.name;
    case "scan":
      return node.tableSql;
    default:
      return `(${renderSql(node)})`;
  }
}

export function renderSql(node: IRRelNode): string {
  switch (node.kind) {
    case "input":
      return `SELECT * FROM ${node.name}`;
    case "scan":
      return `SELECT * FROM ${node.tableSql}`;
    case "join":
      return `SELECT * FROM ${renderInput(node.left)} ${node.joinType.toUpperCase()} JOIN ${renderInput(node.right)} ON ${node.predicateSql}`;
    case "filter":
      return `${renderSql(node.input)} WHERE ${node.predicateSql}`;
    case "project":
      return `SELECT ${node.projections.map((projection) => `${projection.expressionSql} AS ${projection.alias}`).join(", ")} FROM ${renderInput(node.input)}`;
    case "aggregate": {
      const selectItems = [
        ...node.groupBy.map((item) => `${item.expressionSql} AS ${item.alias}`),
        ...node.aggregates.map((item) => `${item.expressionSql} AS ${item.alias}`),
      ];
      const groupBy = node.groupBy.map((item) => item.expressionSql).join(", ");
      return `SELECT ${selectItems.join(", ")} FROM ${renderInput(node.input)} GROUP BY ${groupBy}`;
    }
    case "sort":
      return `${renderSql(node.input)} ORDER BY ${node.items.map((item) => `${item.expressionSql} ${item.direction.toUpperCase()}`).join(", ")}`;
    case "limit":
      return `${renderSql(node.input)} LIMIT ${node.count}${node.offset === null ? "" : ` OFFSET ${node.offset}`}`;
  }
}
