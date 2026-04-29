import { describe, expect, test } from "bun:test";
import type { GraphDocument } from "../document/types";
import { buildHelperRegistry } from "./registry";

function documentWithHelpers(): GraphDocument {
  return {
    version: 1,
    metadata: { name: "helpers" },
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [
      {
        id: "helpers",
        kind: "helperFunctions",
        label: "Helpers",
        position: { x: 0, y: 0 },
        data: {
          helpers: [{ name: "add10", expression: "$1 + $2 + 10" }],
        },
      },
      {
        id: "import",
        kind: "importHelperFunctions",
        label: "Import Helpers",
        position: { x: 200, y: 0 },
        data: { moduleName: "math" },
      },
    ],
    edges: [
      {
        id: "edge-import",
        source: "helpers",
        sourceHandle: "out",
        target: "import",
        targetHandle: "in",
      },
    ],
  };
}

describe("buildHelperRegistry", () => {
  test("automatically registers helper function nodes in their own graph", () => {
    const document = documentWithHelpers();
    document.nodes = document.nodes.filter((node) => node.kind !== "importHelperFunctions");
    document.edges = [];
    const helperNode = document.nodes.find((node) => node.id === "helpers");
    if (helperNode?.kind !== "helperFunctions") throw new Error("bad fixture");
    helperNode.data = {
      moduleName: "math",
      helpers: [{ name: "add10", expression: "$1 + 10" }],
    } as never;

    const registry = buildHelperRegistry(document);

    expect(registry.diagnostics).toEqual([]);
    expect(registry.resolveCall("math.add10")?.status).toBe("resolved");
    expect(registry.resolveCall("add10")?.status).toBe("resolved");
  });

  test("imports helpers from another local graph with an optional module alias", () => {
    const libraryGraph = documentWithHelpers();
    libraryGraph.id = "graph-library";
    libraryGraph.nodes = libraryGraph.nodes.filter((node) => node.kind !== "importHelperFunctions");
    libraryGraph.edges = [];
    const helperNode = libraryGraph.nodes.find((node) => node.id === "helpers");
    if (helperNode?.kind !== "helperFunctions") throw new Error("bad fixture");
    helperNode.data = {
      moduleName: "",
      helpers: [{ name: "add10", expression: "$1 + 10" }],
    } as never;

    const consumerGraph: GraphDocument = {
      version: 1,
      metadata: { name: "consumer" },
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        {
          id: "import-graph",
          kind: "importGraphHelpers",
          label: "Import Graph Helpers",
          position: { x: 0, y: 0 },
          data: { graphId: "graph-library", moduleName: "lib" },
        } as never,
      ],
      edges: [],
    };

    const registry = buildHelperRegistry(consumerGraph, {
      workspace: {
        version: 2,
        metadata: { name: "workspace" },
        entryGraphId: "graph-consumer",
        graphs: [
          { ...consumerGraph, id: "graph-consumer" },
          { ...libraryGraph, id: "graph-library" },
        ],
        installedPackages: [],
        packageManifest: null,
      },
      graphId: "graph-consumer",
    });

    expect(registry.diagnostics).toEqual([]);
    expect(registry.resolveCall("lib.add10")?.status).toBe("resolved");
    expect(registry.resolveCall("add10")?.status).toBe("resolved");
  });

  test("imports helpers from an installed package graph export", () => {
    const consumerGraph: GraphDocument = {
      version: 1,
      metadata: { name: "consumer" },
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        {
          id: "import-package-helpers",
          kind: "importGraphHelpers",
          label: "Import Package Helpers",
          position: { x: 0, y: 0 },
          data: {
            graphId: "pkg-helper-graph",
            target: {
              kind: "package",
              packageId: "team/helper-lib",
              version: "1.0.0",
              exportKey: "helpers",
            },
            moduleName: "pkg",
          },
        } as never,
      ],
      edges: [],
    };

    const packageGraph = {
      id: "pkg-helper-graph",
      metadata: { name: "Package Helpers" },
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        {
          id: "helpers",
          kind: "helperFunctions" as const,
          label: "Helpers",
          position: { x: 0, y: 0 },
          data: {
            moduleName: "math",
            helpers: [{ name: "add10", expression: "$1 + 10" }],
          },
        },
      ],
      edges: [],
    };

    const registry = buildHelperRegistry(consumerGraph, {
      workspace: {
        version: 2,
        metadata: { name: "workspace" },
        entryGraphId: "graph-consumer",
        graphs: [{ ...consumerGraph, id: "graph-consumer" }],
        installedPackages: [
          {
            packageId: "team/helper-lib",
            version: "1.0.0",
            metadata: { name: "Helper Lib" },
            exports: [
              {
                exportKey: "helpers",
                graphId: "pkg-helper-graph",
                displayName: "Helpers",
              },
            ],
            graphs: [packageGraph],
            dependencyRefs: [],
          },
        ],
        packageManifest: null,
      },
      graphId: "graph-consumer",
    });

    expect(registry.diagnostics).toEqual([]);
    expect(registry.resolveCall("pkg.add10")?.status).toBe("resolved");
    expect(registry.resolveCall("add10")?.status).toBe("resolved");
  });

  test("reports missing local helper import graphs", () => {
    const document: GraphDocument = {
      version: 1,
      metadata: { name: "consumer" },
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        {
          id: "import-graph",
          kind: "importGraphHelpers",
          label: "Import Graph Helpers",
          position: { x: 0, y: 0 },
          data: { graphId: "missing", moduleName: "" },
        } as never,
      ],
      edges: [],
    };

    const registry = buildHelperRegistry(document, {
      workspace: {
        version: 2,
        metadata: { name: "workspace" },
        entryGraphId: "graph-consumer",
        graphs: [{ ...document, id: "graph-consumer" }],
        installedPackages: [],
        packageManifest: null,
      },
      graphId: "graph-consumer",
    });

    expect(registry.diagnostics.some((diagnostic) => diagnostic.code === "helpers.graph-import-missing-graph")).toBe(true);
  });

  test("reports local helper import cycles", () => {
    const graphA = {
      id: "graph-a",
      metadata: { name: "A" },
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        {
          id: "import-b",
          kind: "importGraphHelpers" as const,
          label: "Import B",
          position: { x: 0, y: 0 },
          data: { graphId: "graph-b", moduleName: "" },
        },
      ],
      edges: [],
    };
    const graphB = {
      id: "graph-b",
      metadata: { name: "B" },
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        {
          id: "import-a",
          kind: "importGraphHelpers" as const,
          label: "Import A",
          position: { x: 0, y: 0 },
          data: { graphId: "graph-a", moduleName: "" },
        },
      ],
      edges: [],
    };

    const registry = buildHelperRegistry(graphA, {
      workspace: {
        version: 2,
        metadata: { name: "workspace" },
        entryGraphId: "graph-a",
        graphs: [graphA, graphB],
        installedPackages: [],
        packageManifest: null,
      },
      graphId: "graph-a",
    });

    expect(registry.diagnostics.some((diagnostic) => diagnostic.code === "helpers.graph-import-cycle")).toBe(true);
  });

  test("imports helpers with module and inferred arity", () => {
    const registry = buildHelperRegistry(documentWithHelpers());

    expect(registry.diagnostics).toEqual([]);
    expect(registry.helpers).toHaveLength(1);
    expect(registry.helpers[0]).toMatchObject({
      name: "add10",
      moduleName: "math",
      arity: 2,
      definingNodeId: "helpers",
    });
  });

  test("resolves qualified and unique unqualified helper calls", () => {
    const registry = buildHelperRegistry(documentWithHelpers());

    expect(registry.resolveCall("math.add10")?.status).toBe("resolved");
    expect(registry.resolveCall("add10")?.status).toBe("resolved");
  });

  test("resolves helper and module names case-insensitively", () => {
    const document = documentWithHelpers();
    const helperNode = document.nodes.find((node) => node.id === "helpers");
    const importer = document.nodes.find((node) => node.id === "import");
    if (helperNode?.kind !== "helperFunctions") throw new Error("bad fixture");
    if (importer?.kind !== "importHelperFunctions") throw new Error("bad fixture");
    helperNode.data.helpers = [{ name: "Add10", expression: "$1 + 10" }];
    importer.data.moduleName = "Math";

    const registry = buildHelperRegistry(document);

    expect(registry.resolveCall("math.add10")?.status).toBe("resolved");
    expect(registry.resolveCall("add10")?.status).toBe("resolved");
  });

  test("imports helpers with empty module name", () => {
    const document = documentWithHelpers();
    const importer = document.nodes.find((node) => node.id === "import");
    if (importer?.kind !== "importHelperFunctions") throw new Error("bad fixture");
    importer.data.moduleName = "";

    const registry = buildHelperRegistry(document);

    expect(registry.diagnostics.some((diagnostic) => diagnostic.code === "helpers.invalid-module")).toBe(false);
    expect(registry.resolveCall("add10")?.status).toBe("resolved");
  });

  test("reports ambiguous unqualified helper calls", () => {
    const document = documentWithHelpers();
    document.nodes.push(
      {
        id: "helpers-2",
        kind: "helperFunctions",
        label: "Helpers 2",
        position: { x: 0, y: 120 },
        data: { helpers: [{ name: "add10", expression: "$1 + 20" }] },
      },
      {
        id: "import-2",
        kind: "importHelperFunctions",
        label: "Import Helpers 2",
        position: { x: 200, y: 120 },
        data: { moduleName: "other" },
      },
    );
    document.edges.push({
      id: "edge-import-2",
      source: "helpers-2",
      sourceHandle: "out",
      target: "import-2",
      targetHandle: "in",
    });

    const registry = buildHelperRegistry(document);

    expect(registry.resolveCall("add10")?.status).toBe("ambiguous");
    expect(registry.resolveCall("math.add10")?.status).toBe("resolved");
    expect(registry.resolveCall("other.add10")?.status).toBe("resolved");
  });

  test("reports duplicate qualified names as ambiguous", () => {
    const document = documentWithHelpers();
    document.nodes.push(
      {
        id: "helpers-2",
        kind: "helperFunctions",
        label: "Helpers 2",
        position: { x: 0, y: 120 },
        data: { helpers: [{ name: "add10", expression: "$1 + 20" }] },
      },
      {
        id: "import-2",
        kind: "importHelperFunctions",
        label: "Import Helpers 2",
        position: { x: 200, y: 120 },
        data: { moduleName: "math" },
      },
    );
    document.edges.push({
      id: "edge-import-2",
      source: "helpers-2",
      sourceHandle: "out",
      target: "import-2",
      targetHandle: "in",
    });

    const registry = buildHelperRegistry(document);

    expect(registry.diagnostics.some((diagnostic) => diagnostic.code === "helpers.duplicate-qualified-name")).toBe(true);
    expect(registry.resolveCall("math.add10")?.status).toBe("ambiguous");
    expect(registry.resolveCall("add10")?.status).toBe("ambiguous");
  });

  test("does not resolve helpers from invalid modules", () => {
    const document = documentWithHelpers();
    const importer = document.nodes.find((node) => node.id === "import");
    if (importer?.kind !== "importHelperFunctions") throw new Error("bad fixture");
    importer.data.moduleName = "bad-module";

    const registry = buildHelperRegistry(document);

    expect(registry.diagnostics.some((diagnostic) => diagnostic.code === "helpers.invalid-module")).toBe(true);
    expect(registry.resolveCall("add10")?.status).toBe("unresolved");
    expect(registry.resolveCall("bad-module.add10")?.status).toBe("unresolved");
  });

  test("trims module names before validation", () => {
    const document = documentWithHelpers();
    const importer = document.nodes.find((node) => node.id === "import");
    if (importer?.kind !== "importHelperFunctions") throw new Error("bad fixture");
    importer.data.moduleName = " math ";

    const registry = buildHelperRegistry(document);

    expect(registry.diagnostics.some((diagnostic) => diagnostic.code === "helpers.invalid-module")).toBe(false);
    expect(registry.resolveCall("add10")?.status).toBe("resolved");
    expect(registry.resolveCall("math.add10")?.status).toBe("resolved");
  });

  test("treats whitespace-only module names as empty", () => {
    const document = documentWithHelpers();
    const importer = document.nodes.find((node) => node.id === "import");
    if (importer?.kind !== "importHelperFunctions") throw new Error("bad fixture");
    importer.data.moduleName = "   ";

    const registry = buildHelperRegistry(document);

    expect(registry.diagnostics.some((diagnostic) => diagnostic.code === "helpers.invalid-module")).toBe(false);
    expect(registry.resolveCall("add10")?.status).toBe("resolved");
  });

  test("does not resolve invalid helper names", () => {
    const document = documentWithHelpers();
    const helperNode = document.nodes.find((node) => node.id === "helpers");
    if (helperNode?.kind !== "helperFunctions") throw new Error("bad fixture");
    helperNode.data.helpers = [{ name: "bad-name", expression: "$1 + 10" }];

    const registry = buildHelperRegistry(document);

    expect(registry.diagnostics.some((diagnostic) => diagnostic.code === "helpers.invalid-name")).toBe(true);
    expect(registry.resolveCall("bad-name")?.status).toBe("unresolved");
    expect(registry.resolveCall("math.bad-name")?.status).toBe("unresolved");
  });

  test("does not trim invalid helper names before validation", () => {
    const document = documentWithHelpers();
    const helperNode = document.nodes.find((node) => node.id === "helpers");
    if (helperNode?.kind !== "helperFunctions") throw new Error("bad fixture");
    helperNode.data.helpers = [{ name: " add10 ", expression: "$1 + 10" }];

    const registry = buildHelperRegistry(document);

    expect(registry.diagnostics.some((diagnostic) => diagnostic.code === "helpers.invalid-name")).toBe(true);
    expect(registry.resolveCall("add10")?.status).toBe("unresolved");
    expect(registry.resolveCall("math.add10")?.status).toBe("unresolved");
  });

  test("does not resolve invalid helper expressions", () => {
    const document = documentWithHelpers();
    const helperNode = document.nodes.find((node) => node.id === "helpers");
    if (helperNode?.kind !== "helperFunctions") throw new Error("bad fixture");
    helperNode.data.helpers = [{ name: "add10", expression: "$1 +" }];

    const registry = buildHelperRegistry(document);

    expect(registry.diagnostics.some((diagnostic) => diagnostic.code === "helpers.invalid-expression")).toBe(true);
    expect(registry.resolveCall("add10")?.status).toBe("unresolved");
    expect(registry.resolveCall("math.add10")?.status).toBe("unresolved");
  });

  test("reports recursive helper dependencies", () => {
    const document = documentWithHelpers();
    const helperNode = document.nodes.find((node) => node.id === "helpers");
    if (helperNode?.kind !== "helperFunctions") throw new Error("bad fixture");
    helperNode.data.helpers = [
      { name: "a", expression: "b($1)" },
      { name: "b", expression: "a($1)" },
    ];

    const registry = buildHelperRegistry(document);

    expect(registry.diagnostics.some((diagnostic) => diagnostic.code === "helpers.recursive")).toBe(true);
  });

  test("reports cross-module recursive helper dependencies through unique unqualified calls", () => {
    const document = documentWithHelpers();
    const helperNode = document.nodes.find((node) => node.id === "helpers");
    if (helperNode?.kind !== "helperFunctions") throw new Error("bad fixture");
    helperNode.data.helpers = [{ name: "a", expression: "b($1)" }];
    document.nodes.push(
      {
        id: "helpers-2",
        kind: "helperFunctions",
        label: "Helpers 2",
        position: { x: 0, y: 120 },
        data: { helpers: [{ name: "b", expression: "math.a($1)" }] },
      },
      {
        id: "import-2",
        kind: "importHelperFunctions",
        label: "Import Helpers 2",
        position: { x: 200, y: 120 },
        data: { moduleName: "other" },
      },
    );
    document.edges.push({
      id: "edge-import-2",
      source: "helpers-2",
      sourceHandle: "out",
      target: "import-2",
      targetHandle: "in",
    });

    const registry = buildHelperRegistry(document);

    expect(registry.resolveCall("b")?.status).toBe("resolved");
    expect(registry.diagnostics.some((diagnostic) => diagnostic.code === "helpers.recursive")).toBe(true);
  });

  test("infers nested helper return types without recursion", () => {
    const document = documentWithHelpers();
    const helperNode = document.nodes.find((node) => node.id === "helpers");
    if (helperNode?.kind !== "helperFunctions") throw new Error("bad fixture");
    helperNode.data.helpers = [
      { name: "base", expression: "$1 + 10" },
      { name: "gross", expression: "base($1) + 5" },
    ];

    const registry = buildHelperRegistry(document);
    const gross = registry.resolveCall("gross");

    expect(registry.diagnostics).toEqual([]);
    expect(gross.status).toBe("resolved");
    if (gross.status !== "resolved") throw new Error("gross did not resolve");
    expect(gross.helper.returnType).toBe("unknown");
  });

  test("infers out-of-order helper dependency return types deterministically", () => {
    const inOrderDocument = documentWithHelpers();
    const inOrderHelperNode = inOrderDocument.nodes.find((node) => node.id === "helpers");
    if (inOrderHelperNode?.kind !== "helperFunctions") throw new Error("bad fixture");
    inOrderHelperNode.data.helpers = [
      { name: "base", expression: "cast($1 as int)" },
      { name: "gross", expression: "base($1)" },
    ];

    const outOfOrderDocument = documentWithHelpers();
    const outOfOrderHelperNode = outOfOrderDocument.nodes.find((node) => node.id === "helpers");
    if (outOfOrderHelperNode?.kind !== "helperFunctions") throw new Error("bad fixture");
    outOfOrderHelperNode.data.helpers = [
      { name: "gross", expression: "base($1)" },
      { name: "base", expression: "cast($1 as int)" },
    ];

    const inOrderRegistry = buildHelperRegistry(inOrderDocument);
    const outOfOrderRegistry = buildHelperRegistry(outOfOrderDocument);
    const inOrderGross = inOrderRegistry.resolveCall("gross");
    const outOfOrderGross = outOfOrderRegistry.resolveCall("gross");

    expect(inOrderRegistry.diagnostics).toEqual([]);
    expect(outOfOrderRegistry.diagnostics).toEqual([]);
    expect(inOrderGross.status).toBe("resolved");
    expect(outOfOrderGross.status).toBe("resolved");
    if (inOrderGross.status !== "resolved") throw new Error("in-order gross did not resolve");
    if (outOfOrderGross.status !== "resolved") throw new Error("out-of-order gross did not resolve");
    expect(inOrderGross.helper.returnType).toBe("int");
    expect(outOfOrderGross.helper.returnType).toBe("int");
  });

  test("keeps recursive helper return types unknown through casts", () => {
    const document = documentWithHelpers();
    const helperNode = document.nodes.find((node) => node.id === "helpers");
    if (helperNode?.kind !== "helperFunctions") throw new Error("bad fixture");
    helperNode.data.helpers = [
      { name: "a", expression: "cast(b() as int)" },
      { name: "b", expression: "a()" },
    ];

    const registry = buildHelperRegistry(document);
    const a = registry.resolveCall("a");
    const b = registry.resolveCall("b");

    expect(registry.diagnostics.some((diagnostic) => diagnostic.code === "helpers.recursive")).toBe(true);
    expect(a.status).toBe("resolved");
    expect(b.status).toBe("resolved");
    if (a.status !== "resolved") throw new Error("a did not resolve");
    if (b.status !== "resolved") throw new Error("b did not resolve");
    expect(a.helper.returnType).toBe("unknown");
    expect(b.helper.returnType).toBe("unknown");
  });

  test("reports wrong arity inside helper bodies", () => {
    const document = documentWithHelpers();
    const helperNode = document.nodes.find((node) => node.id === "helpers");
    if (helperNode?.kind !== "helperFunctions") throw new Error("bad fixture");
    helperNode.data.helpers = [
      { name: "base", expression: "$1 + 10" },
      { name: "gross", expression: "base($1, $2)" },
    ];

    const registry = buildHelperRegistry(document);

    expect(registry.diagnostics.some((diagnostic) => diagnostic.code === "helpers.helper-arity")).toBe(true);
  });

  test("keeps helpers with wrong arity under casts unknown", () => {
    const document = documentWithHelpers();
    const helperNode = document.nodes.find((node) => node.id === "helpers");
    if (helperNode?.kind !== "helperFunctions") throw new Error("bad fixture");
    helperNode.data.helpers = [
      { name: "base", expression: "$1 + 10" },
      { name: "gross", expression: "cast(base($1, $2) as int)" },
    ];

    const registry = buildHelperRegistry(document);
    const gross = registry.resolveCall("gross");

    expect(registry.diagnostics.some((diagnostic) => diagnostic.code === "helpers.helper-arity")).toBe(true);
    expect(gross.status).toBe("resolved");
    if (gross.status !== "resolved") throw new Error("gross did not resolve");
    expect(gross.helper.returnType).toBe("unknown");
  });

  test("reports ambiguous helper calls inside helper bodies", () => {
    const document = documentWithHelpers();
    const helperNode = document.nodes.find((node) => node.id === "helpers");
    if (helperNode?.kind !== "helperFunctions") throw new Error("bad fixture");
    helperNode.data.helpers = [{ name: "shared", expression: "$1 + 10" }];
    document.nodes.push(
      {
        id: "helpers-2",
        kind: "helperFunctions",
        label: "Helpers 2",
        position: { x: 0, y: 120 },
        data: { helpers: [{ name: "shared", expression: "$1 + 20" }] },
      },
      {
        id: "import-2",
        kind: "importHelperFunctions",
        label: "Import Helpers 2",
        position: { x: 200, y: 120 },
        data: { moduleName: "other" },
      },
      {
        id: "helpers-3",
        kind: "helperFunctions",
        label: "Helpers 3",
        position: { x: 0, y: 240 },
        data: { helpers: [{ name: "gross", expression: "shared($1) + 5" }] },
      },
      {
        id: "import-3",
        kind: "importHelperFunctions",
        label: "Import Helpers 3",
        position: { x: 200, y: 240 },
        data: { moduleName: "third" },
      },
    );
    document.edges.push(
      {
        id: "edge-import-2",
        source: "helpers-2",
        sourceHandle: "out",
        target: "import-2",
        targetHandle: "in",
      },
      {
        id: "edge-import-3",
        source: "helpers-3",
        sourceHandle: "out",
        target: "import-3",
        targetHandle: "in",
      },
    );

    const registry = buildHelperRegistry(document);

    expect(registry.diagnostics.some((diagnostic) => diagnostic.code === "helpers.ambiguous-helper")).toBe(true);
  });

  test("keeps helpers with ambiguous calls under casts unknown", () => {
    const document = documentWithHelpers();
    const helperNode = document.nodes.find((node) => node.id === "helpers");
    if (helperNode?.kind !== "helperFunctions") throw new Error("bad fixture");
    helperNode.data.helpers = [{ name: "shared", expression: "$1 + 10" }];
    document.nodes.push(
      {
        id: "helpers-2",
        kind: "helperFunctions",
        label: "Helpers 2",
        position: { x: 0, y: 120 },
        data: { helpers: [{ name: "shared", expression: "$1 + 20" }] },
      },
      {
        id: "import-2",
        kind: "importHelperFunctions",
        label: "Import Helpers 2",
        position: { x: 200, y: 120 },
        data: { moduleName: "other" },
      },
      {
        id: "helpers-3",
        kind: "helperFunctions",
        label: "Helpers 3",
        position: { x: 0, y: 240 },
        data: { helpers: [{ name: "gross", expression: "cast(shared($1) as int)" }] },
      },
      {
        id: "import-3",
        kind: "importHelperFunctions",
        label: "Import Helpers 3",
        position: { x: 200, y: 240 },
        data: { moduleName: "third" },
      },
    );
    document.edges.push(
      {
        id: "edge-import-2",
        source: "helpers-2",
        sourceHandle: "out",
        target: "import-2",
        targetHandle: "in",
      },
      {
        id: "edge-import-3",
        source: "helpers-3",
        sourceHandle: "out",
        target: "import-3",
        targetHandle: "in",
      },
    );

    const registry = buildHelperRegistry(document);
    const gross = registry.resolveCall("third.gross");

    expect(registry.diagnostics.some((diagnostic) => diagnostic.code === "helpers.ambiguous-helper")).toBe(true);
    expect(gross.status).toBe("resolved");
    if (gross.status !== "resolved") throw new Error("gross did not resolve");
    expect(gross.helper.returnType).toBe("unknown");
  });
});
