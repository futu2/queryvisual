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
            <button
              key={nodeId}
              type="button"
              data-testid={`flow-node-${nodeId}`}
              onClick={() => {
                const onNodeClick = props.onNodeClick;
                if (typeof onNodeClick === "function") {
                  onNodeClick({ type: "click" }, node);
                }
              }}
            >
              {label}
            </button>
          );
        })}
        <button
          type="button"
          data-testid="flow-pane"
          onClick={() => {
            const onPaneClick = props.onPaneClick;
            if (typeof onPaneClick === "function") {
              onPaneClick({ type: "click" });
            }
          }}
        >
          pane
        </button>
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

function PositionProbe() {
  const { state } = useDocumentContext();
  const node = state.document.nodes.find((candidate) => candidate.id === "from-orders");

  return (
    <span data-testid="from-orders-position">
      {node ? `${node.position.x},${node.position.y}` : "missing"}
    </span>
  );
}

afterEach(() => {
  cleanup();
  reactFlowProps = null;
});

describe("GraphCanvas", () => {
  test("clicking another node while dirty requires discard confirmation before switching", async () => {
    const user = userEvent.setup();

    render(
      <DocumentProvider initialDocument={createSampleDocument()}>
        <GraphCanvas diagnostics={[]} />
      </DocumentProvider>,
    );

    await user.click(screen.getByTestId("flow-node-from-orders"));
    await user.clear(screen.getByLabelText("Node name"));
    await user.type(screen.getByLabelText("Node name"), "Paid orders");
    await user.click(screen.getByTestId("flow-node-select-orders"));

    expect(screen.getByRole("dialog", { name: "Discard changes?" })).toBeTruthy();
    expect((screen.getByLabelText("Node name") as HTMLInputElement).value).toBe(
      "Paid orders",
    );

    await user.click(screen.getByRole("button", { name: "Keep editing" }));

    expect(screen.queryByRole("dialog", { name: "Discard changes?" })).toBeNull();
    expect((screen.getByLabelText("Node name") as HTMLInputElement).value).toBe(
      "Paid orders",
    );

    await user.click(screen.getByTestId("flow-node-select-orders"));
    await user.click(screen.getByRole("button", { name: "Discard changes" }));

    expect(screen.queryByRole("dialog", { name: "Discard changes?" })).toBeNull();
    expect((screen.getByLabelText("Node name") as HTMLInputElement).value).toBe(
      "Project",
    );
  });

  test("saving a renamed node updates the canvas node data label", async () => {
    const user = userEvent.setup();

    render(
      <DocumentProvider initialDocument={createSampleDocument()}>
        <GraphCanvas diagnostics={[]} />
      </DocumentProvider>,
    );

    await user.click(screen.getByTestId("flow-node-from-orders"));
    await user.clear(screen.getByLabelText("Node name"));
    await user.type(screen.getByLabelText("Node name"), "Paid orders");
    await user.click(screen.getByRole("button", { name: "Save" }));

    const nodes = Array.isArray(reactFlowProps?.nodes) ? reactFlowProps.nodes : [];
    const fromOrders = nodes.find(
      (node) =>
        typeof node === "object" &&
        node !== null &&
        "id" in node &&
        node.id === "from-orders",
    );

    expect(fromOrders).toMatchObject({
      data: {
        node: {
          label: "Paid orders",
        },
      },
    });
    expect(screen.getByTestId("flow-node-from-orders").textContent).toBe("Paid orders");
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

    const nodes = Array.isArray(reactFlowProps?.nodes) ? reactFlowProps.nodes : [];
    const fromOrders = nodes.find(
      (node) =>
        typeof node === "object" &&
        node !== null &&
        "id" in node &&
        node.id === "from-orders",
    );

    expect(fromOrders).toMatchObject({
      measured: { width: 180, height: 86 },
    });
  });
});
