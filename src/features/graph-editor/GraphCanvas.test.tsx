import { afterEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, render, screen } from "@testing-library/react";
import { DocumentProvider, useDocumentContext } from "../../app/state/DocumentContext";
import { createSampleDocument } from "../../domain/document/sample";

let reactFlowProps: Record<string, unknown> | null = null;

mock.module("@xyflow/react", () => ({
  ReactFlow: (props: Record<string, unknown>) => {
    reactFlowProps = props;
    return <div data-testid="react-flow" />;
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
