import { describe, expect, test } from "bun:test";
import { createSampleDocument } from "../../domain/document/sample";
import type { LegacyGraphDocument } from "../../domain/document/types";
import {
  parseDocumentJson,
  parseWorkspaceJson,
  serializeDocumentJson,
  serializeWorkspaceJson,
} from "./fileIO";

function createLegacySampleDocument(): LegacyGraphDocument {
  const sample = createSampleDocument();

  return {
    version: 1,
    metadata: sample.metadata,
    viewport: sample.viewport,
    nodes: sample.nodes,
    edges: sample.edges,
  };
}

describe("fileIO", () => {
  test("round-trips graph documents as JSON", () => {
    const source = createLegacySampleDocument();
    const parsed = parseDocumentJson(serializeDocumentJson(source));

    expect(parsed.metadata.name).toBe(source.metadata.name);
    expect(parsed.nodes).toHaveLength(source.nodes.length);
  });

  test("wraps legacy single-graph JSON into a one-graph workspace", () => {
    const workspace = parseWorkspaceJson(
      JSON.stringify({
        version: 1,
        metadata: { name: "legacy" },
        viewport: { x: 0, y: 0, zoom: 1 },
        nodes: [],
        edges: [],
      }),
    );

    expect(workspace).toMatchObject({
      version: 2,
      metadata: { name: "legacy" },
      entryGraphId: expect.any(String),
      graphs: [
        {
          metadata: { name: "legacy" },
          viewport: { x: 0, y: 0, zoom: 1 },
          nodes: [],
          edges: [],
        },
      ],
    });
  });

  test("round-trips an explicit workspace JSON payload", () => {
    const workspace = parseWorkspaceJson(
      JSON.stringify({
        version: 2,
        metadata: { name: "workspace" },
        entryGraphId: "graph-main",
        graphs: [
          {
            id: "graph-main",
            metadata: { name: "Main" },
            viewport: { x: 0, y: 0, zoom: 1 },
            nodes: [],
            edges: [],
          },
        ],
      }),
    );

    expect(serializeWorkspaceJson(workspace)).toContain(
      '"entryGraphId": "graph-main"',
    );
  });

  test("rejects workspaces with duplicate graph ids", () => {
    expect(() =>
      parseWorkspaceJson(
        JSON.stringify({
          version: 2,
          metadata: { name: "workspace" },
          entryGraphId: "graph-main",
          graphs: [
            {
              id: "graph-main",
              metadata: { name: "Main A" },
              viewport: { x: 0, y: 0, zoom: 1 },
              nodes: [],
              edges: [],
            },
            {
              id: "graph-main",
              metadata: { name: "Main B" },
              viewport: { x: 10, y: 20, zoom: 0.8 },
              nodes: [],
              edges: [],
            },
          ],
        }),
      ),
    ).toThrow("Invalid QueryVisual workspace");
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

  test("rejects malformed kind-specific node payloads", () => {
    expect(() =>
      parseDocumentJson(
        JSON.stringify({
          version: 1,
          metadata: { name: "bad" },
          viewport: { x: 0, y: 0, zoom: 1 },
          nodes: [
            {
              id: "from-1",
              kind: "fromTable",
              label: "Orders",
              position: { x: 0, y: 0 },
              data: {},
            },
          ],
          edges: [],
        }),
      ),
    ).toThrow("Invalid QueryVisual document");
  });

  test("rejects graphInput nodes without inputName in legacy documents", () => {
    expect(() =>
      parseDocumentJson(
        JSON.stringify({
          version: 1,
          metadata: { name: "bad-graph-input" },
          viewport: { x: 0, y: 0, zoom: 1 },
          nodes: [
            {
              id: "graph-input-1",
              kind: "graphInput",
              label: "Input",
              position: { x: 0, y: 0 },
              data: {
                columns: { order_id: "int" },
              },
            },
          ],
          edges: [],
        }),
      ),
    ).toThrow("Invalid QueryVisual document");
  });

  test("rejects graphInput nodes without inputName in workspaces", () => {
    expect(() =>
      parseWorkspaceJson(
        JSON.stringify({
          version: 2,
          metadata: { name: "workspace" },
          entryGraphId: "graph-main",
          graphs: [
            {
              id: "graph-main",
              metadata: { name: "Main" },
              viewport: { x: 0, y: 0, zoom: 1 },
              nodes: [
                {
                  id: "graph-input-1",
                  kind: "graphInput",
                  label: "Input",
                  position: { x: 0, y: 0 },
                  data: {
                    columns: { order_id: "int" },
                  },
                },
              ],
              edges: [],
            },
          ],
        }),
      ),
    ).toThrow("Invalid QueryVisual workspace");
  });

  test("rejects unknown node kinds", () => {
    expect(() =>
      parseDocumentJson(
        JSON.stringify({
          version: 1,
          metadata: { name: "bad" },
          viewport: { x: 0, y: 0, zoom: 1 },
          nodes: [
            {
              id: "node-1",
              kind: "mystery",
              label: "Mystery",
              position: { x: 0, y: 0 },
              data: {},
            },
          ],
          edges: [],
        }),
      ),
    ).toThrow("Invalid QueryVisual document");
  });

  test("rejects malformed expression row payloads", () => {
    expect(() =>
      parseDocumentJson(
        JSON.stringify({
          version: 1,
          metadata: { name: "bad" },
          viewport: { x: 0, y: 0, zoom: 1 },
          nodes: [
            {
              id: "select-1",
              kind: "select",
              label: "Select",
              position: { x: 0, y: 0 },
              data: {
                mappings: [{ name: "gross_total" }],
              },
            },
          ],
          edges: [],
        }),
      ),
    ).toThrow("Invalid QueryVisual document");
  });

  test("rejects invalid edge handle payloads", () => {
    expect(() =>
      parseDocumentJson(
        JSON.stringify({
          version: 1,
          metadata: { name: "bad" },
          viewport: { x: 0, y: 0, zoom: 1 },
          nodes: [],
          edges: [
            {
              id: "edge-1",
              source: "a",
              sourceHandle: "left",
              target: "b",
              targetHandle: "in",
            },
          ],
        }),
      ),
    ).toThrow("Invalid QueryVisual document");
  });

  test("parses legacy output nodes and injects default listeners", () => {
    const parsed = parseDocumentJson(
      JSON.stringify({
        version: 1,
        metadata: { name: "legacy-output" },
        viewport: { x: 0, y: 0, zoom: 1 },
        nodes: [
          {
            id: "output-legacy",
            kind: "output",
            label: "Legacy Output",
            position: { x: 0, y: 0 },
            data: { outputName: "legacy_out" },
          },
        ],
        edges: [],
      }),
    );

    const outputNode = parsed.nodes.find((node) => node.id === "output-legacy");
    expect(outputNode?.kind).toBe("output");
    if (outputNode?.kind !== "output") {
      throw new Error("Expected output node");
    }

    expect(outputNode.data.listeners).toEqual({
      copyToClipboard: false,
      logToConsole: false,
      saveToLocalStorage: {
        enabled: false,
        key: "queryvisual.output.legacy_out",
      },
    });
  });

  test("round-trips explicit output listener configuration", () => {
    const source = parseDocumentJson(
      JSON.stringify({
        version: 1,
        metadata: { name: "explicit-listeners" },
        viewport: { x: 0, y: 0, zoom: 1 },
        nodes: [
          {
            id: "output-custom",
            kind: "output",
            label: "Output",
            position: { x: 0, y: 0 },
            data: {
              outputName: "custom_out",
              listeners: {
                copyToClipboard: true,
                logToConsole: false,
                saveToLocalStorage: {
                  enabled: true,
                  key: "custom.storage.key",
                },
              },
            },
          },
        ],
        edges: [],
      }),
    );

    const parsed = parseDocumentJson(serializeDocumentJson(source));
    const outputNode = parsed.nodes.find((node) => node.id === "output-custom");
    expect(outputNode?.kind).toBe("output");
    if (outputNode?.kind !== "output") {
      throw new Error("Expected output node");
    }

    expect(outputNode.data.listeners).toEqual({
      copyToClipboard: true,
      logToConsole: false,
      saveToLocalStorage: {
        enabled: true,
        key: "custom.storage.key",
      },
    });
  });

  test("rejects malformed explicit output listener payloads", () => {
    expect(() =>
      parseDocumentJson(
        JSON.stringify({
          version: 1,
          metadata: { name: "bad-listeners" },
          viewport: { x: 0, y: 0, zoom: 1 },
          nodes: [
            {
              id: "output-bad",
              kind: "output",
              label: "Output",
              position: { x: 0, y: 0 },
              data: {
                outputName: "out",
                listeners: {
                  copyToClipboard: "yes",
                  logToConsole: false,
                  saveToLocalStorage: {
                    enabled: false,
                    key: "out",
                  },
                },
              },
            },
          ],
          edges: [],
        }),
      ),
    ).toThrow("Invalid QueryVisual document");
  });
});
