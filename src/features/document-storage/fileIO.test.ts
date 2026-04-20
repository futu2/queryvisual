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
});
