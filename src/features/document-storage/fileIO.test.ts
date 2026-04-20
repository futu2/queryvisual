import { describe, expect, test } from "bun:test";
import { createSampleDocument } from "../../domain/document/sample";
import { parseDocumentJson, serializeDocumentJson } from "./fileIO";

describe("fileIO", () => {
  test("round-trips graph documents as JSON", () => {
    const source = createSampleDocument();
    const parsed = parseDocumentJson(serializeDocumentJson(source));

    expect(parsed.metadata.name).toBe(source.metadata.name);
    expect(parsed.nodes).toHaveLength(source.nodes.length);
  });

  test("rejects invalid top-level document shapes", () => {
    expect(() =>
      parseDocumentJson(
        JSON.stringify({
          version: 1,
          metadata: { name: "bad" },
          nodes: [],
          edges: [],
        }),
      ),
    ).toThrow("Invalid QueryVisual document");
  });

  test("rejects malformed node entries", () => {
    expect(() =>
      parseDocumentJson(
        JSON.stringify({
          version: 1,
          metadata: { name: "bad" },
          viewport: { x: 0, y: 0, zoom: 1 },
          nodes: [
            {
              id: 123,
              kind: "output",
              label: "Output",
              position: { x: 0, y: 0 },
              data: { outputName: "out" },
            },
          ],
          edges: [],
        }),
      ),
    ).toThrow("Invalid QueryVisual document");
  });
});
