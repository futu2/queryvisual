import { afterEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, render, screen } from "@testing-library/react";
import type { GraphWorkspace } from "./domain/document/types";

const observedRuntimeGraphIds: string[] = [];

mock.module("./features/output-runtime/outputRuntime", () => ({
  useOutputRuntime: (document: { id?: string; metadata: { name: string } }) => {
    if (typeof document.id === "string") {
      observedRuntimeGraphIds.push(document.id);
    }

    return {
      resultsByOutputId: {},
      diagnostics: [],
      listenerStatusByOutputId: {},
      activeGraphName: document.metadata.name,
    };
  },
}));

const { App } = await import("./App");

afterEach(cleanup);

describe("App", () => {
  test("renders the QueryVisual shell without an Outputs panel", async () => {
    await act(async () => {
      render(<App />);
    });

    expect(screen.getByText("QueryVisual")).toBeTruthy();
    expect(screen.getByText("Canvas")).toBeTruthy();
    expect(screen.queryByText("Outputs")).toBeNull();
  });

  test("renders from the active graph in the initial workspace", async () => {
    observedRuntimeGraphIds.length = 0;

    const workspace: GraphWorkspace = {
      version: 2,
      metadata: { name: "Workspace" },
      entryGraphId: "graph-b",
      graphs: [
        {
          id: "graph-a",
          metadata: { name: "Alpha Graph" },
          viewport: { x: 0, y: 0, zoom: 1 },
          nodes: [],
          edges: [],
        },
        {
          id: "graph-b",
          metadata: { name: "Beta Graph" },
          viewport: { x: 10, y: 20, zoom: 0.8 },
          nodes: [],
          edges: [],
        },
      ],
    };

    await act(async () => {
      render(<App initialWorkspace={workspace} />);
    });

    expect(observedRuntimeGraphIds.at(-1)).toBe("graph-b");
  });
});
