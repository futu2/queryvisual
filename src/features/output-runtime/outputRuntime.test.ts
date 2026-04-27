import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, render, waitFor } from "@testing-library/react";
import { createElement, useEffect } from "react";
import { createSampleDocument } from "../../domain/document/sample";
import { createDefaultOutputListenerConfig } from "../../domain/document/outputListeners";
import type { GraphWorkspace } from "../../domain/document/types";
import {
  applyOutputListeners,
  compileDocumentOutputs,
  useOutputRuntime,
  type OutputRuntimeSnapshot,
} from "./outputRuntime";

afterEach(cleanup);

function createDocumentWithSharedDiagnostics() {
  const sample = createSampleDocument();

  return {
    ...sample,
    nodes: sample.nodes.map((node) =>
      node.id === "select-orders"
        ? {
            ...node,
            data: {
              mappings: [{ name: "broken_total", expression: "missing_col" }],
            },
          }
        : node,
    ).concat({
      id: "output-alt",
      kind: "output" as const,
      label: "Alt Output",
      position: { x: 720, y: 260 },
      data: {
        outputName: "alt_out",
        listeners: createDefaultOutputListenerConfig("alt_out"),
      },
    }),
    edges: sample.edges.concat({
      id: "edge-select-output-alt",
      source: "select-orders",
      sourceHandle: "out" as const,
      target: "output-alt",
      targetHandle: "in" as const,
    }),
  };
}

function createDocumentWithListenerOutputs() {
  const sample = createSampleDocument();

  return {
    ...sample,
    nodes: sample.nodes
      .map((node) =>
        node.id === "output-orders"
          ? {
              ...node,
              data: {
                ...node.data,
                listeners: {
                  copyToClipboard: true,
                  logToConsole: true,
                  saveToLocalStorage: {
                    enabled: true,
                    key: "queryvisual.output.orders_report",
                  },
                },
              },
            }
          : node,
      )
      .concat({
        id: "output-empty",
        kind: "output" as const,
        label: "Empty Output",
        position: { x: 900, y: 260 },
        data: {
          outputName: "empty_out",
          listeners: {
            copyToClipboard: true,
            logToConsole: true,
            saveToLocalStorage: {
              enabled: true,
              key: "queryvisual.output.empty_out",
            },
          },
        },
      }),
    edges: sample.edges,
  };
}

function createWorkspaceWithParentChildGraphs(options?: {
  childTableName?: string;
  childOutputListeners?: {
    copyToClipboard: boolean;
    logToConsole: boolean;
    saveToLocalStorage: { enabled: boolean; key: string };
  };
  parentOutputListeners?: {
    copyToClipboard: boolean;
    logToConsole: boolean;
    saveToLocalStorage: { enabled: boolean; key: string };
  };
}): GraphWorkspace {
  const childOutputListeners =
    options?.childOutputListeners ??
    createDefaultOutputListenerConfig("orders_base");
  const parentOutputListeners =
    options?.parentOutputListeners ??
    createDefaultOutputListenerConfig("parent_out");

  const childGraph = {
    id: "graph-child",
    metadata: { name: "Orders Child" },
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [
      {
        id: "from-child",
        kind: "fromTable" as const,
        label: "Child source",
        position: { x: 0, y: 0 },
        data: {
          tableRef: {
            schemaName: "sales",
            tableName: options?.childTableName ?? "orders",
          },
          columns: { total: "float" },
        },
      },
      {
        id: "output-child",
        kind: "output" as const,
        label: "Child output",
        position: { x: 260, y: 0 },
        data: {
          outputName: "orders_base",
          listeners: childOutputListeners,
        },
      },
    ],
    edges: [
      {
        id: "edge-child-output",
        source: "from-child",
        sourceHandle: "out",
        target: "output-child",
        targetHandle: "in",
      },
    ],
  };

  const parentGraph = {
    id: "graph-parent",
    metadata: { name: "Parent graph" },
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [
      {
        id: "subgraph-child",
        kind: "subgraph" as const,
        label: "Orders child",
        position: { x: 0, y: 0 },
        data: { graphId: "graph-child" },
      },
      {
        id: "select-parent",
        kind: "select" as const,
        label: "Select",
        position: { x: 260, y: 0 },
        data: { mappings: [{ name: "gross_total", expression: "total" }] },
      },
      {
        id: "output-parent",
        kind: "output" as const,
        label: "Parent output",
        position: { x: 520, y: 0 },
        data: {
          outputName: "parent_out",
          listeners: parentOutputListeners,
        },
      },
    ],
    edges: [
      {
        id: "edge-parent-select",
        source: "subgraph-child",
        sourceHandle: "out:output-child",
        target: "select-parent",
        targetHandle: "in",
      },
      {
        id: "edge-select-output",
        source: "select-parent",
        sourceHandle: "out",
        target: "output-parent",
        targetHandle: "in",
      },
    ],
  };

  return {
    version: 2,
    metadata: { name: "Workspace" },
    entryGraphId: "graph-parent",
    graphs: [parentGraph, childGraph],
  };
}

function createWorkspaceWithDuplicateOutputIds(): GraphWorkspace {
  const createGraph = (graphId: string, graphName: string) => ({
    id: graphId,
    metadata: { name: graphName },
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [
      {
        id: "from-shared",
        kind: "fromTable" as const,
        label: "Orders",
        position: { x: 0, y: 0 },
        data: {
          tableRef: { schemaName: "sales", tableName: "orders" },
          columns: { total: "float" },
        },
      },
      {
        id: "output-shared",
        kind: "output" as const,
        label: "Output",
        position: { x: 260, y: 0 },
        data: {
          outputName: `${graphName}_out`,
          listeners: {
            copyToClipboard: true,
            logToConsole: false,
            saveToLocalStorage: {
              enabled: false,
              key: `queryvisual.output.${graphId}`,
            },
          },
        },
      },
    ],
    edges: [
      {
        id: `edge-${graphId}-output`,
        source: "from-shared",
        sourceHandle: "out",
        target: "output-shared",
        targetHandle: "in",
      },
    ],
  });

  return {
    version: 2,
    metadata: { name: "Workspace" },
    entryGraphId: "graph-a",
    graphs: [
      createGraph("graph-a", "Alpha"),
      createGraph("graph-b", "Beta"),
    ],
  };
}

function RuntimeProbe({
  workspace,
  activeGraphId,
  onSnapshot,
  onRender,
  deps,
}: {
  workspace: GraphWorkspace;
  activeGraphId: string;
  onSnapshot: (snapshot: OutputRuntimeSnapshot) => void;
  onRender?: (snapshot: OutputRuntimeSnapshot) => void;
  deps: Parameters<typeof useOutputRuntime>[1];
}) {
  const snapshot = useOutputRuntime(workspace, activeGraphId, deps);
  onRender?.(snapshot);

  useEffect(() => {
    onSnapshot(snapshot);
  }, [onSnapshot, snapshot]);

  return null;
}

describe("compileDocumentOutputs", () => {
  test("compiles all outputs and dedupes shared diagnostics structurally", () => {
    const snapshot = compileDocumentOutputs(createDocumentWithSharedDiagnostics());

    expect(Object.keys(snapshot.resultsByOutputId).sort()).toEqual([
      "output-alt",
      "output-orders",
    ]);
    expect(
      snapshot.diagnostics.filter((diag) => diag.code === "select.unknown-column"),
    ).toHaveLength(1);
  });
});

describe("useOutputRuntime and applyOutputListeners", () => {
  test("recomputes parent SQL when a referenced child graph changes elsewhere in the workspace", async () => {
    const onRender = mock(() => {});
    const onSnapshot = mock(() => {});
    const originalWorkspace = createWorkspaceWithParentChildGraphs({
      childTableName: "orders",
    });
    const updatedWorkspace = createWorkspaceWithParentChildGraphs({
      childTableName: "returns",
    });

    const { rerender } = render(
      createElement(RuntimeProbe, {
        workspace: originalWorkspace,
        activeGraphId: "graph-parent",
        onSnapshot,
        onRender,
        deps: {
          clipboardWriteText: mock(() => {}),
          consoleLog: mock(() => {}),
          localStorageSetItem: mock(() => {}),
          now: () => 1700000000000,
        },
      }),
    );

    await waitFor(() => {
      const latestSnapshot = onRender.mock.calls.at(-1)?.[0] as OutputRuntimeSnapshot;
      expect(
        latestSnapshot.resultsByOutputId["output-parent"]?.sql,
      ).toContain("FROM sales.orders");
    });

    rerender(
      createElement(RuntimeProbe, {
        workspace: updatedWorkspace,
        activeGraphId: "graph-parent",
        onSnapshot,
        onRender,
        deps: {
          clipboardWriteText: mock(() => {}),
          consoleLog: mock(() => {}),
          localStorageSetItem: mock(() => {}),
          now: () => 1700000001000,
        },
      }),
    );

    await waitFor(() => {
      const latestSnapshot = onRender.mock.calls.at(-1)?.[0] as OutputRuntimeSnapshot;
      expect(
        latestSnapshot.resultsByOutputId["output-parent"]?.sql,
      ).toContain("FROM sales.returns");
    });
  });

  test("runs listeners only for the active graph outputs under workspace-aware compilation", async () => {
    const clipboardWrite = mock(() => {});
    const onSnapshot = mock(() => {});

    render(
      createElement(RuntimeProbe, {
        workspace: createWorkspaceWithParentChildGraphs({
          childOutputListeners: {
            copyToClipboard: true,
            logToConsole: false,
            saveToLocalStorage: {
              enabled: false,
              key: "queryvisual.output.orders_base",
            },
          },
          parentOutputListeners: {
            copyToClipboard: true,
            logToConsole: false,
            saveToLocalStorage: {
              enabled: false,
              key: "queryvisual.output.parent_out",
            },
          },
        }),
        activeGraphId: "graph-child",
        onSnapshot,
        deps: {
          clipboardWriteText: clipboardWrite,
          consoleLog: mock(() => {}),
          localStorageSetItem: mock(() => {}),
          now: () => 1700000000000,
        },
      }),
    );

    await waitFor(() => {
      expect(clipboardWrite).toHaveBeenCalledTimes(1);
      expect(clipboardWrite.mock.calls[0]?.[1]).toEqual({
        outputId: "output-child",
        outputName: "orders_base",
      });
    });
  });

  test("switching graphs reruns listeners independently when output ids collide across graphs", async () => {
    const clipboardWrite = mock(() => {});
    const onSnapshot = mock(() => {});
    const workspace = createWorkspaceWithDuplicateOutputIds();

    const { rerender } = render(
      createElement(RuntimeProbe, {
        workspace,
        activeGraphId: "graph-a",
        onSnapshot,
        deps: {
          clipboardWriteText: clipboardWrite,
          consoleLog: mock(() => {}),
          localStorageSetItem: mock(() => {}),
          now: () => 1700000000000,
        },
      }),
    );

    await waitFor(() => {
      expect(clipboardWrite).toHaveBeenCalledTimes(1);
      expect(clipboardWrite.mock.calls[0]?.[1]).toEqual({
        outputId: "output-shared",
        outputName: "Alpha_out",
      });
    });

    rerender(
      createElement(RuntimeProbe, {
        workspace,
        activeGraphId: "graph-b",
        onSnapshot,
        deps: {
          clipboardWriteText: clipboardWrite,
          consoleLog: mock(() => {}),
          localStorageSetItem: mock(() => {}),
          now: () => 1700000001000,
        },
      }),
    );

    await waitFor(() => {
      expect(clipboardWrite).toHaveBeenCalledTimes(2);
      expect(clipboardWrite.mock.calls[1]?.[1]).toEqual({
        outputId: "output-shared",
        outputName: "Beta_out",
      });
    });
  });

  test("fires enabled listeners for successful SQL output", async () => {
    const clipboardWrite = mock(() => {});
    const log = mock(() => {});
    const setItem = mock(() => {});
    const onSnapshot = mock(() => {});

    render(
      createElement(RuntimeProbe, {
        workspace: {
          version: 2,
          metadata: { name: "Workspace" },
          entryGraphId: "graph-main",
          graphs: [{ ...createDocumentWithListenerOutputs(), id: "graph-main" }],
        },
        activeGraphId: "graph-main",
        onSnapshot,
        deps: {
          clipboardWriteText: clipboardWrite,
          consoleLog: log,
          localStorageSetItem: setItem,
          now: () => 1700000000000,
        },
      }),
    );

    await waitFor(() => {
      expect(clipboardWrite).toHaveBeenCalledTimes(1);
      expect(log).toHaveBeenCalledTimes(1);
      expect(setItem).toHaveBeenCalledTimes(1);
    });

    const latestSnapshot = onSnapshot.mock.calls.at(-1)?.[0] as OutputRuntimeSnapshot;
    expect(latestSnapshot.listenerStatusByOutputId["output-orders"]).toMatchObject({
      lastSuccessfulSql: expect.stringContaining("SELECT"),
      lastRunAt: 1700000000000,
      lastErrorMessage: null,
    });
  });

  test("default console listener prefixes logs with the output name", async () => {
    const originalConsoleLog = console.log;
    const consoleSpy = mock(() => {});
    console.log = consoleSpy as typeof console.log;

    try {
      await applyOutputListeners({
        document: createDocumentWithListenerOutputs(),
        resultsByOutputId: compileDocumentOutputs(createDocumentWithListenerOutputs())
          .resultsByOutputId,
        previousStatusByOutputId: {},
        deps: {
          clipboardWriteText: mock(() => {}),
          localStorageSetItem: mock(() => {}),
          now: () => 1700000000000,
        },
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        "[QueryVisual output orders_report]",
        expect.stringContaining("SELECT"),
      );
    } finally {
      console.log = originalConsoleLog;
    }
  });

  test("skips unchanged SQL and empty SQL listener runs", async () => {
    const document = createDocumentWithListenerOutputs();
    const runtime = compileDocumentOutputs(document);
    const clipboardWrite = mock(() => {});
    const log = mock(() => {});
    const setItem = mock(() => {});

    const firstStatus = await applyOutputListeners({
      document,
      resultsByOutputId: runtime.resultsByOutputId,
      previousStatusByOutputId: {},
      deps: {
        clipboardWriteText: clipboardWrite,
        consoleLog: log,
        localStorageSetItem: setItem,
        now: () => 1700000000000,
      },
    });

    expect(clipboardWrite).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledTimes(1);
    expect(setItem).toHaveBeenCalledTimes(1);

    await applyOutputListeners({
      document,
      resultsByOutputId: runtime.resultsByOutputId,
      previousStatusByOutputId: firstStatus,
      deps: {
        clipboardWriteText: clipboardWrite,
        consoleLog: log,
        localStorageSetItem: setItem,
        now: () => 1700000001000,
      },
    });

    expect(clipboardWrite).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledTimes(1);
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(firstStatus["output-empty"]).toMatchObject({
      lastSuccessfulSql: null,
      lastRunAt: null,
      lastErrorMessage: null,
    });
  });

  test("runs newly enabled listener even when SQL is unchanged", async () => {
    const sample = createSampleDocument();
    const disabledDocument = {
      ...sample,
      nodes: sample.nodes.map((node) =>
        node.id === "output-orders"
          ? {
              ...node,
              data: {
                ...node.data,
                listeners: {
                  copyToClipboard: false,
                  logToConsole: false,
                  saveToLocalStorage: {
                    enabled: false,
                    key: "queryvisual.output.orders_report",
                  },
                },
              },
            }
          : node,
      ),
    };
    const enabledDocument = {
      ...disabledDocument,
      nodes: disabledDocument.nodes.map((node) =>
        node.id === "output-orders"
          ? {
              ...node,
              data: {
                ...node.data,
                listeners: {
                  ...node.data.listeners,
                  copyToClipboard: true,
                },
              },
            }
          : node,
      ),
    };
    const clipboardWrite = mock(() => {});

    const firstStatus = await applyOutputListeners({
      document: disabledDocument,
      resultsByOutputId: compileDocumentOutputs(disabledDocument).resultsByOutputId,
      previousStatusByOutputId: {},
      deps: {
        clipboardWriteText: clipboardWrite,
        now: () => 1700000000000,
      },
    });

    await applyOutputListeners({
      document: enabledDocument,
      resultsByOutputId: compileDocumentOutputs(enabledDocument).resultsByOutputId,
      previousStatusByOutputId: firstStatus,
      deps: {
        clipboardWriteText: clipboardWrite,
        now: () => 1700000001000,
      },
    });

    expect(clipboardWrite).toHaveBeenCalledTimes(1);
  });

  test("isolates listener failures and records lastErrorMessage", async () => {
    const document = createDocumentWithListenerOutputs();
    const runtime = compileDocumentOutputs(document);
    const clipboardWrite = mock(async () => {
      throw new Error("clipboard write failed");
    });
    const log = mock(() => {});
    const setItem = mock(() => {});

    const status = await applyOutputListeners({
      document,
      resultsByOutputId: runtime.resultsByOutputId,
      previousStatusByOutputId: {},
      deps: {
        clipboardWriteText: clipboardWrite,
        consoleLog: log,
        localStorageSetItem: setItem,
        now: () => 1700000000000,
      },
    });

    expect(clipboardWrite).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledTimes(1);
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(status["output-orders"].lastErrorMessage).toContain(
      "clipboard write failed",
    );
  });

  test("captures async errors from default clipboard dependency", async () => {
    const sample = createSampleDocument();
    const document = {
      ...sample,
      nodes: sample.nodes.map((node) =>
        node.id === "output-orders"
          ? {
              ...node,
              data: {
                ...node.data,
                listeners: {
                  copyToClipboard: true,
                  logToConsole: false,
                  saveToLocalStorage: {
                    enabled: false,
                    key: "queryvisual.output.orders_report",
                  },
                },
              },
            }
          : node,
      ),
    };
    const originalClipboard = navigator.clipboard;
    const writeText = mock(async () => {
      throw new Error("default clipboard failed");
    });

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText,
      },
    });

    try {
      const status = await applyOutputListeners({
        document,
        resultsByOutputId: compileDocumentOutputs(document).resultsByOutputId,
        previousStatusByOutputId: {},
      });

      expect(writeText).toHaveBeenCalledTimes(1);
      expect(status["output-orders"].lastErrorMessage).toContain(
        "default clipboard failed",
      );
    } finally {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: originalClipboard,
      });
    }
  });

  test("does not rerun runtime listener pass on viewport-only document updates", async () => {
    const clipboardWrite = mock(() => {});
    const onRender = mock(() => {});
    const onSnapshot = mock(() => {});
    const document = createDocumentWithListenerOutputs();
    const deps = {
      clipboardWriteText: clipboardWrite,
      consoleLog: mock(() => {}),
      localStorageSetItem: mock(() => {}),
      now: () => 1700000000000,
    };
    const { rerender } = render(
      createElement(RuntimeProbe, {
        workspace: {
          version: 2,
          metadata: { name: "Workspace" },
          entryGraphId: "graph-main",
          graphs: [{ ...document, id: "graph-main" }],
        },
        activeGraphId: "graph-main",
        onSnapshot,
        onRender,
        deps,
      }),
    );

    await waitFor(() => {
      expect(clipboardWrite).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      const latestSnapshot = onSnapshot.mock.calls.at(-1)?.[0] as
        | OutputRuntimeSnapshot
        | undefined;
      expect(
        latestSnapshot?.listenerStatusByOutputId["output-orders"]?.lastRunAt,
      ).toBe(1700000000000);
    });
    const settledSnapshot = onRender.mock.calls.at(-1)?.[0] as OutputRuntimeSnapshot;
    onRender.mockClear();
    onSnapshot.mockClear();

    rerender(
      createElement(RuntimeProbe, {
        workspace: {
          version: 2,
          metadata: { name: "Workspace" },
          entryGraphId: "graph-main",
          graphs: [
            {
              ...document,
              id: "graph-main",
              viewport: {
                x: 120,
                y: 80,
                zoom: 1.25,
              },
            },
          ],
        },
        activeGraphId: "graph-main",
        onSnapshot,
        onRender,
        deps,
      }),
    );

    await waitFor(() => {
      expect(onRender).toHaveBeenCalledTimes(1);
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onRender.mock.calls[0]?.[0]).toBe(settledSnapshot);
    expect(onSnapshot).toHaveBeenCalledTimes(0);
    expect(clipboardWrite).toHaveBeenCalledTimes(1);
  });
});
