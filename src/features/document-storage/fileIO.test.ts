import { describe, expect, test } from "bun:test";
import { createSampleDocument } from "../../domain/document/sample";
import type { LegacyGraphDocument } from "../../domain/document/types";
import {
  parseDocumentJson,
  parsePackageJson,
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

  test("parses and serializes subgraph nodes and dynamic handles in legacy documents", () => {
    const parsed = parseDocumentJson(
      JSON.stringify({
        version: 1,
        metadata: { name: "subgraph-legacy" },
        viewport: { x: 0, y: 0, zoom: 1 },
        nodes: [
          {
            id: "subgraph-1",
            kind: "subgraph",
            label: "Orders Package",
            position: { x: 100, y: 80 },
            data: { graphId: "graph-child" },
          },
          {
            id: "output-1",
            kind: "output",
            label: "Output",
            position: { x: 260, y: 80 },
            data: { outputName: "orders_report" },
          },
        ],
        edges: [
          {
            id: "edge-subgraph-output",
            source: "subgraph-1",
            sourceHandle: "orders_report",
            target: "output-1",
            targetHandle: "in",
          },
        ],
      }),
    );

    expect(parsed.nodes.find((node) => node.id === "subgraph-1")?.kind).toBe(
      "subgraph",
    );
    expect(parsed.edges[0]?.sourceHandle).toBe("orders_report");
    expect(serializeDocumentJson(parsed)).toContain('"sourceHandle": "orders_report"');
  });

  test("rejects subgraph nodes with a malformed target even when graphId is present", () => {
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
                  id: "subgraph-1",
                  kind: "subgraph",
                  label: "Orders",
                  position: { x: 0, y: 0 },
                  data: { graphId: "graph-child", target: { kind: "local" } },
                },
              ],
              edges: [],
            },
            {
              id: "graph-child",
              metadata: { name: "Child" },
              viewport: { x: 0, y: 0, zoom: 1 },
              nodes: [],
              edges: [],
            },
          ],
          installedPackages: [],
          packageManifest: null,
        }),
      ),
    ).toThrow("Invalid QueryVisual workspace");
  });

  test("rejects subgraph nodes where local target graphId mismatches graphId", () => {
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
                  id: "subgraph-1",
                  kind: "subgraph",
                  label: "Orders",
                  position: { x: 0, y: 0 },
                  data: {
                    graphId: "graph-child-a",
                    target: { kind: "local", graphId: "graph-child-b" },
                  },
                },
              ],
              edges: [],
            },
            {
              id: "graph-child-a",
              metadata: { name: "Child A" },
              viewport: { x: 0, y: 0, zoom: 1 },
              nodes: [],
              edges: [],
            },
            {
              id: "graph-child-b",
              metadata: { name: "Child B" },
              viewport: { x: 0, y: 0, zoom: 1 },
              nodes: [],
              edges: [],
            },
          ],
          installedPackages: [],
          packageManifest: null,
        }),
      ),
    ).toThrow("Invalid QueryVisual workspace");
  });

  test("rejects legacy documents that include a package-target subgraph node", () => {
    expect(() =>
      parseDocumentJson(
        JSON.stringify({
          version: 1,
          metadata: { name: "bad" },
          viewport: { x: 0, y: 0, zoom: 1 },
          nodes: [
            {
              id: "subgraph-1",
              kind: "subgraph",
              label: "Orders",
              position: { x: 0, y: 0 },
              data: {
                target: {
                  kind: "package",
                  packageId: "com.acme/orders",
                  version: "1.0.0",
                  exportKey: "orders_report",
                },
              },
            },
          ],
          edges: [],
        }),
      ),
    ).toThrow("Invalid QueryVisual document");
  });

  test("rejects legacy documents with graphId + valid package target subgraph payloads", () => {
    expect(() =>
      parseDocumentJson(
        JSON.stringify({
          version: 1,
          metadata: { name: "bad" },
          viewport: { x: 0, y: 0, zoom: 1 },
          nodes: [
            {
              id: "subgraph-1",
              kind: "subgraph",
              label: "Orders",
              position: { x: 0, y: 0 },
              data: {
                graphId: "graph-child",
                target: {
                  kind: "package",
                  packageId: "com.acme/orders",
                  version: "1.0.0",
                  exportKey: "orders_report",
                },
              },
            },
          ],
          edges: [],
        }),
      ),
    ).toThrow("Invalid QueryVisual document");
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

  test("parses and serializes subgraph nodes and dynamic handles in workspaces", () => {
    const workspace = parseWorkspaceJson(
      JSON.stringify({
        version: 2,
        metadata: { name: "workspace" },
        entryGraphId: "graph-parent",
        graphs: [
          {
            id: "graph-parent",
            metadata: { name: "Parent" },
            viewport: { x: 0, y: 0, zoom: 1 },
            nodes: [
              {
                id: "subgraph-1",
                kind: "subgraph",
                label: "Orders Package",
                position: { x: 100, y: 80 },
                data: { graphId: "graph-child" },
              },
            ],
            edges: [
              {
                id: "edge-parent-subgraph",
                source: "subgraph-1",
                sourceHandle: "orders_report",
                target: "subgraph-1",
                targetHandle: "orders_in",
              },
            ],
          },
          {
            id: "graph-child",
            metadata: { name: "Child" },
            viewport: { x: 0, y: 0, zoom: 1 },
            nodes: [],
            edges: [],
          },
        ],
      }),
    );

    const parentGraph = workspace.graphs.find((graph) => graph.id === "graph-parent");
    expect(parentGraph?.nodes[0]?.kind).toBe("subgraph");
    expect(parentGraph?.edges[0]?.targetHandle).toBe("orders_in");
    expect(serializeWorkspaceJson(workspace)).toContain('"targetHandle": "orders_in"');
  });

  test("rejects workspaces that include a package-target subgraph node", () => {
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
                  id: "subgraph-1",
                  kind: "subgraph",
                  label: "Orders",
                  position: { x: 0, y: 0 },
                  data: {
                    target: {
                      kind: "package",
                      packageId: "com.acme/orders",
                      version: "1.0.0",
                      exportKey: "orders_report",
                    },
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

  test("rejects workspaces with graphId + valid package target subgraph payloads", () => {
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
                  id: "subgraph-1",
                  kind: "subgraph",
                  label: "Orders",
                  position: { x: 0, y: 0 },
                  data: {
                    graphId: "graph-child",
                    target: {
                      kind: "package",
                      packageId: "com.acme/orders",
                      version: "1.0.0",
                      exportKey: "orders_report",
                    },
                  },
                },
              ],
              edges: [],
            },
            {
              id: "graph-child",
              metadata: { name: "Child" },
              viewport: { x: 0, y: 0, zoom: 1 },
              nodes: [],
              edges: [],
            },
          ],
          installedPackages: [],
          packageManifest: null,
        }),
      ),
    ).toThrow("Invalid QueryVisual workspace");
  });

  test("migrates legacy workspace subgraph payload { graphId } into { target: { kind: \"local\", graphId } }", () => {
    const workspace = parseWorkspaceJson(
      JSON.stringify({
        version: 2,
        metadata: { name: "workspace" },
        entryGraphId: "graph-parent",
        graphs: [
          {
            id: "graph-parent",
            metadata: { name: "Parent" },
            viewport: { x: 0, y: 0, zoom: 1 },
            nodes: [
              {
                id: "subgraph-1",
                kind: "subgraph",
                label: "Orders",
                position: { x: 0, y: 0 },
                data: { graphId: "graph-child" },
              },
            ],
            edges: [],
          },
          {
            id: "graph-child",
            metadata: { name: "Child" },
            viewport: { x: 0, y: 0, zoom: 1 },
            nodes: [],
            edges: [],
          },
        ],
      }),
    );

    const parent = workspace.graphs.find((graph) => graph.id === "graph-parent");
    const subgraphNode = parent?.nodes.find((node) => node.id === "subgraph-1");
    expect(subgraphNode).toMatchObject({
      kind: "subgraph",
      data: { target: { kind: "local", graphId: "graph-child" } },
    });
  });

  test("round-trips installedPackages and packageManifest on workspaces", () => {
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
        installedPackages: [
          {
            packageId: "com.acme/orders",
            version: "1.0.0",
            metadata: { name: "Orders" },
            exports: [],
            graphs: [],
            dependencyRefs: [],
          },
        ],
        packageManifest: {
          packageId: "com.acme/workspace",
          version: "0.0.1",
          name: "Workspace Package",
          exports: [],
        },
      }),
    );

    const serialized = serializeWorkspaceJson(workspace);
    expect(serialized).toContain('"installedPackages"');
    expect(serialized).toContain('"packageManifest"');

    const reparsed = parseWorkspaceJson(serialized);
    expect(reparsed.installedPackages).toHaveLength(1);
    expect(reparsed.packageManifest?.packageId).toBe("com.acme/workspace");
  });

  test("parsePackageJson parses package files separately from workspace JSON", () => {
    const pkg = parsePackageJson(
      JSON.stringify({
        formatVersion: 1,
        packageId: "com.acme/orders",
        version: "1.0.0",
        metadata: { name: "Orders", description: "Reusable graphs" },
        exports: [
          { exportKey: "orders_report", graphId: "graph-orders", displayName: "Orders Report" },
        ],
        graphs: [
          {
            id: "graph-orders",
            metadata: { name: "Orders Graph" },
            viewport: { x: 0, y: 0, zoom: 1 },
            nodes: [],
            edges: [],
          },
        ],
        dependencies: [],
      }),
    );

    expect(pkg.packageId).toBe("com.acme/orders");
    expect(pkg.exports).toHaveLength(1);

    expect(() =>
      parseWorkspaceJson(
        JSON.stringify({
          formatVersion: 1,
          packageId: "com.acme/orders",
          version: "1.0.0",
          metadata: { name: "Orders" },
          exports: [],
          graphs: [],
          dependencies: [],
        }),
      ),
    ).toThrow("Invalid QueryVisual workspace");
  });

  test("parsePackageJson rejects exports that point to missing graphs", () => {
    expect(() =>
      parsePackageJson(
        JSON.stringify({
          formatVersion: 1,
          packageId: "com.acme/orders",
          version: "1.0.0",
          metadata: { name: "Orders" },
          exports: [
            { exportKey: "orders_report", graphId: "graph-missing", displayName: "Orders Report" },
          ],
          graphs: [
            {
              id: "graph-present",
              metadata: { name: "Present" },
              viewport: { x: 0, y: 0, zoom: 1 },
              nodes: [],
              edges: [],
            },
          ],
          dependencies: [],
        }),
      ),
    ).toThrow("Invalid QueryVisual package");
  });

  test("parsePackageJson rejects package graphs that include package-target subgraph nodes", () => {
    expect(() =>
      parsePackageJson(
        JSON.stringify({
          formatVersion: 1,
          packageId: "com.acme/orders",
          version: "1.0.0",
          metadata: { name: "Orders" },
          exports: [
            { exportKey: "orders_report", graphId: "graph-main", displayName: "Orders Report" },
          ],
          graphs: [
            {
              id: "graph-main",
              metadata: { name: "Main" },
              viewport: { x: 0, y: 0, zoom: 1 },
              nodes: [
                {
                  id: "subgraph-1",
                  kind: "subgraph",
                  label: "Pkg Target",
                  position: { x: 0, y: 0 },
                  data: {
                    graphId: "graph-child",
                    target: {
                      kind: "package",
                      packageId: "com.acme/other",
                      version: "1.0.0",
                      exportKey: "x",
                    },
                  },
                },
              ],
              edges: [],
            },
          ],
          dependencies: [],
        }),
      ),
    ).toThrow("Invalid QueryVisual package");
  });

  test("parsePackageJson rejects excessively deep dependency chains", () => {
    let pkg: any = {
      formatVersion: 1,
      packageId: "com.acme/root",
      version: "1.0.0",
      metadata: { name: "Root" },
      exports: [],
      graphs: [],
      dependencies: [],
    };

    // Construct a deep chain (well beyond any reasonable max).
    let cursor = pkg;
    for (let i = 0; i < 200; i++) {
      const next = {
        formatVersion: 1,
        packageId: `com.acme/dep-${i}`,
        version: "1.0.0",
        metadata: { name: `Dep ${i}` },
        exports: [],
        graphs: [],
        dependencies: [],
      };
      cursor.dependencies = [next];
      cursor = next;
    }

    expect(() => parsePackageJson(JSON.stringify(pkg))).toThrow("Invalid QueryVisual package");
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

  test("migrates legacy graphInput nodes without inputName in documents", () => {
    const parsed = parseDocumentJson(
      JSON.stringify({
        version: 1,
        metadata: { name: "legacy-graph-input" },
        viewport: { x: 0, y: 0, zoom: 1 },
        nodes: [
          {
            id: "graph-input-1",
            kind: "graphInput",
            label: "Input Orders",
            position: { x: 0, y: 0 },
            data: {
              columns: { order_id: "int" },
            },
          },
        ],
        edges: [],
      }),
    );

    const inputNode = parsed.nodes.find((node) => node.id === "graph-input-1");
    expect(inputNode?.kind).toBe("graphInput");
    if (inputNode?.kind !== "graphInput") {
      throw new Error("Expected graph input node");
    }

    expect(inputNode.data).toEqual({
      inputName: "Input Orders",
      columns: { order_id: "int" },
    });
  });

  test("migrates legacy graphInput nodes without inputName in workspaces", () => {
    const parsed = parseWorkspaceJson(
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
                label: "Input Orders",
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
    );

    const inputNode = parsed.graphs[0]?.nodes.find(
      (node) => node.id === "graph-input-1",
    );
    expect(inputNode?.kind).toBe("graphInput");
    if (inputNode?.kind !== "graphInput") {
      throw new Error("Expected graph input node");
    }

    expect(inputNode.data).toEqual({
      inputName: "Input Orders",
      columns: { order_id: "int" },
    });
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
              sourceHandle: 123,
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
