import { afterEach, describe, expect, mock, test } from "bun:test";
import userEvent from "@testing-library/user-event";
import { act, cleanup, render, screen } from "@testing-library/react";
import { DocumentProvider, useDocumentContext } from "../../app/state/DocumentContext";
import { createSampleDocument } from "../../domain/document/sample";

let reactFlowProps: Record<string, unknown> | null = null;

mock.module("@xyflow/react", () => ({
  ReactFlow: (props: Record<string, unknown>) => {
    reactFlowProps = props;
    const nodes = Array.isArray(props.nodes) ? props.nodes : [];

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
        <span data-testid="flow-pane">pane</span>
      </div>
    );
  },
  Background: () => null,
  Controls: () => null,
  Handle: () => null,
  MiniMap: () => null,
  Position: {
    Left: "left",
    Right: "right",
  },
}));

const { GraphCanvas } = await import("./GraphCanvas");

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
  test("defers node switching through React Flow onNodeClick until discard is confirmed", async () => {
    const user = userEvent.setup();

    render(
      <DocumentProvider initialDocument={createSampleDocument()}>
        <GraphCanvas diagnostics={[]} />
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
        <GraphCanvas diagnostics={[]} />
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
        <GraphCanvas diagnostics={[]} />
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
        <GraphCanvas diagnostics={[]} />
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
        <GraphCanvas diagnostics={[]} />
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
        <GraphCanvas diagnostics={[]} />
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
        <GraphCanvas diagnostics={[]} />
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
        <GraphCanvas diagnostics={[]} />
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
});
