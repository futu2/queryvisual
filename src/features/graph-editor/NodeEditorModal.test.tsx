import { afterEach, describe, expect, mock, test } from "bun:test";
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/react";
import type { GraphDocument } from "../../domain/document/types";
import type { GraphNode } from "../../domain/document/types";
import { DocumentProvider } from "../../app/state/DocumentContext";
import { NodeEditorModal } from "./NodeEditorModal";

afterEach(cleanup);

function renderModal({
  node,
  document,
  onClose = () => {},
  onSave = () => {},
}: {
  node: GraphNode;
  document?: GraphDocument;
  onClose?: () => void;
  onSave?: (node: GraphNode) => void;
}) {
  const fallbackDocument: GraphDocument = {
    version: 1,
    metadata: { name: "Test document" },
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [node],
    edges: [],
  };

  return render(
    <DocumentProvider initialDocument={document ?? fallbackDocument}>
      <NodeEditorModal node={node} onClose={onClose} onSave={onSave} />
    </DocumentProvider>,
  );
}

describe("NodeEditorModal", () => {
  test("saves updated select mappings", async () => {
    const user = userEvent.setup();
    const onSave = mock();

    const node: GraphNode = {
      id: "select-orders",
      kind: "select",
      label: "Project",
      position: { x: 0, y: 0 },
      data: {
        mappings: [{ name: "gross_total", expression: "total" }],
      },
    };

    renderModal({ node, onSave });

    await user.clear(screen.getByLabelText("Mapping name 1"));
    await user.type(screen.getByLabelText("Mapping name 1"), "net_total");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalled();
    expect(onSave.mock.calls[0][0].data.mappings[0].name).toBe("net_total");
  });

  test("duplicates and reorders select mappings before save", async () => {
    const user = userEvent.setup();
    const onSave = mock();

    const node: GraphNode = {
      id: "select-orders",
      kind: "select",
      label: "Project",
      position: { x: 0, y: 0 },
      data: {
        mappings: [
          { name: "gross_total", expression: "total" },
          { name: "status_text", expression: "status" },
        ],
      },
    };

    renderModal({ node, onSave });

    await user.click(screen.getByRole("button", { name: "Duplicate mapping 1" }));
    await user.click(screen.getByRole("button", { name: "Move mapping 3 up" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalled();
    expect(onSave.mock.calls[0][0].data.mappings).toEqual([
      { name: "gross_total", expression: "total" },
      { name: "status_text", expression: "status" },
      { name: "gross_total", expression: "total" },
    ]);
  });

  test("strips blank select placeholders but preserves partially filled mappings", async () => {
    const user = userEvent.setup();
    const onSave = mock();

    const node: GraphNode = {
      id: "select-orders",
      kind: "select",
      label: "Project",
      position: { x: 0, y: 0 },
      data: {
        mappings: [],
      },
    };

    renderModal({ node, onSave });

    await user.type(screen.getByLabelText("Mapping name 1"), "gross_total");
    await user.click(screen.getByRole("button", { name: "Add mapping" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalled();
    expect(onSave.mock.calls[0][0].data.mappings).toEqual([
      { name: "gross_total", expression: "" },
    ]);
  });

  test("keeps one blank select mapping row when removing the last row", async () => {
    const user = userEvent.setup();

    const node: GraphNode = {
      id: "select-orders",
      kind: "select",
      label: "Project",
      position: { x: 0, y: 0 },
      data: {
        mappings: [{ name: "gross_total", expression: "total" }],
      },
    };

    renderModal({ node });

    await user.click(screen.getByRole("button", { name: "Remove mapping 1" }));

    expect((screen.getByLabelText("Mapping name 1") as HTMLInputElement).value).toBe(
      "",
    );
    expect((screen.getByLabelText("Expression") as HTMLTextAreaElement).value).toBe(
      "",
    );
  });

  test("adds fromTable field rows and strips blank placeholders on save", async () => {
    const user = userEvent.setup();
    const onSave = mock();

    const node: GraphNode = {
      id: "from-orders",
      kind: "fromTable",
      label: "Orders",
      position: { x: 0, y: 0 },
      data: {
        tableRef: { schemaName: "sales", tableName: "orders" },
        columns: { order_id: "int" },
      },
    };

    renderModal({ node, onSave });

    await user.click(screen.getByRole("button", { name: "Add field" }));
    await user.type(screen.getByLabelText("Field name 2"), "status");
    await user.selectOptions(screen.getByLabelText("Field type 2"), "string");
    await user.click(screen.getByRole("button", { name: "Add field" }));
    expect((screen.getByLabelText("Field name 3") as HTMLInputElement).value).toBe(
      "",
    );
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalled();
    expect(onSave.mock.calls[0][0].data.columns).toEqual({
      order_id: "int",
      status: "string",
    });
  });

  test("keeps one blank fromTable field row when removing the last row", async () => {
    const user = userEvent.setup();

    const node: GraphNode = {
      id: "from-orders",
      kind: "fromTable",
      label: "Orders",
      position: { x: 0, y: 0 },
      data: {
        tableRef: { tableName: "orders" },
        columns: { order_id: "int" },
      },
    };

    renderModal({ node });

    await user.click(screen.getByRole("button", { name: "Remove field 1" }));

    expect((screen.getByLabelText("Field name 1") as HTMLInputElement).value).toBe(
      "",
    );
    expect((screen.getByLabelText("Field type 1") as HTMLSelectElement).value).toBe(
      "string",
    );
  });

  test("duplicates and reorders fromTable field rows before save", async () => {
    const user = userEvent.setup();
    const onSave = mock();

    const node: GraphNode = {
      id: "from-orders",
      kind: "fromTable",
      label: "Orders",
      position: { x: 0, y: 0 },
      data: {
        tableRef: { tableName: "orders" },
        columns: {
          order_id: "int",
          status: "string",
        },
      },
    };

    renderModal({ node, onSave });

    await user.click(screen.getByRole("button", { name: "Duplicate field 2" }));
    await user.clear(screen.getByLabelText("Field name 3"));
    await user.type(screen.getByLabelText("Field name 3"), "customer_id");
    await user.click(screen.getByRole("button", { name: "Move field 3 up" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalled();
    expect(Object.entries(onSave.mock.calls[0][0].data.columns)).toEqual([
      ["order_id", "int"],
      ["customer_id", "string"],
      ["status", "string"],
    ]);
  });

  test("saves duplicate fromTable field names with last-write-wins semantics", async () => {
    const user = userEvent.setup();
    const onSave = mock();

    const node: GraphNode = {
      id: "from-orders",
      kind: "fromTable",
      label: "Orders",
      position: { x: 0, y: 0 },
      data: {
        tableRef: { tableName: "orders" },
        columns: {
          order_id: "int",
          status: "string",
        },
      },
    };

    renderModal({ node, onSave });

    await user.click(screen.getByRole("button", { name: "Duplicate field 1" }));
    await user.selectOptions(screen.getByLabelText("Field type 2"), "float");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalled();
    expect(Object.entries(onSave.mock.calls[0][0].data.columns)).toEqual([
      ["order_id", "float"],
      ["status", "string"],
    ]);
  });

  test("edits aggregation group keys and aggregates independently", async () => {
    const user = userEvent.setup();
    const onSave = mock();

    const node: GraphNode = {
      id: "agg-orders",
      kind: "aggregation",
      label: "Aggregate",
      position: { x: 0, y: 0 },
      data: {
        groupBy: [{ name: "customer_id", expression: "customer_id" }],
        aggregates: [{ name: "gross_total", expression: "sum(total)" }],
      },
    };

    renderModal({ node, onSave });

    await user.click(screen.getByRole("button", { name: "Add group key" }));
    await user.type(screen.getByLabelText("Group key name 2"), "status");
    await user.type(screen.getByLabelText("Group key expression 2"), "status");

    await user.click(
      screen.getByRole("button", { name: "Duplicate aggregate 1" }),
    );
    await user.clear(screen.getByLabelText("Aggregate name 2"));
    await user.clear(screen.getByLabelText("Aggregate expression 2"));
    await user.type(screen.getByLabelText("Aggregate name 2"), "order_count");
    await user.type(
      screen.getByLabelText("Aggregate expression 2"),
      "count(order_id)",
    );

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalled();
    expect(onSave.mock.calls[0][0].data.groupBy).toEqual([
      { name: "customer_id", expression: "customer_id" },
      { name: "status", expression: "status" },
    ]);
    expect(onSave.mock.calls[0][0].data.aggregates).toEqual([
      { name: "gross_total", expression: "sum(total)" },
      { name: "order_count", expression: "count(order_id)" },
    ]);
  });

  test("trims aggregation group keys and aggregates on save", async () => {
    const user = userEvent.setup();
    const onSave = mock();

    const node: GraphNode = {
      id: "agg-orders-trim",
      kind: "aggregation",
      label: "Aggregate",
      position: { x: 0, y: 0 },
      data: {
        groupBy: [{ name: "  customer_id  ", expression: "  customer_id  " }],
        aggregates: [{ name: "  gross_total  ", expression: "  sum(total)  " }],
      },
    };

    renderModal({ node, onSave });

    await user.click(screen.getByRole("button", { name: "Add group key" }));
    await user.click(screen.getByRole("button", { name: "Add aggregate" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalled();
    expect(onSave.mock.calls[0][0].data.groupBy).toEqual([
      { name: "customer_id", expression: "customer_id" },
    ]);
    expect(onSave.mock.calls[0][0].data.aggregates).toEqual([
      { name: "gross_total", expression: "sum(total)" },
    ]);
  });

  test("closes when cancel is clicked", async () => {
    const user = userEvent.setup();
    const onClose = mock();
    const node: GraphNode = {
      id: "limit-1",
      kind: "limit",
      label: "Limit",
      position: { x: 0, y: 0 },
      data: {
        count: 10,
        offset: null,
      },
    };

    renderModal({ node, onClose });

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalled();
  });

  test("saves a cleared limit offset as null", async () => {
    const user = userEvent.setup();
    const onSave = mock();
    const node: GraphNode = {
      id: "limit-1",
      kind: "limit",
      label: "Limit",
      position: { x: 0, y: 0 },
      data: {
        count: 10,
        offset: 5,
      },
    };

    renderModal({ node, onSave });

    await user.clear(screen.getByLabelText("Offset"));
    expect((screen.getByLabelText("Offset") as HTMLInputElement).value).toBe("");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalled();
    expect(onSave.mock.calls[0][0].data.offset).toBeNull();
  });

  test("keeps unsaved draft changes when rerendered with the same node id", async () => {
    const user = userEvent.setup();
    const baseNode: GraphNode = {
      id: "select-orders",
      kind: "select",
      label: "Project",
      position: { x: 0, y: 0 },
      data: {
        mappings: [{ name: "gross_total", expression: "total" }],
      },
    };

    const document: GraphDocument = {
      version: 1,
      metadata: { name: "Test document" },
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [baseNode],
      edges: [],
    };

    const { rerender } = renderModal({ node: baseNode, document });

    await user.clear(screen.getByLabelText("Mapping name 1"));
    await user.type(screen.getByLabelText("Mapping name 1"), "net_total");

    rerender(
      <DocumentProvider initialDocument={document}>
        <NodeEditorModal
          node={{
            ...baseNode,
            data: {
              mappings: [{ name: "gross_total", expression: "total" }],
            },
          }}
          onClose={() => {}}
          onSave={() => {}}
        />
      </DocumentProvider>,
    );

    expect((screen.getByLabelText("Mapping name 1") as HTMLInputElement).value).toBe(
      "net_total",
    );
  });

  test("closes on backdrop click without saving", async () => {
    const user = userEvent.setup();
    const onClose = mock();
    const onSave = mock();
    const node: GraphNode = {
      id: "where-1",
      kind: "where",
      label: "Where",
      position: { x: 0, y: 0 },
      data: {
        predicate: "id > 0",
      },
    };

    const { container } = renderModal({ node, onClose, onSave });

    const backdrop = container.querySelector(".modal-backdrop");
    if (!backdrop) {
      throw new Error("Missing modal backdrop");
    }

    await user.click(backdrop);

    expect(onClose).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  test("shows inline predicate diagnostics and still saves while invalid", async () => {
    const user = userEvent.setup();
    const onSave = mock();

    const node: GraphNode = {
      id: "where-invalid",
      kind: "where",
      label: "Where",
      position: { x: 0, y: 0 },
      data: { predicate: "" },
    };

    renderModal({ node, onSave });

    await user.type(screen.getByLabelText("Predicate"), "1");

    expect(await screen.findByText("Predicate must be boolean.")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalled();
    expect(onSave.mock.calls[0][0].data.predicate).toBe("1");
  });

  test("shows join scope suggestions inside the modal", async () => {
    const user = userEvent.setup();

    const left: GraphNode = {
      id: "left-orders",
      kind: "fromTable",
      label: "Orders",
      position: { x: 0, y: 0 },
      data: {
        tableRef: { tableName: "orders" },
        columns: { order_id: "int" },
      },
    };

    const right: GraphNode = {
      id: "right-customers",
      kind: "fromTable",
      label: "Customers",
      position: { x: 0, y: 0 },
      data: {
        tableRef: { tableName: "customers" },
        columns: { customer_id: "int" },
      },
    };

    const join: GraphNode = {
      id: "join-orders-customers",
      kind: "join",
      label: "Join",
      position: { x: 0, y: 0 },
      data: { joinType: "inner", predicate: "" },
    };

    const document: GraphDocument = {
      version: 1,
      metadata: { name: "Join document" },
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [left, right, join],
      edges: [
        {
          id: "edge-left",
          source: left.id,
          sourceHandle: "out",
          target: join.id,
          targetHandle: "left",
        },
        {
          id: "edge-right",
          source: right.id,
          sourceHandle: "out",
          target: join.id,
          targetHandle: "right",
        },
      ],
    };

    renderModal({ node: join, document });

    await user.type(screen.getByLabelText("Predicate"), "left.");

    expect(await screen.findByLabelText("Suggestions")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Insert left.order_id" })).toBeTruthy();
  });
});
