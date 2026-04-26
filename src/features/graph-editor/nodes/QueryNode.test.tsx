import { describe, expect, test } from "bun:test";
import { ReactFlowProvider } from "@xyflow/react";
import { render, screen } from "@testing-library/react";
import { QueryNode } from "./QueryNode";

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
});
