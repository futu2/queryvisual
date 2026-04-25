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
  test("updates node position continuously during drag", () => {
    render(
      <DocumentProvider initialDocument={createSampleDocument()}>
        <GraphCanvas diagnostics={[]} />
        <PositionProbe />
      </DocumentProvider>,
    );

    expect(screen.getByTestId("from-orders-position").textContent).toBe("120,140");

    const onNodeDrag = reactFlowProps?.onNodeDrag;
    if (typeof onNodeDrag !== "function") {
      throw new Error("Missing onNodeDrag handler");
    }

    act(() => {
      onNodeDrag(undefined, {
        id: "from-orders",
        position: { x: 240, y: 300 },
      });
    });

    expect(screen.getByTestId("from-orders-position").textContent).toBe("240,300");
  });
});
