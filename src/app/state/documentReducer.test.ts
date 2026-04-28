import { describe, expect, test } from "bun:test";
import { createSampleDocument } from "../../domain/document/sample";
import { createDefaultOutputListenerConfig } from "../../domain/document/outputListeners";
import type { GraphDocument } from "../../domain/document/types";
import { createSampleWorkspace } from "../../domain/workspace/sample";
import type { GraphPackageFile, WorkspacePackageManifest } from "../../domain/package/types";
import {
  createInitialEditorState,
  documentReducer,
  getActiveGraph,
} from "./documentReducer";

describe("documentReducer", () => {
  test("creates initial editor state from a sample workspace", () => {
    const state = createInitialEditorState(createSampleWorkspace());

    expect(state.activeGraphId).toBe(state.workspace.entryGraphId);
    expect(getActiveGraph(state)?.id).toBe(state.workspace.entryGraphId);
  });

  test("tracks open editor state", () => {
    const initial = createInitialEditorState(createSampleDocument());
    const next = documentReducer(initial, {
      type: "open-node-editor",
      nodeId: "select-orders",
    });

    expect(next.editorNodeId).toBe("select-orders");
  });

  test("replaces the document and resets only selection plus open editor state", () => {
    const initial = {
      ...createInitialEditorState(createSampleDocument()),
      selectedNodeId: "select-orders",
      editorNodeId: "select-orders",
    };
    const replacement: GraphDocument = {
      version: 1,
      metadata: { name: "replacement" },
      viewport: { x: 10, y: 20, zoom: 0.8 },
      nodes: [
        {
          id: "output-b",
          kind: "output",
          label: "Output B",
          position: { x: 0, y: 0 },
          data: {
            outputName: "b",
            listeners: createDefaultOutputListenerConfig("b"),
          },
        },
      ],
      edges: [],
    };

    const next = documentReducer(initial, {
      type: "replace-document",
      document: replacement,
    });

    expect(next.workspace.entryGraphId).toBe("graph-main");
    expect(next.document).toEqual({
      id: "graph-main",
      metadata: replacement.metadata,
      viewport: replacement.viewport,
      nodes: replacement.nodes,
      edges: replacement.edges,
    });
    expect(next.selectedNodeId).toBeNull();
    expect(next.editorNodeId).toBeNull();
    expect("activeOutputId" in next).toBe(false);
  });

  test("replace-workspace resets selection and switches the active graph", () => {
    const state = {
      ...createInitialEditorState(createSampleWorkspace()),
      selectedNodeId: "from-orders",
      editorNodeId: "from-orders",
    };

    const next = documentReducer(state, {
      type: "replace-workspace",
      workspace: {
        version: 2,
        metadata: { name: "Replacement" },
        entryGraphId: "graph-b",
        graphs: [
          {
            id: "graph-b",
            metadata: { name: "B" },
            viewport: { x: 10, y: 20, zoom: 0.8 },
            nodes: [],
            edges: [],
          },
        ],
        installedPackages: [],
        packageManifest: null,
      },
    });

    expect(next.activeGraphId).toBe("graph-b");
    expect(next.selectedNodeId).toBeNull();
    expect(next.editorNodeId).toBeNull();
  });

  test("creates a graph and switches active graph to it", () => {
    const initial = createInitialEditorState(createSampleWorkspace());
    const next = documentReducer(initial, {
      type: "create-graph",
    });

    const createdGraph = next.workspace.graphs[next.workspace.graphs.length - 1];
    expect(next.workspace.graphs).toHaveLength(initial.workspace.graphs.length + 1);
    expect(next.activeGraphId).toBe(createdGraph?.id);
    expect(next.document.id).toBe(createdGraph?.id);
    expect(next.workspace.entryGraphId).toBe(initial.workspace.entryGraphId);
  });

  test("set-active-graph switches editor graph without mutating workspace entry graph", () => {
    const initial = createInitialEditorState({
      version: 2,
      metadata: { name: "Workspace" },
      entryGraphId: "graph-a",
      graphs: [
        {
          id: "graph-a",
          metadata: { name: "Alpha" },
          viewport: { x: 0, y: 0, zoom: 1 },
          nodes: [],
          edges: [],
        },
        {
          id: "graph-b",
          metadata: { name: "Beta" },
          viewport: { x: 0, y: 0, zoom: 1 },
          nodes: [],
          edges: [],
        },
      ],
      installedPackages: [],
      packageManifest: null,
    });

    const next = documentReducer(initial, {
      type: "set-active-graph",
      graphId: "graph-b",
    });

    expect(next.activeGraphId).toBe("graph-b");
    expect(next.document.id).toBe("graph-b");
    expect(next.workspace.entryGraphId).toBe("graph-a");
  });

  test("renames a graph and updates active document metadata", () => {
    const withCreated = documentReducer(createInitialEditorState(createSampleWorkspace()), {
      type: "create-graph",
    });
    const createdGraphId = withCreated.activeGraphId;

    const next = documentReducer(withCreated, {
      type: "rename-graph",
      graphId: createdGraphId,
      name: "Ad Hoc Analytics",
    });

    expect(
      next.workspace.graphs.find((graph) => graph.id === createdGraphId)?.metadata.name,
    ).toBe("Ad Hoc Analytics");
    expect(next.document.metadata.name).toBe("Ad Hoc Analytics");
  });

  test("deletes the active graph and switches to another graph", () => {
    const withCreated = documentReducer(createInitialEditorState(createSampleWorkspace()), {
      type: "create-graph",
    });
    const originalGraphId = withCreated.workspace.graphs[0]?.id;
    const graphToDelete = withCreated.activeGraphId;

    const next = documentReducer(withCreated, {
      type: "delete-graph",
      graphId: graphToDelete,
    });

    expect(next.workspace.graphs.some((graph) => graph.id === graphToDelete)).toBe(false);
    expect(next.activeGraphId).toBe(originalGraphId);
    expect(next.document.id).toBe(originalGraphId);
    expect(next.workspace.entryGraphId).toBe(originalGraphId);
  });

  test("upserts edges by id", () => {
    const initial = createInitialEditorState(createSampleDocument());

    const next = documentReducer(initial, {
      type: "upsert-edge",
      edge: {
        id: "edge-select-output",
        source: "from-orders",
        sourceHandle: "out",
        target: "output-orders",
        targetHandle: "in",
      },
    });

    expect(next.document.edges).toHaveLength(initial.document.edges.length);
    expect(next.document.edges.find((edge) => edge.id === "edge-select-output")?.source).toBe(
      "from-orders",
    );
  });

  test("replaces any existing edge on the same target handle", () => {
    const initial = createInitialEditorState(createSampleDocument());

    const next = documentReducer(initial, {
      type: "upsert-edge",
      edge: {
        id: "edge-from-orders-output",
        source: "from-orders",
        sourceHandle: "out",
        target: "output-orders",
        targetHandle: "in",
      },
    });

    const outputInputEdges = next.document.edges.filter(
      (edge) => edge.target === "output-orders" && edge.targetHandle === "in",
    );

    expect(outputInputEdges).toHaveLength(1);
    expect(outputInputEdges[0]?.source).toBe("from-orders");
  });

  test("deletes exactly one edge by id", () => {
    const initial = createInitialEditorState(createSampleDocument());

    const next = documentReducer(initial, {
      type: "delete-edge",
      edgeId: "edge-select-output",
    });

    expect(next.document.edges).toHaveLength(initial.document.edges.length - 1);
    expect(next.document.edges.some((edge) => edge.id === "edge-select-output")).toBe(false);
    expect(next.document.edges.some((edge) => edge.id === "edge-from-select")).toBe(true);
  });

  test("deletes a node and any connected edges together", () => {
    const initial = createInitialEditorState(createSampleDocument());

    const next = documentReducer(
      initial,
      {
        type: "delete-node",
        nodeId: "select-orders",
      } as never,
    );

    expect(next.document.nodes.some((node) => node.id === "select-orders")).toBe(false);
    expect(
      next.document.edges.some(
        (edge) => edge.source === "select-orders" || edge.target === "select-orders",
      ),
    ).toBe(false);
    expect(next.document.nodes.some((node) => node.id === "from-orders")).toBe(true);
  });

  test("throws on unknown runtime actions", () => {
    const initial = createInitialEditorState(createSampleDocument());

    expect(() =>
      documentReducer(initial, { type: "unknown-action" } as never),
    ).toThrow("Unknown action");
  });

  test("install-package installs a package into the workspace with packageId+version dedupe", () => {
    const initial = createInitialEditorState(createSampleWorkspace());

    const sharedDep: GraphPackageFile = {
      formatVersion: 1,
      packageId: "com.acme/shared",
      version: "1.0.0",
      metadata: { name: "Shared" },
      exports: [],
      graphs: [],
      dependencies: [],
    };

    const pkg: GraphPackageFile = {
      formatVersion: 1,
      packageId: "com.acme/orders",
      version: "2.0.0",
      metadata: { name: "Orders" },
      exports: [],
      graphs: [],
      dependencies: [sharedDep],
    };

    const once = documentReducer(initial, { type: "install-package", pkg });
    expect(once.workspace.installedPackages.map((p) => p.packageId)).toEqual([
      "com.acme/shared",
      "com.acme/orders",
    ]);

    const twice = documentReducer(once, { type: "install-package", pkg });
    expect(twice.workspace.installedPackages).toHaveLength(2);
  });

  test("set-package-manifest updates the workspace packageManifest", () => {
    const initial = createInitialEditorState(createSampleWorkspace());

    const manifest: WorkspacePackageManifest = {
      packageId: "com.acme/workspace",
      version: "0.0.1",
      name: "Workspace Package",
      exports: [],
    };

    const next = documentReducer(initial, {
      type: "set-package-manifest",
      manifest,
    });

    expect(next.workspace.packageManifest?.packageId).toBe("com.acme/workspace");
  });

  test("set-package-manifest rejects duplicate export keys", () => {
    const initial = createInitialEditorState(createSampleWorkspace());

    const next = documentReducer(initial, {
      type: "set-package-manifest",
      manifest: {
        packageId: "com.acme/workspace",
        version: "0.0.1",
        name: "Workspace Package",
        exports: [
          { exportKey: "main", graphId: initial.workspace.entryGraphId, displayName: "Main" },
          { exportKey: "main", graphId: initial.workspace.entryGraphId, displayName: "Main Again" },
        ],
      },
    });

    expect(next).toBe(initial);
  });

  test("set-package-manifest rejects exports pointing to missing graphs", () => {
    const initial = createInitialEditorState(createSampleWorkspace());

    const next = documentReducer(initial, {
      type: "set-package-manifest",
      manifest: {
        packageId: "com.acme/workspace",
        version: "0.0.1",
        name: "Workspace Package",
        exports: [
          { exportKey: "missing", graphId: "graph-missing", displayName: "Missing" },
        ],
      },
    });

    expect(next).toBe(initial);
  });

  test("updates the stored viewport", () => {
    const initial = createInitialEditorState(createSampleDocument());

    const next = documentReducer(initial, {
      type: "set-viewport",
      viewport: { x: 120, y: 64, zoom: 0.75 },
    });

    expect(next.document.viewport).toEqual({ x: 120, y: 64, zoom: 0.75 });
  });

  test("initial state no longer includes active output state", () => {
    const initial = createInitialEditorState(createSampleDocument());
    expect("activeOutputId" in initial).toBe(false);
  });
});
