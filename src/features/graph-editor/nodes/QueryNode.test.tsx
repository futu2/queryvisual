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
});
