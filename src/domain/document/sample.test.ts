import { describe, expect, test } from "bun:test";
import { createSampleDocument } from "./sample";

describe("createSampleDocument", () => {
  test("creates a graph with an output path", () => {
    const document = createSampleDocument();

    expect(document.nodes.some(node => node.kind === "fromTable")).toBe(true);
    expect(document.nodes.some(node => node.kind === "select")).toBe(true);
    expect(document.nodes.some(node => node.kind === "output")).toBe(true);
    expect(document.edges).toHaveLength(2);
  });
});
