import type { IRRelNode } from "./types";

function optimizeNode(node: IRRelNode): IRRelNode {
  switch (node.kind) {
    case "filter": {
      const optimizedInput = optimizeNode(node.input);
      if (optimizedInput.kind === "filter") {
        return {
          kind: "filter",
          predicateSql: `(${optimizedInput.predicateSql}) AND (${node.predicateSql})`,
          input: optimizedInput.input,
        };
      }
      return { ...node, input: optimizedInput };
    }
    case "join":
      return {
        ...node,
        left: optimizeNode(node.left),
        right: optimizeNode(node.right),
      };
    case "project":
      return { ...node, input: optimizeNode(node.input) };
    case "aggregate":
      return { ...node, input: optimizeNode(node.input) };
    case "sort":
      return { ...node, input: optimizeNode(node.input) };
    case "limit":
      return { ...node, input: optimizeNode(node.input) };
    default:
      return node;
  }
}

export function optimizeOutput(node: IRRelNode) {
  return optimizeNode(node);
}
