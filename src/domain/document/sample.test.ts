import { describe, expect, test } from "bun:test";
import { createSampleDocument } from "./sample";

describe("createSampleDocument", () => {
  test("creates a graph with an output path", () => {
    const document = createSampleDocument();

    expect(document.nodes.some(node => node.kind === "fromTable")).toBe(true);
    expect(document.nodes.some(node => node.kind === "select")).toBe(true);
    expect(document.nodes.some(node => node.kind === "output")).toBe(true);
    expect(document.nodes.some(node => node.id === "from-orders")).toBe(true);
    expect(document.nodes.some(node => node.id === "select-orders")).toBe(true);
    expect(document.nodes.some(node => node.id === "output-orders")).toBe(true);
    expect(document.edges).toHaveLength(2);
    expect(
      document.edges.some(
        edge =>
          edge.source === "from-orders" &&
          edge.sourceHandle === "out" &&
          edge.target === "select-orders" &&
          edge.targetHandle === "in",
      ),
    ).toBe(true);
    expect(
      document.edges.some(
        edge =>
          edge.source === "select-orders" &&
          edge.sourceHandle === "out" &&
          edge.target === "output-orders" &&
          edge.targetHandle === "in",
      ),
    ).toBe(true);
  });
});
