import { afterEach, describe, expect, test } from "bun:test";
import { ReactFlowProvider } from "@xyflow/react";
import { cleanup, render, screen } from "@testing-library/react";
import { createDefaultOutputListenerConfig } from "../../../domain/document/outputListeners";
import type { GraphWorkspace } from "../../../domain/document/types";
import { inferChildGraphInterface } from "../../../domain/workspace/interfaces";
import { QueryNode } from "./QueryNode";

afterEach(cleanup);

function createWorkspaceWithChildInterface(): GraphWorkspace {
  return {
    version: 2,
    metadata: { name: "Workspace" },
    entryGraphId: "graph-parent",
    graphs: [
      {
        id: "graph-parent",
        metadata: { name: "Parent" },
        viewport: { x: 0, y: 0, zoom: 1 },
        nodes: [],
        edges: [],
      },
      {
        id: "graph-child",
        metadata: { name: "Orders Child" },
        viewport: { x: 0, y: 0, zoom: 1 },
        nodes: [
          {
            id: "child-input-orders",
            kind: "graphInput",
            label: "Orders Input",
            position: { x: 0, y: 0 },
            data: {
              inputName: "orders_in",
              columns: { order_id: "int" },
            },
          },
          {
            id: "child-output-orders",
            kind: "output",
            label: "Orders Report",
            position: { x: 260, y: 0 },
            data: {
              outputName: "orders_report",
              listeners: createDefaultOutputListenerConfig("orders_report"),
            },
          },
        ],
        edges: [],
      },
    ],
  };
}

describe("QueryNode", () => {
  test("shows a compact summary for fromTable nodes", () => {
    render(
      <ReactFlowProvider>
        <QueryNode
          id="from-orders"
          data={{
            node: {
              id: "from-orders",
              kind: "fromTable",
              label: "Orders",
              position: { x: 0, y: 0 },
              data: {
                tableRef: { schemaName: "sales", tableName: "orders" },
                columns: { order_id: "int", total: "float" },
              },
            },
            diagnostics: [],
          }}
          selected={false}
          dragging={false}
        />
      </ReactFlowProvider>,
    );

    expect(screen.getByText("Orders")).toBeTruthy();
    expect(screen.getByText(/sales\.orders/)).toBeTruthy();
    expect(screen.getByText(/2 cols/)).toBeTruthy();
  });

  test("shows an error badge when node diagnostics include errors", () => {
    render(
      <ReactFlowProvider>
        <QueryNode
          id="where-1"
          data={{
            node: {
              id: "where-1",
              kind: "where",
              label: "Where",
              position: { x: 0, y: 0 },
              data: {
                predicate: "id > 0",
              },
            },
            diagnostics: [
              {
                level: "error",
                code: "where.invalid-expression",
                message: "Where predicate is invalid.",
                ref: { nodeId: "where-1", field: "predicate" },
              },
            ],
          }}
          selected={true}
          dragging={false}
        />
      </ReactFlowProvider>,
    );

    expect(screen.getByText("error")).toBeTruthy();
    expect(screen.getByText("Where")).toBeTruthy();
    expect(screen.getByText("id > 0")).toBeTruthy();
  });

  test("source transform and terminal nodes expose family and kind hooks", () => {
    const { container } = render(
      <ReactFlowProvider>
        <div>
          <QueryNode
            id="input-1"
            data={{
              node: {
                id: "input-1",
                kind: "graphInput",
                label: "Input",
                position: { x: 0, y: 0 },
                data: {
                  inputName: "orders",
                  columns: { id: "int" },
                },
              },
              diagnostics: [],
            }}
            selected={false}
            dragging={false}
          />
          <QueryNode
            id="select-1"
            data={{
              node: {
                id: "select-1",
                kind: "select",
                label: "Select",
                position: { x: 0, y: 0 },
                data: {
                  mappings: [{ from: "id", to: "id" }],
                },
              },
              diagnostics: [],
            }}
            selected={false}
            dragging={false}
          />
          <QueryNode
            id="output-1"
            data={{
              node: {
                id: "output-1",
                kind: "output",
                label: "Output",
                position: { x: 0, y: 0 },
                data: {
                  outputName: "result",
                  listeners: createDefaultOutputListenerConfig("result"),
                },
              },
              diagnostics: [],
            }}
            selected={false}
            dragging={false}
          />
        </div>
      </ReactFlowProvider>,
    );

    const sourceNode = container.querySelector('[data-node-kind="graphInput"]');
    const transformNode = container.querySelector('[data-node-kind="select"]');
    const terminalNode = container.querySelector('[data-node-kind="output"]');

    expect(sourceNode?.getAttribute("data-node-family")).toBe("source");
    expect(sourceNode?.classList.contains("query-node--source")).toBe(true);
    expect(sourceNode?.classList.contains("query-node--graphInput")).toBe(true);

    expect(transformNode?.getAttribute("data-node-family")).toBe("transform");
    expect(transformNode?.classList.contains("query-node--transform")).toBe(true);
    expect(transformNode?.classList.contains("query-node--select")).toBe(true);

    expect(terminalNode?.getAttribute("data-node-family")).toBe("terminal");
    expect(terminalNode?.classList.contains("query-node--terminal")).toBe(true);
    expect(terminalNode?.classList.contains("query-node--output")).toBe(true);
  });

  test("selected and error state classes layer alongside type presentation hooks", () => {
    const { container } = render(
      <ReactFlowProvider>
        <QueryNode
          id="join-1"
          data={{
            node: {
              id: "join-1",
              kind: "join",
              label: "Join",
              position: { x: 0, y: 0 },
              data: {
                joinType: "inner",
                predicate: "a.id = b.id",
              },
            },
            diagnostics: [
              {
                level: "error",
                code: "join.invalid-condition",
                message: "Join condition is invalid.",
                ref: { nodeId: "join-1", field: "predicate" },
              },
            ],
          }}
          selected={true}
          dragging={false}
        />
      </ReactFlowProvider>,
    );

    const node = container.querySelector('[data-node-kind="join"]');

    expect(node?.getAttribute("data-node-family")).toBe("transform");
    expect(node?.classList.contains("query-node--transform")).toBe(true);
    expect(node?.classList.contains("query-node--join")).toBe(true);
    expect(node?.classList.contains("is-selected")).toBe(true);
    expect(node?.classList.contains("has-errors")).toBe(true);
  });

  test("join keeps a dedicated accent hook even when selected or errored", () => {
    const { container } = render(
      <ReactFlowProvider>
        <QueryNode
          id="join-1"
          data={{
            node: {
              id: "join-1",
              kind: "join",
              label: "Join",
              position: { x: 0, y: 0 },
              data: {
                joinType: "left",
                predicate: "left.id = right.id",
              },
            },
            diagnostics: [
              {
                level: "error",
                code: "join.invalid-condition",
                message: "Join condition is invalid.",
                ref: { nodeId: "join-1", field: "predicate" },
              },
            ],
          }}
          selected={true}
          dragging={false}
        />
      </ReactFlowProvider>,
    );

    const node = container.querySelector('[data-node-kind="join"]');
    const accent = node?.querySelector(".query-node__accent");

    expect(node?.classList.contains("is-selected")).toBe(true);
    expect(node?.classList.contains("has-errors")).toBe(true);
    expect(accent).toBeTruthy();
  });

  test("join still renders left and right target handles", () => {
    const { container } = render(
      <ReactFlowProvider>
        <QueryNode
          id="join-1"
          data={{
            node: {
              id: "join-1",
              kind: "join",
              label: "Join",
              position: { x: 0, y: 0 },
              data: {
                joinType: "inner",
                predicate: "left.id = right.id",
              },
            },
            diagnostics: [],
          }}
          selected={false}
          dragging={false}
        />
      </ReactFlowProvider>,
    );

    const node = container.querySelector('[data-node-kind="join"]');

    expect(node?.querySelector('[data-query-node-handle-marker="target-left"]')).toBeTruthy();
    expect(node?.querySelector('[data-query-node-handle-marker="target-right"]')).toBeTruthy();
    expect(node?.querySelector('[data-query-node-handle-marker="target-in"]')).toBeNull();
    expect(node?.querySelector('[data-query-node-handle-marker="source-out"]')).toBeTruthy();
  });

  test("source nodes still suppress target handles", () => {
    const { container } = render(
      <ReactFlowProvider>
        <div>
          <QueryNode
            id="input-1"
            data={{
              node: {
                id: "input-1",
                kind: "graphInput",
                label: "Input",
                position: { x: 0, y: 0 },
                data: {
                  inputName: "orders",
                  columns: { id: "int" },
                },
              },
              diagnostics: [],
            }}
            selected={false}
            dragging={false}
          />
          <QueryNode
            id="table-1"
            data={{
              node: {
                id: "table-1",
                kind: "fromTable",
                label: "Orders",
                position: { x: 0, y: 0 },
                data: {
                  tableRef: { schemaName: "sales", tableName: "orders" },
                  columns: { order_id: "int" },
                },
              },
              diagnostics: [],
            }}
            selected={false}
            dragging={false}
          />
        </div>
      </ReactFlowProvider>,
    );

    const sourceNodes = container.querySelectorAll(
      '[data-node-kind="graphInput"], [data-node-kind="fromTable"]',
    );

    expect(sourceNodes).toHaveLength(2);

    for (const node of sourceNodes) {
      expect(node.querySelector('[data-query-node-handle-marker="target-left"]')).toBeNull();
      expect(node.querySelector('[data-query-node-handle-marker="target-right"]')).toBeNull();
      expect(node.querySelector('[data-query-node-handle-marker="target-in"]')).toBeNull();
      expect(node.querySelector('[data-query-node-handle-marker="source-out"]')).toBeTruthy();
    }
  });

  test("output still suppresses the source handle", () => {
    const { container } = render(
      <ReactFlowProvider>
        <QueryNode
          id="output-1"
          data={{
              node: {
                id: "output-1",
                kind: "output",
                label: "Output",
                position: { x: 0, y: 0 },
                data: {
                  outputName: "result",
                  listeners: createDefaultOutputListenerConfig("result"),
                },
              },
            diagnostics: [],
          }}
          selected={false}
          dragging={false}
        />
      </ReactFlowProvider>,
    );

    const node = container.querySelector('[data-node-kind="output"]');

    expect(node?.querySelector('[data-query-node-handle-marker="source-out"]')).toBeNull();
    expect(node?.querySelector('[data-query-node-handle-marker="target-in"]')).toBeTruthy();
  });

  test("subgraph nodes render one handle per child input and output", () => {
    const { container } = render(
      <ReactFlowProvider>
        <QueryNode
          id="subgraph-1"
          data={{
            node: {
              id: "subgraph-1",
              kind: "subgraph",
              label: "Orders Package",
              position: { x: 0, y: 0 },
              data: { graphId: "graph-child" },
            },
            diagnostics: [],
            workspace: createWorkspaceWithChildInterface(),
          }}
          selected={false}
          dragging={false}
        />
      </ReactFlowProvider>,
    );

    expect(screen.getByText("orders_in")).toBeTruthy();
    expect(screen.getByText("orders_report")).toBeTruthy();
    expect(screen.getByText("1 inputs / 1 outputs")).toBeTruthy();
    expect(
      container.querySelector(
        '[data-query-node-handle-marker="target-in:child-input-orders"]',
      ),
    ).toBeTruthy();
    expect(
      container.querySelector(
        '[data-query-node-handle-marker="source-out:child-output-orders"]',
      ),
    ).toBeTruthy();
  });

  test("child interfaces expose input column maps and stable unique handle ids", () => {
    const workspace = createWorkspaceWithChildInterface();
    const inferred = inferChildGraphInterface(workspace, "graph-child");

    expect(inferred.graph?.id).toBe("graph-child");
    expect(inferred.iface.inputs).toHaveLength(1);
    expect(inferred.iface.inputs[0]?.name).toBe("orders_in");
    expect(inferred.iface.inputs[0]?.handleId).toBe("in:child-input-orders");
    expect(inferred.iface.inputs[0]?.columns).toEqual({ order_id: "int" });

    expect(inferred.iface.outputs).toHaveLength(1);
    expect(inferred.iface.outputs[0]?.name).toBe("orders_report");
    expect(inferred.iface.outputs[0]?.handleId).toBe("out:child-output-orders");
  });

  test("duplicate port names do not create duplicate handle ids", () => {
    const workspace: GraphWorkspace = {
      version: 2,
      metadata: { name: "Workspace" },
      entryGraphId: "graph-parent",
      graphs: [
        {
          id: "graph-parent",
          metadata: { name: "Parent" },
          viewport: { x: 0, y: 0, zoom: 1 },
          nodes: [],
          edges: [],
        },
        {
          id: "graph-child",
          metadata: { name: "Child" },
          viewport: { x: 0, y: 0, zoom: 1 },
          nodes: [
            {
              id: "child-input-a",
              kind: "graphInput",
              label: "Input A",
              position: { x: 0, y: 0 },
              data: { inputName: "orders_in", columns: { order_id: "int" } },
            },
            {
              id: "child-input-b",
              kind: "graphInput",
              label: "Input B",
              position: { x: 0, y: 0 },
              data: { inputName: "orders_in", columns: { order_id: "int" } },
            },
            {
              id: "child-output-a",
              kind: "output",
              label: "Out A",
              position: { x: 0, y: 0 },
              data: {
                outputName: "orders_report",
                listeners: createDefaultOutputListenerConfig("orders_report"),
              },
            },
            {
              id: "child-output-b",
              kind: "output",
              label: "Out B",
              position: { x: 0, y: 0 },
              data: {
                outputName: "orders_report",
                listeners: createDefaultOutputListenerConfig("orders_report"),
              },
            },
          ],
          edges: [],
        },
      ],
    };

    const inferred = inferChildGraphInterface(workspace, "graph-child");
    const inputHandleIds = inferred.iface.inputs.map((port) => port.handleId);
    const outputHandleIds = inferred.iface.outputs.map((port) => port.handleId);

    expect(new Set(inputHandleIds).size).toBe(inputHandleIds.length);
    expect(new Set(outputHandleIds).size).toBe(outputHandleIds.length);

    const { container } = render(
      <ReactFlowProvider>
        <QueryNode
          id="subgraph-1"
          data={{
            node: {
              id: "subgraph-1",
              kind: "subgraph",
              label: "Duplicate Ports",
              position: { x: 0, y: 0 },
              data: { graphId: "graph-child" },
            },
            diagnostics: [],
            workspace,
          }}
          selected={false}
          dragging={false}
        />
      </ReactFlowProvider>,
    );

    expect(screen.getAllByText("orders_in")).toHaveLength(2);
    expect(screen.getAllByText("orders_report")).toHaveLength(2);
    expect(
      container.querySelector('[data-query-node-handle-marker="target-in:child-input-a"]'),
    ).toBeTruthy();
    expect(
      container.querySelector('[data-query-node-handle-marker="target-in:child-input-b"]'),
    ).toBeTruthy();
    expect(
      container.querySelector('[data-query-node-handle-marker="source-out:child-output-a"]'),
    ).toBeTruthy();
    expect(
      container.querySelector('[data-query-node-handle-marker="source-out:child-output-b"]'),
    ).toBeTruthy();
  });
});
