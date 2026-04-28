import { describe, expect, test } from "bun:test";
import { buildPackageFileFromWorkspace } from "./export";
import type { GraphWorkspace } from "../document/types";

describe("buildPackageFileFromWorkspace", () => {
  test("exports only explicit public graphs plus reachable internal helpers", () => {
    const workspace: GraphWorkspace = {
      version: 2,
      metadata: { name: "Workspace" },
      entryGraphId: "graph-public",
      graphs: [
        {
          id: "graph-public",
          metadata: { name: "Public" },
          viewport: { x: 0, y: 0, zoom: 1 },
          nodes: [
            {
              id: "subgraph-helper",
              kind: "subgraph",
              label: "Helper",
              position: { x: 0, y: 0 },
              data: {
                graphId: "graph-helper",
                target: { kind: "local", graphId: "graph-helper" },
              },
            },
          ],
          edges: [],
        },
        {
          id: "graph-helper",
          metadata: { name: "Helper" },
          viewport: { x: 0, y: 0, zoom: 1 },
          nodes: [],
          edges: [],
        },
        {
          id: "graph-private-unused",
          metadata: { name: "Unused" },
          viewport: { x: 0, y: 0, zoom: 1 },
          nodes: [],
          edges: [],
        },
      ],
      installedPackages: [
        {
          packageId: "team/base-lib",
          version: "1.0.0",
          metadata: { name: "Base Lib" },
          exports: [
            {
              exportKey: "base_orders",
              graphId: "dep-graph",
              displayName: "Base Orders",
            },
          ],
          graphs: [
            {
              id: "dep-graph",
              metadata: { name: "Base Orders" },
              viewport: { x: 0, y: 0, zoom: 1 },
              nodes: [],
              edges: [],
            },
          ],
          dependencyRefs: [],
        },
      ],
      packageManifest: {
        packageId: "team/app-lib",
        version: "0.1.0",
        name: "App Lib",
        description: "Reusable app queries",
        exports: [
          {
            exportKey: "public_graph",
            graphId: "graph-public",
            displayName: "Public",
          },
        ],
      },
    };

    const pkg = buildPackageFileFromWorkspace(workspace);

    expect(pkg.packageId).toBe("team/app-lib");
    expect(pkg.metadata).toEqual({
      name: "App Lib",
      description: "Reusable app queries",
    });
    expect(pkg.graphs.map((graph) => graph.id).sort()).toEqual([
      "graph-helper",
      "graph-public",
    ]);
    expect(pkg.graphs.some((graph) => graph.id === "graph-private-unused")).toBe(
      false,
    );
    expect(pkg.dependencies).toEqual([
      {
        formatVersion: 1,
        packageId: "team/base-lib",
        version: "1.0.0",
        metadata: { name: "Base Lib" },
        exports: [
          {
            exportKey: "base_orders",
            graphId: "dep-graph",
            displayName: "Base Orders",
          },
        ],
        graphs: [
          {
            id: "dep-graph",
            metadata: { name: "Base Orders" },
            viewport: { x: 0, y: 0, zoom: 1 },
            nodes: [],
            edges: [],
          },
        ],
        dependencies: [],
      },
    ]);
  });

  test("throws when package manifest is missing", () => {
    const workspace: GraphWorkspace = {
      version: 2,
      metadata: { name: "Workspace" },
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
      installedPackages: [],
      packageManifest: null,
    };

    expect(() => buildPackageFileFromWorkspace(workspace)).toThrow(
      "Workspace package manifest is missing",
    );
  });
});
