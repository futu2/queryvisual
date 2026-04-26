import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, render, waitFor } from "@testing-library/react";
import { createElement, useEffect } from "react";
import { createSampleDocument } from "../../domain/document/sample";
import { createDefaultOutputListenerConfig } from "../../domain/document/outputListeners";
import {
  applyOutputListeners,
  compileDocumentOutputs,
  createInitialListenerStatus,
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

function RuntimeProbe({
  document,
  onSnapshot,
  deps,
}: {
  document: ReturnType<typeof createSampleDocument>;
  onSnapshot: (snapshot: OutputRuntimeSnapshot) => void;
  deps: Parameters<typeof useOutputRuntime>[1];
}) {
  const snapshot = useOutputRuntime(document, deps);

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
  test("fires enabled listeners for successful SQL output", async () => {
    const clipboardWrite = mock(() => {});
    const log = mock(() => {});
    const setItem = mock(() => {});
    const onSnapshot = mock(() => {});

    render(
      createElement(RuntimeProbe, {
        document: createDocumentWithListenerOutputs(),
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
    expect(latestSnapshot.listenerStatusByOutputId["output-orders"]).toEqual({
      lastSuccessfulSql: expect.stringContaining("SELECT"),
      lastRunAt: 1700000000000,
      lastErrorMessage: null,
    });
  });

  test("skips unchanged SQL and empty SQL listener runs", () => {
    const document = createDocumentWithListenerOutputs();
    const runtime = compileDocumentOutputs(document);
    const clipboardWrite = mock(() => {});
    const log = mock(() => {});
    const setItem = mock(() => {});

    const firstStatus = applyOutputListeners({
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

    applyOutputListeners({
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
    expect(firstStatus["output-empty"]).toEqual(createInitialListenerStatus());
  });
});
