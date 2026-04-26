import { afterEach, describe, expect, mock, test } from "bun:test";
import userEvent from "@testing-library/user-event";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DocumentProvider, useDocumentContext } from "../../app/state/DocumentContext";
import { createSampleDocument } from "../../domain/document/sample";
import type { GraphWorkspace } from "../../domain/document/types";
import type { OutputRuntimeSnapshot } from "../output-runtime/outputRuntime";

let reactFlowProps: Record<string, unknown> | null = null;

mock.module("@xyflow/react", () => ({
  ReactFlowProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  ReactFlow: (props: Record<string, unknown>) => {
    reactFlowProps = props;
    const nodes = Array.isArray(props.nodes) ? props.nodes : [];
    const edges = Array.isArray(props.edges) ? props.edges : [];
    const edgeTypes =
      typeof props.edgeTypes === "object" && props.edgeTypes !== null
        ? (props.edgeTypes as Record<string, (...args: Array<unknown>) => JSX.Element>)
        : {};

    return (
      <div data-testid="react-flow">
        {nodes.map((node) => {
          if (
            typeof node !== "object" ||
            node === null ||
            !("id" in node) ||
            !("data" in node)
          ) {
            return null;
          }

          const nodeId = typeof node.id === "string" ? node.id : "";
          const nodeData =
            typeof node.data === "object" && node.data !== null && "node" in node.data
              ? node.data.node
              : null;
          const label =
            nodeData &&
            typeof nodeData === "object" &&
            "label" in nodeData &&
            typeof nodeData.label === "string"
              ? nodeData.label
              : "";

          return (
            <span
              key={nodeId}
              data-testid={`flow-node-label-${nodeId}`}
            >
              {label}
            </span>
          );
        })}
        {edges.map((edge) => {
          if (
            typeof edge !== "object" ||
            edge === null ||
            !("id" in edge) ||
            typeof edge.id !== "string" ||
            !("type" in edge) ||
            typeof edge.type !== "string"
          ) {
            return null;
          }

          const EdgeComponent = edgeTypes[edge.type];
          if (!EdgeComponent) {
            return null;
          }

          return (
            <EdgeComponent
              key={edge.id}
              id={edge.id}
              sourceX={0}
              sourceY={0}
              targetX={100}
              targetY={0}
              sourcePosition="right"
              targetPosition="left"
              selected={false}
              data={"data" in edge ? edge.data : undefined}
            />
          );
        })}
        <span data-testid="flow-pane">pane</span>
      </div>
    );
  },
  Background: () => null,
  BaseEdge: () => <div data-testid="base-edge" />,
  Controls: () => null,
  EdgeLabelRenderer: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  Handle: () => null,
  MiniMap: () => null,
  Position: {
    Left: "left",
    Right: "right",
  },
  getBezierPath: () => ["M0,0 L100,0", 50, 0],
}));

const { GraphCanvas } = await import("./GraphCanvas");

function createEmptyOutputRuntime(): OutputRuntimeSnapshot {
  return {
    resultsByOutputId: {},
    diagnostics: [],
    listenerStatusByOutputId: {},
  };
}

function getFlowNodes() {
  return Array.isArray(reactFlowProps?.nodes) ? reactFlowProps.nodes : [];
}

function getFlowNode(nodeId: string) {
  return getFlowNodes().find(
    (node) =>
      typeof node === "object" &&
      node !== null &&
      "id" in node &&
      node.id === nodeId,
  );
}

async function invokeNodeClick(nodeId: string) {
  const onNodeClick = reactFlowProps?.onNodeClick;
  if (typeof onNodeClick !== "function") {
    throw new Error("Missing onNodeClick handler");
  }

  const node = getFlowNode(nodeId);
  if (
    typeof node !== "object" ||
    node === null ||
    !("data" in node) ||
    typeof node.data !== "object" ||
    node.data === null ||
    !("node" in node.data)
  ) {
    throw new Error(`Missing flow node for ${nodeId}`);
  }

  await act(async () => {
    await Promise.resolve(onNodeClick({ type: "click" }, node));
  });
}

async function invokePaneClick() {
  const onPaneClick = reactFlowProps?.onPaneClick;
  if (typeof onPaneClick !== "function") {
    throw new Error("Missing onPaneClick handler");
  }

  await act(async () => {
    await Promise.resolve(onPaneClick({ type: "click" }));
  });
}

function PositionProbe() {
  const { state } = useDocumentContext();
  const node = state.document.nodes.find((candidate) => candidate.id === "from-orders");

  return (
    <span data-testid="from-orders-position">
      {node ? `${node.position.x},${node.position.y}` : "missing"}
    </span>
  );
}

function EditorStateProbe() {
  const { state } = useDocumentContext();

  return (
    <>
      <span data-testid="selected-node-id">{state.selectedNodeId ?? "null"}</span>
    </>
  );
}

afterEach(() => {
  cleanup();
  reactFlowProps = null;
});

describe("GraphCanvas", () => {
  test("passes workspace context through to flow node data for subgraph interface inference", () => {
    const workspace: GraphWorkspace = {
      version: 2,
      metadata: { name: "Workspace" },
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
              position: { x: 0, y: 0 },
              data: { graphId: "graph-child" },
            },
          ],
          edges: [],
        },
        {
          id: "graph-child",
          metadata: { name: "Orders Child" },
          viewport: { x: 0, y: 0, zoom: 1 },
          nodes: [],
          edges: [],
        },
      ],
    };

    render(
      <DocumentProvider initialWorkspace={workspace}>
        <GraphCanvas outputRuntime={createEmptyOutputRuntime()} />
      </DocumentProvider>,
    );

    const flowNode = getFlowNode("subgraph-1") as
      | { data?: { workspace?: unknown } }
      | undefined;
    expect(flowNode?.data?.workspace).toBeTruthy();
  });

  test("defers node switching through React Flow onNodeClick until discard is confirmed", async () => {
    const user = userEvent.setup();

    render(
      <DocumentProvider initialDocument={createSampleDocument()}>
        <GraphCanvas outputRuntime={createEmptyOutputRuntime()} />
        <EditorStateProbe />
      </DocumentProvider>,
    );

    await invokeNodeClick("from-orders");
    await user.clear(screen.getByLabelText("Node name"));
    await user.type(screen.getByLabelText("Node name"), "Paid orders");
    await invokeNodeClick("select-orders");

    expect(screen.getByRole("dialog", { name: "Discard changes?" })).toBeTruthy();
    expect((screen.getByLabelText("Node name") as HTMLInputElement).value).toBe(
      "Paid orders",
    );
    expect(screen.getByTestId("selected-node-id").textContent).toBe("from-orders");

    await user.click(screen.getByRole("button", { name: "Keep editing" }));

    expect(screen.queryByRole("dialog", { name: "Discard changes?" })).toBeNull();
    expect((screen.getByLabelText("Node name") as HTMLInputElement).value).toBe(
      "Paid orders",
    );
    expect(screen.getByTestId("selected-node-id").textContent).toBe("from-orders");

    await invokeNodeClick("select-orders");
    await user.click(screen.getByRole("button", { name: "Discard changes" }));

    expect(screen.queryByRole("dialog", { name: "Discard changes?" })).toBeNull();
    expect((screen.getByLabelText("Node name") as HTMLInputElement).value).toBe(
      "Project",
    );
    expect(screen.getByTestId("selected-node-id").textContent).toBe("select-orders");
  });

  test("saving a renamed node updates the canvas node data label", async () => {
    const user = userEvent.setup();

    render(
      <DocumentProvider initialDocument={createSampleDocument()}>
        <GraphCanvas outputRuntime={createEmptyOutputRuntime()} />
      </DocumentProvider>,
    );

    await invokeNodeClick("from-orders");
    await user.clear(screen.getByLabelText("Node name"));
    await user.type(screen.getByLabelText("Node name"), "Paid orders");
    await user.click(screen.getByRole("button", { name: "Save" }));

    const fromOrders = getFlowNode("from-orders");

    expect(fromOrders).toMatchObject({
      data: {
        node: {
          label: "Paid orders",
        },
      },
    });
    expect(screen.getByTestId("flow-node-label-from-orders").textContent).toBe(
      "Paid orders",
    );
  });

  test("onPaneClick while dirty shows discard confirmation and keep editing preserves selection", async () => {
    const user = userEvent.setup();

    render(
      <DocumentProvider initialDocument={createSampleDocument()}>
        <GraphCanvas outputRuntime={createEmptyOutputRuntime()} />
        <EditorStateProbe />
      </DocumentProvider>,
    );

    await invokeNodeClick("from-orders");
    await user.clear(screen.getByLabelText("Node name"));
    await user.type(screen.getByLabelText("Node name"), "Paid orders");

    await invokePaneClick();

    expect(screen.getByRole("dialog", { name: "Discard changes?" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Keep editing" }));

    expect(screen.queryByRole("dialog", { name: "Discard changes?" })).toBeNull();
    expect(screen.getByTestId("selected-node-id").textContent).toBe("from-orders");
    expect((screen.getByLabelText("Node name") as HTMLInputElement).value).toBe(
      "Paid orders",
    );
  });

  test("confirming discard after a deferred pane close applies the requested state change", async () => {
    const user = userEvent.setup();

    render(
      <DocumentProvider initialDocument={createSampleDocument()}>
        <GraphCanvas outputRuntime={createEmptyOutputRuntime()} />
        <EditorStateProbe />
      </DocumentProvider>,
    );

    await invokeNodeClick("from-orders");
    await user.clear(screen.getByLabelText("Node name"));
    await user.type(screen.getByLabelText("Node name"), "Paid orders");

    await invokePaneClick();
    await user.click(screen.getByRole("button", { name: "Discard changes" }));

    expect(screen.queryByRole("dialog", { name: "Discard changes?" })).toBeNull();
    expect(screen.queryByLabelText("Node name")).toBeNull();
    expect(screen.getByTestId("selected-node-id").textContent).toBe("null");
  });

  test("clicking the currently edited node while dirty is a no-op and does not show discard confirmation", async () => {
    const user = userEvent.setup();

    render(
      <DocumentProvider initialDocument={createSampleDocument()}>
        <GraphCanvas outputRuntime={createEmptyOutputRuntime()} />
        <EditorStateProbe />
      </DocumentProvider>,
    );

    await invokeNodeClick("from-orders");
    await user.clear(screen.getByLabelText("Node name"));
    await user.type(screen.getByLabelText("Node name"), "Paid orders");

    await invokeNodeClick("from-orders");

    expect(screen.queryByRole("dialog", { name: "Discard changes?" })).toBeNull();
    expect((screen.getByLabelText("Node name") as HTMLInputElement).value).toBe(
      "Paid orders",
    );
    expect(screen.getByTestId("selected-node-id").textContent).toBe("from-orders");
  });

  test("keep editing preserves selection until an output node switch is discarded", async () => {
    const user = userEvent.setup();

    render(
      <DocumentProvider initialDocument={createSampleDocument()}>
        <GraphCanvas outputRuntime={createEmptyOutputRuntime()} />
        <EditorStateProbe />
      </DocumentProvider>,
    );

    await invokeNodeClick("from-orders");
    await user.clear(screen.getByLabelText("Node name"));
    await user.type(screen.getByLabelText("Node name"), "Paid orders");

    await invokeNodeClick("output-orders");

    expect(screen.getByRole("dialog", { name: "Discard changes?" })).toBeTruthy();
    expect(screen.getByTestId("selected-node-id").textContent).toBe("from-orders");

    await user.click(screen.getByRole("button", { name: "Keep editing" }));

    expect(screen.getByTestId("selected-node-id").textContent).toBe("from-orders");

    await invokeNodeClick("output-orders");
    await user.click(screen.getByRole("button", { name: "Discard changes" }));

    expect(screen.getByTestId("selected-node-id").textContent).toBe("output-orders");
    expect((screen.getByLabelText("Node name") as HTMLInputElement).value).toBe(
      "Orders Report",
    );
  });

  test("updates node position from React Flow node changes during drag", () => {
    render(
      <DocumentProvider initialDocument={createSampleDocument()}>
        <GraphCanvas outputRuntime={createEmptyOutputRuntime()} />
        <PositionProbe />
      </DocumentProvider>,
    );

    expect(screen.getByTestId("from-orders-position").textContent).toBe("120,140");

    const onNodesChange = reactFlowProps?.onNodesChange;
    if (typeof onNodesChange !== "function") {
      throw new Error("Missing onNodesChange handler");
    }

    act(() => {
      onNodesChange([
        {
          id: "from-orders",
          type: "position",
          position: { x: 240, y: 300 },
          dragging: true,
        },
      ]);
    });

    expect(screen.getByTestId("from-orders-position").textContent).toBe("240,300");
  });

  test("preserves measured node dimensions across drag updates", () => {
    render(
      <DocumentProvider initialDocument={createSampleDocument()}>
        <GraphCanvas outputRuntime={createEmptyOutputRuntime()} />
      </DocumentProvider>,
    );

    const onNodesChange = reactFlowProps?.onNodesChange;
    if (typeof onNodesChange !== "function") {
      throw new Error("Missing onNodesChange handler");
    }

    act(() => {
      onNodesChange([
        {
          id: "from-orders",
          type: "dimensions",
          dimensions: { width: 180, height: 86 },
        },
      ]);
    });

    act(() => {
      onNodesChange([
        {
          id: "from-orders",
          type: "position",
          position: { x: 240, y: 300 },
          dragging: true,
        },
      ]);
    });

    const fromOrders = getFlowNode("from-orders");

    expect(fromOrders).toMatchObject({
      measured: { width: 180, height: 86 },
    });
  });

  test("opening an output node shows saved SQL in the modal from output runtime", async () => {
    const outputRuntime: OutputRuntimeSnapshot = {
      resultsByOutputId: {
        "output-orders": {
          semantic: {
            document: createSampleDocument(),
            outputId: "output-orders",
            outputName: "orders_report",
            orderedNodes: [],
            nodesById: {},
            schemas: {},
            diagnostics: [],
          },
          ir: null,
          optimizedIr: null,
          sql: "SELECT order_id FROM sales.orders",
        },
      },
      diagnostics: [],
      listenerStatusByOutputId: {
        "output-orders": {
          lastSuccessfulSql: "SELECT order_id FROM sales.orders",
          lastRunAt: 1704067200000,
          lastErrorMessage: null,
          lastSuccessfulSqlByListener: {
            copyToClipboard: null,
            logToConsole: null,
            saveToLocalStorage: null,
          },
          lastEnabledByListener: {
            copyToClipboard: false,
            logToConsole: false,
            saveToLocalStorage: false,
          },
        },
      },
    };

    render(
      <DocumentProvider initialDocument={createSampleDocument()}>
        <GraphCanvas outputRuntime={outputRuntime} />
      </DocumentProvider>,
    );

    await invokeNodeClick("output-orders");

    expect(screen.getByRole("dialog", { name: "Edit output node" })).toBeTruthy();
    await userEvent.setup().click(screen.getByRole("tab", { name: "SQL" }));
    expect(screen.getByText("SELECT order_id FROM sales.orders")).toBeTruthy();
  });

  test("clicking the edge delete affordance removes only the targeted edge", async () => {
    render(
      <DocumentProvider initialDocument={createSampleDocument()}>
        <GraphCanvas outputRuntime={createEmptyOutputRuntime()} />
      </DocumentProvider>,
    );

    const hitboxes = await screen.findAllByTestId("deletable-edge-hitbox");
    fireEvent.mouseEnter(hitboxes[1]!);

    const deleteButton = await screen.findByRole("button", { name: "Delete edge" });
    fireEvent.click(deleteButton);

    const remainingEdges = Array.isArray(reactFlowProps?.edges) ? reactFlowProps.edges : [];

    expect(
      remainingEdges.find(
        (edge) =>
          typeof edge === "object" &&
          edge !== null &&
          "id" in edge &&
          edge.id === "edge-select-output",
      ),
    ).toBeUndefined();
    expect(
      remainingEdges.find(
        (edge) =>
          typeof edge === "object" &&
          edge !== null &&
          "id" in edge &&
          edge.id === "edge-from-select",
      ),
    ).toBeTruthy();
  });
});
