import { afterEach, describe, expect, mock, test } from "bun:test";
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/react";
import { createDefaultOutputListenerConfig } from "../../../domain/document/outputListeners";
import type { GraphWorkspace } from "../../../domain/document/types";
import { inferChildGraphInterface } from "../../../domain/workspace/interfaces";

let updateNodeInternalsSpy: ReturnType<typeof mock> | null = null;

mock.module("@xyflow/react", () => {
  updateNodeInternalsSpy = mock();

  return {
    ReactFlowProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Handle: ({ id, ...rest }: Record<string, unknown>) => (
      <div data-handleid={typeof id === "string" ? id : undefined} {...rest} />
    ),
    Position: {
      Left: "left",
      Right: "right",
    },
    useUpdateNodeInternals: () => updateNodeInternalsSpy,
  };
});

const { ReactFlowProvider } = await import("@xyflow/react");
const { QueryNode } = await import("./QueryNode");
const { I18nProvider } = await import("../../i18n/I18nContext");

afterEach(cleanup);

function renderWithI18n(
  ui: React.ReactNode,
  navigatorLanguage: string = "en-US",
) {
  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <I18nProvider deps={{ navigatorLanguage }}>
        {children}
      </I18nProvider>
    );
  }

  return render(ui, { wrapper: Wrapper });
}

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
  test("renders helper and graph helper import nodes without dataflow handles", () => {
    const { container } = renderWithI18n(
      <ReactFlowProvider>
        <QueryNode
          id="helpers"
          data={{
            node: {
              id: "helpers",
              kind: "helperFunctions",
              label: "Helper Functions",
              position: { x: 0, y: 0 },
              data: { moduleName: "math", helpers: [{ name: "add10", expression: "$1 + 10" }] },
            },
            diagnostics: [],
          }}
          selected={false}
          dragging={false}
        />
        <QueryNode
          id="import"
          data={{
            node: {
              id: "import",
              kind: "importGraphHelpers",
              label: "Import Graph Helpers",
              position: { x: 0, y: 120 },
              data: { graphId: "graph-helpers", moduleName: "lib" },
            },
            diagnostics: [],
          }}
          selected={false}
          dragging={false}
        />
      </ReactFlowProvider>,
    );

    const helpersNode = container.querySelector('[data-node-kind="helperFunctions"]');
    const importNode = container.querySelector('[data-node-kind="importGraphHelpers"]');

    expect(screen.getByText("1 helper")).toBeTruthy();
    expect(screen.getByText("lib")).toBeTruthy();
    expect(helpersNode?.querySelector('[data-query-node-handle="source-out"]')).toBeNull();
    expect(helpersNode?.querySelector('[data-query-node-handle="target-in"]')).toBeNull();
    expect(importNode?.querySelector('[data-query-node-handle="target-in"]')).toBeNull();
    expect(importNode?.querySelector('[data-query-node-handle="source-out"]')).toBeNull();
  });

  test("shows a compact summary for fromTable nodes", () => {
    renderWithI18n(
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

  test("localizes query summary chrome fragments in zh-CN while keeping user content raw", () => {
    const { container } = renderWithI18n(
      <ReactFlowProvider>
        <div>
          <QueryNode
            id="from-orders-zh"
            data={{
              node: {
                id: "from-orders-zh",
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
          <QueryNode
            id="input-orders-zh"
            data={{
              node: {
                id: "input-orders-zh",
                kind: "graphInput",
                label: "Input",
                position: { x: 0, y: 0 },
                data: {
                  inputName: "orders_in",
                  columns: { order_id: "int", total: "float" },
                },
              },
              diagnostics: [],
            }}
            selected={false}
            dragging={false}
          />
          <QueryNode
            id="join-orders-zh"
            data={{
              node: {
                id: "join-orders-zh",
                kind: "join",
                label: "Join Orders",
                position: { x: 0, y: 0 },
                data: {
                  joinType: "inner",
                  predicate: "a.id = b.id",
                },
              },
              diagnostics: [],
            }}
            selected={false}
            dragging={false}
          />
          <QueryNode
            id="select-orders-zh"
            data={{
              node: {
                id: "select-orders-zh",
                kind: "select",
                label: "Project",
                position: { x: 0, y: 0 },
                data: {
                  mappings: [
                    { name: "order_id", expression: "order_id" },
                    { name: "total", expression: "total" },
                  ],
                },
              },
              diagnostics: [],
            }}
            selected={false}
            dragging={false}
          />
          <QueryNode
            id="agg-orders-zh"
            data={{
              node: {
                id: "agg-orders-zh",
                kind: "aggregation",
                label: "Agg",
                position: { x: 0, y: 0 },
                data: {
                  groupBy: [{ name: "customer_id", expression: "customer_id" }],
                  aggregates: [
                    { name: "count", expression: "count(*)" },
                    { name: "sum_total", expression: "sum(total)" },
                  ],
                },
              },
              diagnostics: [],
            }}
            selected={false}
            dragging={false}
          />
          <QueryNode
            id="sort-orders-zh"
            data={{
              node: {
                id: "sort-orders-zh",
                kind: "sort",
                label: "Sort",
                position: { x: 0, y: 0 },
                data: {
                  items: [
                    { expression: "total", direction: "asc" },
                    { expression: "order_id", direction: "desc" },
                    { expression: "customer_id", direction: "asc" },
                  ],
                },
              },
              diagnostics: [],
            }}
            selected={false}
            dragging={false}
          />
          <QueryNode
            id="limit-orders-zh"
            data={{
              node: {
                id: "limit-orders-zh",
                kind: "limit",
                label: "Limit",
                position: { x: 0, y: 0 },
                data: {
                  count: 10,
                  offset: null,
                },
              },
              diagnostics: [],
            }}
            selected={false}
            dragging={false}
          />
        </div>
      </ReactFlowProvider>,
      "zh-CN",
    );

    // Raw workspace/user content stays stable.
    expect(screen.getByText(/sales\.orders/)).toBeTruthy();

    // Fixed chrome fragments should be localized.
    expect(screen.getAllByText(/2\s*列/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("内连接")).toBeTruthy();
    expect(screen.getByText(/2\s*个表达式/)).toBeTruthy();
    expect(screen.getByText(/1\s*个分组键/)).toBeTruthy();
    expect(screen.getByText(/2\s*个聚合/)).toBeTruthy();
    expect(screen.getByText(/3\s*个排序键/)).toBeTruthy();
    expect(screen.getByText(/限制\s*10/)).toBeTruthy();

    const summaries = Array.from(container.querySelectorAll(".query-node__summary"));
    expect(summaries.length).toBeGreaterThan(0);
    for (const summary of summaries) {
      expect(summary.textContent ?? "").not.toMatch(
        /\b(cols|join|expressions|groups|aggs|sort keys|limit)\b/i,
      );
    }
  });

  test("localizes kind labels and the error badge while keeping user content raw", () => {
    renderWithI18n(
      <ReactFlowProvider>
        <QueryNode
          id="where-1"
          data={{
            node: {
              id: "where-1",
              kind: "where",
              label: "Custom Where Label",
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
      "zh-CN",
    );

    expect(screen.getByText("错误")).toBeTruthy();
    expect(screen.getByText("筛选")).toBeTruthy();
    expect(screen.getByText("Custom Where Label")).toBeTruthy();
    expect(screen.getByText("id > 0")).toBeTruthy();
  });

  test("selected nodes expose a delete affordance that calls the provided handler", async () => {
    const user = userEvent.setup();
    const onDelete = mock();

    renderWithI18n(
      <ReactFlowProvider>
        <QueryNode
          id="where-delete"
          data={
            {
              node: {
                id: "where-delete",
                kind: "where",
                label: "Where",
                position: { x: 0, y: 0 },
                data: {
                  predicate: "total > 0",
                },
              },
              diagnostics: [],
              onDelete,
            } as never
          }
          selected={true}
          dragging={false}
        />
      </ReactFlowProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Delete node" }));

    expect(onDelete).toHaveBeenCalledWith("where-delete");
  });

  test("source transform and terminal nodes expose family and kind hooks", () => {
    const { container } = renderWithI18n(
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
    const { container } = renderWithI18n(
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
    const { container } = renderWithI18n(
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
    const { container } = renderWithI18n(
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
    const { container } = renderWithI18n(
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
    const { container } = renderWithI18n(
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

  test("subgraph interface chrome localizes while graph names and port names stay raw", () => {
    const { container } = renderWithI18n(
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
      "zh-CN",
    );

    expect(screen.getByLabelText("子图接口")).toBeTruthy();
    expect(screen.getByText("输入")).toBeTruthy();
    expect(screen.getByText("输出")).toBeTruthy();
    expect(screen.getByText("orders_in")).toBeTruthy();
    expect(screen.getByText("orders_report")).toBeTruthy();
    expect(screen.getByText("Orders Child")).toBeTruthy();
    expect(screen.getByText("1 个输入 / 1 个输出")).toBeTruthy();
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

  test("missing subgraph chrome is localized while the graph id stays raw", () => {
    const workspace = createWorkspaceWithChildInterface();
    const workspaceWithoutChild: GraphWorkspace = {
      ...workspace,
      graphs: workspace.graphs.filter((graph) => graph.id !== "graph-child"),
    };

    renderWithI18n(
      <ReactFlowProvider>
        <QueryNode
          id="subgraph-missing"
          data={{
            node: {
              id: "subgraph-missing",
              kind: "subgraph",
              label: "Missing Subgraph",
              position: { x: 0, y: 0 },
              data: { graphId: "graph-child" },
            },
            diagnostics: [],
            workspace: workspaceWithoutChild,
          }}
          selected={false}
          dragging={false}
        />
      </ReactFlowProvider>,
      "zh-CN",
    );

    expect(screen.getByText("缺失的图")).toBeTruthy();
    expect(screen.getByText(/0 个输入\s*\/\s*0 个输出/)).toBeTruthy();
    expect(screen.getByText("Missing Subgraph")).toBeTruthy();
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

    const { container } = renderWithI18n(
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

  test("subgraph handles are laid out per port row for larger interfaces (no bunching band)", () => {
    const childInputs = Array.from({ length: 6 }, (_, index) => ({
      id: `child-input-${index + 1}`,
      kind: "graphInput" as const,
      label: `Input ${index + 1}`,
      position: { x: 0, y: index * 40 },
      data: {
        inputName: `in_${index + 1}`,
        columns: { id: "int" as const },
      },
    }));

    const childOutputs = Array.from({ length: 6 }, (_, index) => ({
      id: `child-output-${index + 1}`,
      kind: "output" as const,
      label: `Output ${index + 1}`,
      position: { x: 260, y: index * 40 },
      data: {
        outputName: `out_${index + 1}`,
        listeners: createDefaultOutputListenerConfig(`out_${index + 1}`),
      },
    }));

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
          nodes: [...childInputs, ...childOutputs],
          edges: [],
        },
      ],
    };

    const { container } = renderWithI18n(
      <ReactFlowProvider>
        <QueryNode
          id="subgraph-1"
          data={{
            node: {
              id: "subgraph-1",
              kind: "subgraph",
              label: "Big Interface",
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

    const inputHandles = Array.from(
      container.querySelectorAll<HTMLElement>('[data-query-node-handle^="target-in:"]'),
    );
    expect(inputHandles).toHaveLength(6);
    const inputRows = inputHandles
      .map((handle) => handle.closest(".query-node__port-row"))
      .filter((row): row is Element => Boolean(row));
    expect(inputRows).toHaveLength(6);
    expect(new Set(inputRows).size).toBe(6);

    const outputHandles = Array.from(
      container.querySelectorAll<HTMLElement>('[data-query-node-handle^="source-out:"]'),
    );
    expect(outputHandles).toHaveLength(6);
    const outputRows = outputHandles
      .map((handle) => handle.closest(".query-node__port-row"))
      .filter((row): row is Element => Boolean(row));
    expect(outputRows).toHaveLength(6);
    expect(new Set(outputRows).size).toBe(6);
  });

  test("subgraph nodes trigger updateNodeInternals when the inferred child interface changes", () => {
    if (!updateNodeInternalsSpy) {
      throw new Error("Missing updateNodeInternals spy");
    }

    const baseWorkspace: GraphWorkspace = {
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
              id: "child-input-1",
              kind: "graphInput",
              label: "Input 1",
              position: { x: 0, y: 0 },
              data: { inputName: "in_1", columns: { id: "int" } },
            },
            {
              id: "child-output-1",
              kind: "output",
              label: "Output 1",
              position: { x: 260, y: 0 },
              data: {
                outputName: "out_1",
                listeners: createDefaultOutputListenerConfig("out_1"),
              },
            },
          ],
          edges: [],
        },
      ],
    };

    const { rerender } = renderWithI18n(
      <ReactFlowProvider>
        <QueryNode
          id="subgraph-1"
          data={{
            node: {
              id: "subgraph-1",
              kind: "subgraph",
              label: "Subgraph",
              position: { x: 0, y: 0 },
              data: { graphId: "graph-child" },
            },
            diagnostics: [],
            workspace: baseWorkspace,
          }}
          selected={false}
          dragging={false}
        />
      </ReactFlowProvider>,
    );

    const initialCalls = updateNodeInternalsSpy.mock.calls.length;
    expect(initialCalls).toBeGreaterThan(0);

    const updatedWorkspace: GraphWorkspace = {
      ...baseWorkspace,
      graphs: baseWorkspace.graphs.map((graph) => {
        if (graph.id !== "graph-child") return graph;
        return {
          ...graph,
          nodes: [
            ...graph.nodes,
            {
              id: "child-input-2",
              kind: "graphInput",
              label: "Input 2",
              position: { x: 0, y: 40 },
              data: { inputName: "in_2", columns: { id: "int" } },
            },
          ],
        };
      }),
    };

    rerender(
      <ReactFlowProvider>
        <QueryNode
          id="subgraph-1"
          data={{
            node: {
              id: "subgraph-1",
              kind: "subgraph",
              label: "Subgraph",
              position: { x: 0, y: 0 },
              data: { graphId: "graph-child" },
            },
            diagnostics: [],
            workspace: updatedWorkspace,
          }}
          selected={false}
          dragging={false}
        />
      </ReactFlowProvider>,
    );

    expect(updateNodeInternalsSpy.mock.calls.length).toBeGreaterThan(initialCalls);
  });
});
