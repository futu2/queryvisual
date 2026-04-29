import { afterEach, describe, expect, mock, test } from "bun:test";
import userEvent from "@testing-library/user-event";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DocumentProvider, useDocumentContext } from "../../app/state/DocumentContext";
import { createSampleDocument } from "../../domain/document/sample";
import type { GraphWorkspace } from "../../domain/document/types";
import type { OutputRuntimeSnapshot } from "../output-runtime/outputRuntime";
import { I18nProvider } from "../i18n/I18nContext";

let reactFlowProps: Record<string, unknown> | null = null;
const screenToFlowPositionMock = mock(({ x, y }: { x: number; y: number }) => ({
  x: x + 10,
  y: y + 20,
}));

mock.module("@xyflow/react", () => ({
  ReactFlowProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useReactFlow: () => ({
    screenToFlowPosition: screenToFlowPositionMock,
  }),
  useUpdateNodeInternals: () => () => {},
  ReactFlow: (props: Record<string, unknown>) => {
    reactFlowProps = props;
    const nodes = Array.isArray(props.nodes) ? props.nodes : [];
    const edges = Array.isArray(props.edges) ? props.edges : [];
    const nodeTypes =
      typeof props.nodeTypes === "object" && props.nodeTypes !== null
        ? (props.nodeTypes as Record<string, (...args: Array<unknown>) => JSX.Element>)
        : {};
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
          const nodeType =
            "type" in node && typeof node.type === "string" ? node.type : "";
          const NodeComponent = nodeTypes[nodeType];

          return (
            <div key={nodeId}>
              <span data-testid={`flow-node-label-${nodeId}`}>{label}</span>
              {NodeComponent ? (
                <NodeComponent
                  id={nodeId}
                  data={"data" in node ? node.data : undefined}
                  selected={"selected" in node ? Boolean(node.selected) : false}
                  dragging={"dragging" in node ? Boolean(node.dragging) : false}
                />
              ) : null}
            </div>
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
  Handle: ({ id, ...rest }: Record<string, unknown>) => (
    <div data-handleid={typeof id === "string" ? id : undefined} {...rest} />
  ),
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

async function invokePaneClick(event: Record<string, unknown> = {}) {
  const onPaneClick = reactFlowProps?.onPaneClick;
  if (typeof onPaneClick !== "function") {
    throw new Error("Missing onPaneClick handler");
  }

  await act(async () => {
    await Promise.resolve(onPaneClick({ type: "click", ...event }));
  });
}

async function invokePaneMouseMove(event: Record<string, unknown> = {}) {
  const onPaneMouseMove = reactFlowProps?.onPaneMouseMove;
  if (typeof onPaneMouseMove !== "function") {
    throw new Error("Missing onPaneMouseMove handler");
  }

  await act(async () => {
    await Promise.resolve(onPaneMouseMove({ type: "mousemove", ...event }));
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
  screenToFlowPositionMock.mockClear();
});

describe("GraphCanvas", () => {
  test("wraps React Flow in a full-height canvas frame", () => {
    render(
      <I18nProvider deps={{ navigatorLanguage: "en-US" }}>
        <DocumentProvider initialDocument={createSampleDocument()}>
          <GraphCanvas outputRuntime={createEmptyOutputRuntime()} />
        </DocumentProvider>
      </I18nProvider>,
    );

    expect(screen.getByTestId("react-flow").parentElement?.className).toBe(
      "graph-canvas-frame",
    );
  });

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
      <I18nProvider deps={{ navigatorLanguage: "en-US" }}>
        <DocumentProvider initialWorkspace={workspace}>
          <GraphCanvas outputRuntime={createEmptyOutputRuntime()} />
        </DocumentProvider>
      </I18nProvider>,
    );

    const flowNode = getFlowNode("subgraph-1") as
      | { data?: { workspace?: unknown } }
      | undefined;
    expect(flowNode?.data?.workspace).toBeTruthy();
  });

  test("places a pending node at the clicked flow position and opens its editor", async () => {
    const clearPending = mock();

    render(
      <I18nProvider deps={{ navigatorLanguage: "en-US" }}>
        <DocumentProvider initialDocument={createSampleDocument()}>
          <GraphCanvas
            outputRuntime={createEmptyOutputRuntime()}
            pendingNodePlacement={{ kind: "where", label: "Where" }}
            onClearPendingNodePlacement={clearPending}
          />
        </DocumentProvider>
      </I18nProvider>,
    );

    await invokePaneClick({ clientX: 30, clientY: 40 });

    const placedNode = getFlowNodes().find((node) => {
      if (
        typeof node !== "object" ||
        node === null ||
        !("data" in node) ||
        typeof node.data !== "object" ||
        node.data === null ||
        !("node" in node.data)
      ) {
        return false;
      }

      const graphNode = node.data.node;
      return (
        typeof graphNode === "object" &&
        graphNode !== null &&
        "kind" in graphNode &&
        graphNode.kind === "where"
      );
    });

    expect(placedNode).toMatchObject({
      position: { x: 40, y: 60 },
      selected: true,
    });
    expect(screen.getByRole("dialog", { name: "Edit Where node" })).toBeTruthy();
    expect(clearPending).toHaveBeenCalledTimes(1);
  });

  test("pending node placement shows a handle-free ghost at the latest mouse position", async () => {
    render(
      <I18nProvider deps={{ navigatorLanguage: "en-US" }}>
        <DocumentProvider initialDocument={createSampleDocument()}>
          <GraphCanvas
            outputRuntime={createEmptyOutputRuntime()}
            pendingNodePlacement={{ kind: "select", label: "Select" }}
            onClearPendingNodePlacement={() => {}}
          />
        </DocumentProvider>
      </I18nProvider>,
    );

    expect(getFlowNode("pending-node-preview")).toBeUndefined();

    await invokePaneMouseMove({ clientX: 70, clientY: 80 });

    expect(getFlowNode("pending-node-preview")).toBeUndefined();
    const preview = screen
      .getAllByText("Select")
      .find((element) => element.closest(".query-node--preview"));

    expect(preview).toBeTruthy();
    expect(preview?.closest(".node-placement-preview")).toBeTruthy();
    expect(
      preview?.closest(".query-node--preview")?.querySelector("[data-query-node-handle]"),
    ).toBeNull();
  });

  test("Escape cancels pending node placement", async () => {
    const clearPending = mock();

    render(
      <I18nProvider deps={{ navigatorLanguage: "en-US" }}>
        <DocumentProvider initialDocument={createSampleDocument()}>
          <GraphCanvas
            outputRuntime={createEmptyOutputRuntime()}
            pendingNodePlacement={{ kind: "where", label: "Where" }}
            onClearPendingNodePlacement={clearPending}
          />
        </DocumentProvider>
      </I18nProvider>,
    );

    fireEvent.keyDown(document, { key: "Escape" });

    expect(clearPending).toHaveBeenCalledTimes(1);
  });

  test("pending node placement respects dirty editor discard protection", async () => {
    const user = userEvent.setup();
    const clearPending = mock();

    render(
      <I18nProvider deps={{ navigatorLanguage: "en-US" }}>
        <DocumentProvider initialDocument={createSampleDocument()}>
          <GraphCanvas
            outputRuntime={createEmptyOutputRuntime()}
            pendingNodePlacement={{ kind: "where", label: "Where" }}
            onClearPendingNodePlacement={clearPending}
          />
        </DocumentProvider>
      </I18nProvider>,
    );

    await invokeNodeClick("from-orders");
    await user.clear(screen.getByLabelText("Node name"));
    await user.type(screen.getByLabelText("Node name"), "Dirty orders");
    await invokePaneClick({ clientX: 30, clientY: 40 });

    expect(screen.getByRole("dialog", { name: "Discard changes?" })).toBeTruthy();
    expect(clearPending).toHaveBeenCalledTimes(0);
    expect(
      getFlowNodes().some((node) => {
        if (
          typeof node !== "object" ||
          node === null ||
          !("data" in node) ||
          typeof node.data !== "object" ||
          node.data === null ||
          !("node" in node.data)
        ) {
          return false;
        }

        const graphNode = node.data.node;
        return (
          typeof graphNode === "object" &&
          graphNode !== null &&
          "kind" in graphNode &&
          graphNode.kind === "where"
        );
      }),
    ).toBe(false);

    await user.click(screen.getByRole("button", { name: "Keep editing" }));

    expect(screen.getByText("Click canvas to place Where · Esc to cancel")).toBeTruthy();
    expect(clearPending).toHaveBeenCalledTimes(0);
  });

  test("defers node switching through React Flow onNodeClick until discard is confirmed", async () => {
    const user = userEvent.setup();

    render(
      <I18nProvider deps={{ navigatorLanguage: "en-US" }}>
        <DocumentProvider initialDocument={createSampleDocument()}>
          <GraphCanvas outputRuntime={createEmptyOutputRuntime()} />
          <EditorStateProbe />
        </DocumentProvider>
      </I18nProvider>,
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
      <I18nProvider deps={{ navigatorLanguage: "en-US" }}>
        <DocumentProvider initialDocument={createSampleDocument()}>
          <GraphCanvas outputRuntime={createEmptyOutputRuntime()} />
        </DocumentProvider>
      </I18nProvider>,
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
      <I18nProvider deps={{ navigatorLanguage: "en-US" }}>
        <DocumentProvider initialDocument={createSampleDocument()}>
          <GraphCanvas outputRuntime={createEmptyOutputRuntime()} />
          <EditorStateProbe />
        </DocumentProvider>
      </I18nProvider>,
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
      <I18nProvider deps={{ navigatorLanguage: "en-US" }}>
        <DocumentProvider initialDocument={createSampleDocument()}>
          <GraphCanvas outputRuntime={createEmptyOutputRuntime()} />
          <EditorStateProbe />
        </DocumentProvider>
      </I18nProvider>,
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
      <I18nProvider deps={{ navigatorLanguage: "en-US" }}>
        <DocumentProvider initialDocument={createSampleDocument()}>
          <GraphCanvas outputRuntime={createEmptyOutputRuntime()} />
          <EditorStateProbe />
        </DocumentProvider>
      </I18nProvider>,
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
      <I18nProvider deps={{ navigatorLanguage: "en-US" }}>
        <DocumentProvider initialDocument={createSampleDocument()}>
          <GraphCanvas outputRuntime={createEmptyOutputRuntime()} />
          <EditorStateProbe />
        </DocumentProvider>
      </I18nProvider>,
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
      <I18nProvider deps={{ navigatorLanguage: "en-US" }}>
        <DocumentProvider initialDocument={createSampleDocument()}>
          <GraphCanvas outputRuntime={createEmptyOutputRuntime()} />
          <PositionProbe />
        </DocumentProvider>
      </I18nProvider>,
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
      <I18nProvider deps={{ navigatorLanguage: "en-US" }}>
        <DocumentProvider initialDocument={createSampleDocument()}>
          <GraphCanvas outputRuntime={createEmptyOutputRuntime()} />
        </DocumentProvider>
      </I18nProvider>,
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
      <I18nProvider deps={{ navigatorLanguage: "en-US" }}>
        <DocumentProvider initialDocument={createSampleDocument()}>
          <GraphCanvas outputRuntime={outputRuntime} />
        </DocumentProvider>
      </I18nProvider>,
    );

    await invokeNodeClick("output-orders");

    expect(screen.getByRole("dialog", { name: "Edit Output node" })).toBeTruthy();
    await userEvent.setup().click(screen.getByRole("tab", { name: "SQL" }));
    expect(screen.getByText("SELECT order_id FROM sales.orders")).toBeTruthy();
  });

  test("clicking the edge delete affordance removes only the targeted edge", async () => {
    render(
      <I18nProvider deps={{ navigatorLanguage: "en-US" }}>
        <DocumentProvider initialDocument={createSampleDocument()}>
          <GraphCanvas outputRuntime={createEmptyOutputRuntime()} />
        </DocumentProvider>
      </I18nProvider>,
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

  test("hovering a node exposes a delete affordance that removes that node", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <I18nProvider deps={{ navigatorLanguage: "en-US" }}>
        <DocumentProvider initialDocument={createSampleDocument()}>
          <GraphCanvas outputRuntime={createEmptyOutputRuntime()} />
        </DocumentProvider>
      </I18nProvider>,
    );

    const selectNode = container.querySelector('[data-node-kind="select"]');
    if (!selectNode) {
      throw new Error("Missing select node");
    }

    fireEvent.mouseEnter(selectNode);
    await user.click(screen.getByRole("button", { name: "Delete node" }));

    expect(screen.queryByTestId("flow-node-label-select-orders")).toBeNull();
  });
});
