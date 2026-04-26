import { afterEach, describe, expect, mock, test } from "bun:test";
import { createRef } from "react";
import userEvent from "@testing-library/user-event";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { GraphDocument } from "../../domain/document/types";
import type { GraphNode } from "../../domain/document/types";
import { DocumentProvider } from "../../app/state/DocumentContext";
import type { CompileOutputResult } from "../../domain/compile/compileOutput";
import type { OutputListenerStatus } from "../output-runtime/outputRuntime";
import { NodeEditorModal, type NodeEditorModalHandle } from "./NodeEditorModal";

afterEach(cleanup);

function createMockDataTransfer() {
  const store = new Map<string, string>();

  return {
    effectAllowed: "",
    dropEffect: "",
    setData: mock((format: string, value: string) => {
      store.set(format, value);
    }),
    getData: mock((format: string) => store.get(format) ?? ""),
    clearData: mock((format?: string) => {
      if (typeof format === "string") {
        store.delete(format);
        return;
      }

      store.clear();
    }),
  };
}

function dispatchDragEvent(
  target: Element,
  type: "dragstart" | "dragover" | "drop" | "dragend",
  dataTransfer?: ReturnType<typeof createMockDataTransfer>,
) {
  const event = new Event(type, { bubbles: true, cancelable: true });

  if (dataTransfer) {
    Object.defineProperty(event, "dataTransfer", {
      value: dataTransfer,
      configurable: true,
    });
  }

  fireEvent(target, event);
}

function renderModal({
  node,
  document,
  onClose = () => {},
  onSave = () => {},
  outputRuntime = null,
}: {
  node: GraphNode;
  document?: GraphDocument;
  onClose?: () => void;
  onSave?: (node: GraphNode) => void;
  outputRuntime?: {
    compileResult: CompileOutputResult;
    listenerStatus: OutputListenerStatus;
  } | null;
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
      <NodeEditorModal
        node={node}
        onClose={onClose}
        onSave={onSave}
        outputRuntime={outputRuntime}
      />
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

  test("drag-reorders select mappings by dragging row cards and seeds dataTransfer", async () => {
    const user = userEvent.setup();
    const onSave = mock();
    const dataTransfer = createMockDataTransfer();

    const node: GraphNode = {
      id: "select-orders-drag",
      kind: "select",
      label: "Project",
      position: { x: 0, y: 0 },
      data: {
        mappings: [
          { name: "gross_total", expression: "total" },
          { name: "status_text", expression: "status" },
          { name: "customer_id", expression: "customer_id" },
        ],
      },
    };

    renderModal({ node, onSave });

    const firstCard = screen.getByTestId("mapping-row-card-1");
    const thirdCard = screen.getByTestId("mapping-row-card-3");
    const firstHandle = within(firstCard).getByRole("button", {
      name: "Drag mapping 1",
    });

    expect(firstCard.tagName).toBe("SECTION");
    expect(firstCard.className).toContain("row-card");
    expect(firstCard.getAttribute("draggable")).not.toBe("true");
    expect(firstHandle.getAttribute("draggable")).toBe("true");

    dispatchDragEvent(firstHandle, "dragstart", dataTransfer);
    expect(dataTransfer.effectAllowed).toBe("move");
    expect(dataTransfer.getData("text/plain")).not.toBe("");

    dispatchDragEvent(thirdCard, "dragover", dataTransfer);
    dispatchDragEvent(thirdCard, "drop", dataTransfer);

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalled();
    expect(onSave.mock.calls[0][0].data.mappings).toEqual([
      { name: "status_text", expression: "status" },
      { name: "customer_id", expression: "customer_id" },
      { name: "gross_total", expression: "total" },
    ]);
  });

  test("drag-reorders fromTable field rows before save", async () => {
    const user = userEvent.setup();
    const onSave = mock();
    const dataTransfer = createMockDataTransfer();

    const node: GraphNode = {
      id: "from-orders-drag",
      kind: "fromTable",
      label: "Orders",
      position: { x: 0, y: 0 },
      data: {
        tableRef: { tableName: "orders" },
        columns: {
          order_id: "int",
          customer_id: "string",
          created_at: "timestamp",
        },
      },
    };

    renderModal({ node, onSave });

    const firstCard = screen.getByTestId("field-row-card-1");
    const thirdCard = screen.getByTestId("field-row-card-3");
    const firstHandle = within(firstCard).getByRole("button", {
      name: "Drag field 1",
    });

    dispatchDragEvent(firstHandle, "dragstart", dataTransfer);
    dispatchDragEvent(thirdCard, "dragover", dataTransfer);
    dispatchDragEvent(thirdCard, "drop", dataTransfer);

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalled();
    expect(Object.entries(onSave.mock.calls[0][0].data.columns)).toEqual([
      ["customer_id", "string"],
      ["created_at", "timestamp"],
      ["order_id", "int"],
    ]);
  });

  test("removes visible mapping numbering while keeping accessible field labels", () => {
    const node: GraphNode = {
      id: "select-orders-labels",
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

    renderModal({ node });

    expect(screen.queryByText(/^Mapping 1$/)).toBeNull();
    expect(screen.queryByText(/^Mapping 2$/)).toBeNull();
    expect(screen.getByLabelText("Mapping name 1")).toBeTruthy();
    expect(screen.getByLabelText("Mapping name 2")).toBeTruthy();
  });

  test("renders the select mapping name input inside the row-card header", () => {
    const node: GraphNode = {
      id: "select-orders-header",
      kind: "select",
      label: "Project",
      position: { x: 0, y: 0 },
      data: {
        mappings: [{ name: "gross_total", expression: "total" }],
      },
    };

    renderModal({ node });

    const card = screen.getByTestId("mapping-row-card-1");
    const header = card.querySelector(".row-card-header");

    expect(header).toBeTruthy();
    expect(
      within(header as HTMLElement).getByLabelText("Mapping name 1"),
    ).toBeTruthy();
  });

  test("renders row action controls with accessible icon buttons", () => {
    const node: GraphNode = {
      id: "select-orders-actions",
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

    renderModal({ node });

    const moveUp = screen.getByRole("button", { name: "Move mapping 1 up" });
    const moveDown = screen.getByRole("button", { name: "Move mapping 1 down" });
    const duplicate = screen.getByRole("button", { name: "Duplicate mapping 1" });
    const remove = screen.getByRole("button", { name: "Remove mapping 1" });
    const dragHandle = screen.getByRole("button", { name: "Drag mapping 1" });

    expect(moveUp).toBeTruthy();
    expect(moveDown).toBeTruthy();
    expect(duplicate).toBeTruthy();
    expect(remove).toBeTruthy();
    expect(dragHandle).toBeTruthy();
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

  test("treats visible whitespace edits as dirty and warns before discard", async () => {
    const user = userEvent.setup();
    const onClose = mock();

    const node: GraphNode = {
      id: "select-orders-whitespace-dirty",
      kind: "select",
      label: "Project",
      position: { x: 0, y: 0 },
      data: {
        mappings: [{ name: "gross_total", expression: "total" }],
      },
    };

    renderModal({ node, onClose });

    const mappingNameInput = screen.getByLabelText("Mapping name 1");
    await user.click(mappingNameInput);
    await user.type(mappingNameInput, " ");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByRole("dialog", { name: "Discard changes?" })).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  test("focuses the node name input when the modal opens", () => {
    const node: GraphNode = {
      id: "select-orders-focus",
      kind: "select",
      label: "Project",
      position: { x: 0, y: 0 },
      data: {
        mappings: [{ name: "gross_total", expression: "total" }],
      },
    };

    renderModal({ node });

    expect(globalThis.document.activeElement).toBe(
      screen.getByLabelText("Node name"),
    );
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

  test("renders the fromTable field name input inside the row-card header", () => {
    const node: GraphNode = {
      id: "from-orders-header",
      kind: "fromTable",
      label: "Orders",
      position: { x: 0, y: 0 },
      data: {
        tableRef: { tableName: "orders" },
        columns: { order_id: "int" },
      },
    };

    renderModal({ node });

    const card = screen.getByTestId("field-row-card-1");
    const header = card.querySelector(".row-card-header");

    expect(header).toBeTruthy();
    expect(within(header as HTMLElement).getByLabelText("Field name 1")).toBeTruthy();
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

  test("traps tab focus inside the discard confirmation while it is open", async () => {
    const user = userEvent.setup();
    const closeRef = createRef<NodeEditorModalHandle>();

    const node: GraphNode = {
      id: "from-orders-focus-trap",
      kind: "fromTable",
      label: "Orders",
      position: { x: 0, y: 0 },
      data: {
        tableRef: { tableName: "orders" },
        columns: { order_id: "int" },
      },
    };

    const fallbackDocument: GraphDocument = {
      version: 1,
      metadata: { name: "Test document" },
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [node],
      edges: [],
    };

    render(
      <DocumentProvider initialDocument={fallbackDocument}>
        <NodeEditorModal
          ref={closeRef}
          node={node}
          onClose={() => {}}
          onSave={() => {}}
        />
      </DocumentProvider>,
    );

    const nameInput = screen.getByLabelText("Node name");
    await user.clear(nameInput);
    await user.type(nameInput, "Paid orders");

    await act(async () => {
      closeRef.current?.requestClose();
    });

    const keepEditingButton = screen.getByRole("button", { name: "Keep editing" });
    const discardButton = screen.getByRole("button", { name: "Discard changes" });

    expect(globalThis.document.activeElement).toBe(keepEditingButton);

    await user.tab();
    expect(globalThis.document.activeElement).toBe(discardButton);

    await user.tab();
    expect(globalThis.document.activeElement).toBe(keepEditingButton);

    await user.tab({ shift: true });
    expect(globalThis.document.activeElement).toBe(discardButton);
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

  test("drag-reorders sort items by dragging row cards", async () => {
    const user = userEvent.setup();
    const onSave = mock();

    const node: GraphNode = {
      id: "sort-orders",
      kind: "sort",
      label: "Sort",
      position: { x: 0, y: 0 },
      data: {
        items: [
          { expression: "created_at", direction: "desc" },
          { expression: "customer_id", direction: "asc" },
          { expression: "order_id", direction: "asc" },
        ],
      },
    };

    renderModal({ node, onSave });

    const firstCard = screen.getByTestId("sort-row-card-1");
    const thirdCard = screen.getByTestId("sort-row-card-3");
    const firstHandle = within(firstCard).getByRole("button", {
      name: "Drag sort item 1",
    });

    expect(firstCard.tagName).toBe("SECTION");
    expect(firstCard.className).toContain("row-card");
    expect(firstCard.getAttribute("draggable")).not.toBe("true");
    expect(firstHandle.getAttribute("draggable")).toBe("true");

    fireEvent.dragStart(firstHandle);
    fireEvent.dragOver(thirdCard);
    fireEvent.drop(thirdCard);

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalled();
    expect(onSave.mock.calls[0][0].data.items).toEqual([
      { expression: "customer_id", direction: "asc" },
      { expression: "order_id", direction: "asc" },
      { expression: "created_at", direction: "desc" },
    ]);
  });

  test("preserves cleared existing sort items on save", async () => {
    const user = userEvent.setup();
    const onSave = mock();

    const node: GraphNode = {
      id: "sort-cleared-item",
      kind: "sort",
      label: "Sort",
      position: { x: 0, y: 0 },
      data: {
        items: [{ expression: "created_at", direction: "desc" }],
      },
    };

    renderModal({ node, onSave });

    await user.clear(screen.getByLabelText("Sort expression 1"));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalled();
    expect(onSave.mock.calls[0][0].data.items).toEqual([
      { expression: "", direction: "desc" },
    ]);
  });

  test("keeps empty sort nodes empty when saved without edits", async () => {
    const user = userEvent.setup();
    const onSave = mock();

    const node: GraphNode = {
      id: "sort-empty",
      kind: "sort",
      label: "Sort",
      position: { x: 0, y: 0 },
      data: {
        items: [],
      },
    };

    renderModal({ node, onSave });

    expect((screen.getByLabelText("Sort expression 1") as HTMLInputElement).value).toBe(
      "",
    );

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalled();
    expect(onSave.mock.calls[0][0].data.items).toEqual([]);
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
      { name: "customer_id", expression: "  customer_id  " },
    ]);
    expect(onSave.mock.calls[0][0].data.aggregates).toEqual([
      { name: "gross_total", expression: "  sum(total)  " },
    ]);
  });

  test("drag-reorders aggregation group keys before save", async () => {
    const user = userEvent.setup();
    const onSave = mock();
    const dataTransfer = createMockDataTransfer();

    const node: GraphNode = {
      id: "agg-groupby-drag",
      kind: "aggregation",
      label: "Aggregate",
      position: { x: 0, y: 0 },
      data: {
        groupBy: [
          { name: "customer_id", expression: "customer_id" },
          { name: "status", expression: "status" },
          { name: "region", expression: "region" },
        ],
        aggregates: [{ name: "gross_total", expression: "sum(total)" }],
      },
    };

    renderModal({ node, onSave });

    const firstCard = screen.getByTestId("group-key-row-card-1");
    const thirdCard = screen.getByTestId("group-key-row-card-3");
    const firstHandle = within(firstCard).getByRole("button", {
      name: "Drag group key 1",
    });

    dispatchDragEvent(firstHandle, "dragstart", dataTransfer);
    dispatchDragEvent(thirdCard, "dragover", dataTransfer);
    dispatchDragEvent(thirdCard, "drop", dataTransfer);

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalled();
    expect(onSave.mock.calls[0][0].data.groupBy).toEqual([
      { name: "status", expression: "status" },
      { name: "region", expression: "region" },
      { name: "customer_id", expression: "customer_id" },
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

  test("saving an edited node name from the modal header updates the saved node label", async () => {
    const user = userEvent.setup();
    const onSave = mock();
    const node: GraphNode = {
      id: "where-header-name",
      kind: "where",
      label: "Filter orders",
      position: { x: 0, y: 0 },
      data: {
        predicate: "status = 'paid'",
      },
    };

    renderModal({ node, onSave });

    await user.clear(screen.getByLabelText("Node name"));
    await user.type(screen.getByLabelText("Node name"), "Paid orders");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalled();
    expect(onSave.mock.calls[0][0].label).toBe("Paid orders");
  });

  test("cancel on a dirty modal asks for confirmation and keep editing preserves the draft", async () => {
    const user = userEvent.setup();
    const onClose = mock();
    const node: GraphNode = {
      id: "where-dirty-cancel",
      kind: "where",
      label: "Filter orders",
      position: { x: 0, y: 0 },
      data: {
        predicate: "status = 'paid'",
      },
    };

    renderModal({ node, onClose });

    await user.clear(screen.getByLabelText("Node name"));
    await user.type(screen.getByLabelText("Node name"), "Paid orders");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByRole("dialog", { name: "Discard changes?" })).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Keep editing" }));

    expect(screen.queryByRole("dialog", { name: "Discard changes?" })).toBeNull();
    expect((screen.getByLabelText("Node name") as HTMLInputElement).value).toBe(
      "Paid orders",
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  test("confirming discard after cancel closes the modal", async () => {
    const user = userEvent.setup();
    const onClose = mock();
    const node: GraphNode = {
      id: "where-discard-cancel",
      kind: "where",
      label: "Filter orders",
      position: { x: 0, y: 0 },
      data: {
        predicate: "status = 'paid'",
      },
    };

    renderModal({ node, onClose });

    await user.clear(screen.getByLabelText("Node name"));
    await user.type(screen.getByLabelText("Node name"), "Paid orders");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Discard changes" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("dirty requestClose uses the provided close callback after discard is confirmed", async () => {
    const user = userEvent.setup();
    const onClose = mock();
    const customClose = mock();
    const ref = createRef<NodeEditorModalHandle>();
    const node: GraphNode = {
      id: "where-custom-discard",
      kind: "where",
      label: "Filter orders",
      position: { x: 0, y: 0 },
      data: {
        predicate: "status = 'paid'",
      },
    };

    const document: GraphDocument = {
      version: 1,
      metadata: { name: "Test document" },
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [node],
      edges: [],
    };

    render(
      <>
        <button type="button" onClick={() => ref.current?.requestClose(customClose)}>
          Trigger custom close
        </button>
        <DocumentProvider initialDocument={document}>
          <NodeEditorModal ref={ref} node={node} onClose={onClose} onSave={() => {}} />
        </DocumentProvider>
      </>,
    );

    await user.clear(screen.getByLabelText("Node name"));
    await user.type(screen.getByLabelText("Node name"), "Paid orders");

    await user.click(screen.getByRole("button", { name: "Trigger custom close" }));
    await user.click(screen.getByRole("button", { name: "Discard changes" }));

    expect(customClose).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  test("output modal saves listener settings and renders runtime tabs", async () => {
    const user = userEvent.setup();
    const onSave = mock();
    const node: GraphNode = {
      id: "output-orders",
      kind: "output",
      label: "Orders Report",
      position: { x: 0, y: 0 },
      data: {
        outputName: "orders_report",
        listeners: {
          copyToClipboard: false,
          logToConsole: false,
          saveToLocalStorage: {
            enabled: false,
            key: "queryvisual.output.orders_report",
          },
        },
      },
    };
    const outputRuntime = {
      compileResult: {
        semantic: {
          document: {
            version: 1,
            metadata: { name: "Test document" },
            viewport: { x: 0, y: 0, zoom: 1 },
            nodes: [node],
            edges: [],
          },
          outputId: node.id,
          outputName: "orders_report",
          orderedNodes: [node],
          nodesById: { [node.id]: node },
          schemas: {},
          diagnostics: [],
        },
        ir: null,
        optimizedIr: null,
        sql: "SELECT order_id FROM sales.orders",
      } satisfies CompileOutputResult,
      listenerStatus: {
        lastSuccessfulSql: "SELECT order_id FROM sales.orders",
        lastRunAt: 1704067200000,
        lastErrorMessage: "saveToLocalStorage: write failed",
        lastSuccessfulSqlByListener: {
          copyToClipboard: "SELECT order_id FROM sales.orders",
          logToConsole: null,
          saveToLocalStorage: null,
        },
        lastEnabledByListener: {
          copyToClipboard: true,
          logToConsole: false,
          saveToLocalStorage: true,
        },
      } satisfies OutputListenerStatus,
    };

    renderModal({ node, onSave, outputRuntime });

    expect(screen.getByRole("tab", { name: "Diagnostics" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Semantic" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "IR" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Optimized IR" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "SQL" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "SQL" }).getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(screen.getByText("SELECT order_id FROM sales.orders")).toBeTruthy();
    expect(screen.getByText("saveToLocalStorage: write failed")).toBeTruthy();

    await user.clear(screen.getByLabelText("Output name"));
    await user.type(screen.getByLabelText("Output name"), "orders_runtime");
    await user.click(screen.getByLabelText("Copy to clipboard"));
    await user.click(screen.getByLabelText("Log to console"));
    await user.click(screen.getByLabelText("Save to localStorage"));
    await user.clear(screen.getByLabelText("localStorage key"));
    await user.type(
      screen.getByLabelText("localStorage key"),
      "queryvisual.output.orders_runtime",
    );
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0].data).toEqual({
      outputName: "orders_runtime",
      listeners: {
        copyToClipboard: true,
        logToConsole: true,
        saveToLocalStorage: {
          enabled: true,
          key: "queryvisual.output.orders_runtime",
        },
      },
    });
  });

  test("output runtime tab selection resets to SQL when runtime data changes", async () => {
    const user = userEvent.setup();
    const node: GraphNode = {
      id: "output-orders-reset",
      kind: "output",
      label: "Orders Report",
      position: { x: 0, y: 0 },
      data: {
        outputName: "orders_report",
        listeners: {
          copyToClipboard: false,
          logToConsole: false,
          saveToLocalStorage: {
            enabled: false,
            key: "queryvisual.output.orders_report",
          },
        },
      },
    };
    const baseRuntime = {
      compileResult: {
        semantic: {
          document: {
            version: 1,
            metadata: { name: "Test document" },
            viewport: { x: 0, y: 0, zoom: 1 },
            nodes: [node],
            edges: [],
          },
          outputId: node.id,
          outputName: "orders_report",
          orderedNodes: [node],
          nodesById: { [node.id]: node },
          schemas: {},
          diagnostics: [],
        },
        ir: null,
        optimizedIr: null,
        sql: "SELECT order_id FROM sales.orders",
      } satisfies CompileOutputResult,
      listenerStatus: {
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
      } satisfies OutputListenerStatus,
    };

    const renderResult = renderModal({ node, outputRuntime: baseRuntime });

    await user.click(screen.getByRole("tab", { name: "Diagnostics" }));
    expect(screen.getByRole("tab", { name: "Diagnostics" }).getAttribute("aria-selected")).toBe(
      "true",
    );

    const nextRuntime = {
      ...baseRuntime,
      compileResult: {
        ...baseRuntime.compileResult,
        sql: "SELECT customer_id FROM sales.orders",
      },
    };

    renderResult.rerender(
      <DocumentProvider
        initialDocument={{
          version: 1,
          metadata: { name: "Test document" },
          viewport: { x: 0, y: 0, zoom: 1 },
          nodes: [node],
          edges: [],
        }}
      >
        <NodeEditorModal
          node={node}
          onClose={() => {}}
          onSave={() => {}}
          outputRuntime={nextRuntime}
        />
      </DocumentProvider>,
    );

    expect(screen.getByRole("tab", { name: "SQL" }).getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(screen.getByText("SELECT customer_id FROM sales.orders")).toBeTruthy();
  });

  test("switching between output nodes without runtime data resets tab selection to SQL", async () => {
    const user = userEvent.setup();
    const firstOutputNode: GraphNode = {
      id: "output-orders-a",
      kind: "output",
      label: "Orders A",
      position: { x: 0, y: 0 },
      data: {
        outputName: "orders_a",
        listeners: {
          copyToClipboard: false,
          logToConsole: false,
          saveToLocalStorage: {
            enabled: false,
            key: "queryvisual.output.orders_a",
          },
        },
      },
    };
    const secondOutputNode: GraphNode = {
      id: "output-orders-b",
      kind: "output",
      label: "Orders B",
      position: { x: 0, y: 0 },
      data: {
        outputName: "orders_b",
        listeners: {
          copyToClipboard: false,
          logToConsole: false,
          saveToLocalStorage: {
            enabled: false,
            key: "queryvisual.output.orders_b",
          },
        },
      },
    };
    const document: GraphDocument = {
      version: 1,
      metadata: { name: "Test document" },
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [firstOutputNode, secondOutputNode],
      edges: [],
    };

    const renderResult = render(
      <DocumentProvider initialDocument={document}>
        <NodeEditorModal
          node={firstOutputNode}
          onClose={() => {}}
          onSave={() => {}}
          outputRuntime={null}
        />
      </DocumentProvider>,
    );

    await user.click(screen.getByRole("tab", { name: "Diagnostics" }));
    expect(screen.getByRole("tab", { name: "Diagnostics" }).getAttribute("aria-selected")).toBe(
      "true",
    );

    renderResult.rerender(
      <DocumentProvider initialDocument={document}>
        <NodeEditorModal
          node={secondOutputNode}
          onClose={() => {}}
          onSave={() => {}}
          outputRuntime={null}
        />
      </DocumentProvider>,
    );

    expect(screen.getByRole("tab", { name: "SQL" }).getAttribute("aria-selected")).toBe(
      "true",
    );
  });

  test("output runtime tabs expose aria wiring and arrow-key navigation", () => {
    const node: GraphNode = {
      id: "output-orders-a11y",
      kind: "output",
      label: "Orders A11y",
      position: { x: 0, y: 0 },
      data: {
        outputName: "orders_a11y",
        listeners: {
          copyToClipboard: false,
          logToConsole: false,
          saveToLocalStorage: {
            enabled: false,
            key: "queryvisual.output.orders_a11y",
          },
        },
      },
    };
    const outputRuntime = {
      compileResult: {
        semantic: {
          document: {
            version: 1,
            metadata: { name: "Test document" },
            viewport: { x: 0, y: 0, zoom: 1 },
            nodes: [node],
            edges: [],
          },
          outputId: node.id,
          outputName: "orders_a11y",
          orderedNodes: [node],
          nodesById: { [node.id]: node },
          schemas: {},
          diagnostics: [],
        },
        ir: null,
        optimizedIr: null,
        sql: "SELECT order_id FROM sales.orders",
      } satisfies CompileOutputResult,
      listenerStatus: {
        lastSuccessfulSql: null,
        lastRunAt: null,
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
      } satisfies OutputListenerStatus,
    };

    renderModal({ node, outputRuntime });

    const panel = screen.getByRole("tabpanel");
    const sqlTab = screen.getByRole("tab", { name: "SQL" });
    const diagnosticsTab = screen.getByRole("tab", { name: "Diagnostics" });

    expect(sqlTab.getAttribute("tabindex")).toBe("0");
    expect(diagnosticsTab.getAttribute("tabindex")).toBe("-1");
    expect(sqlTab.getAttribute("id")).toBeTruthy();
    expect(panel.getAttribute("id")).toBeTruthy();
    expect(sqlTab.getAttribute("aria-controls")).toBe(panel.getAttribute("id"));
    expect(panel.getAttribute("aria-labelledby")).toBe(sqlTab.getAttribute("id"));

    sqlTab.focus();
    fireEvent.keyDown(sqlTab, { key: "ArrowRight" });

    expect(diagnosticsTab.getAttribute("aria-selected")).toBe("true");
    expect(diagnosticsTab.getAttribute("tabindex")).toBe("0");
    expect(sqlTab.getAttribute("tabindex")).toBe("-1");
    expect(globalThis.document.activeElement).toBe(diagnosticsTab);
    expect(panel.getAttribute("aria-labelledby")).toBe(diagnosticsTab.getAttribute("id"));
  });

  test("non-output nodes keep current modal behavior without output runtime tabs", () => {
    const node: GraphNode = {
      id: "where-1",
      kind: "where",
      label: "Filter",
      position: { x: 0, y: 0 },
      data: {
        predicate: "status = 'paid'",
      },
    };
    const outputRuntime = {
      compileResult: {
        semantic: {
          document: {
            version: 1,
            metadata: { name: "Test document" },
            viewport: { x: 0, y: 0, zoom: 1 },
            nodes: [node],
            edges: [],
          },
          outputId: "output-ignored",
          outputName: "ignored",
          orderedNodes: [],
          nodesById: {},
          schemas: {},
          diagnostics: [],
        },
        ir: null,
        optimizedIr: null,
        sql: "SELECT 1",
      } satisfies CompileOutputResult,
      listenerStatus: {
        lastSuccessfulSql: null,
        lastRunAt: null,
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
      } satisfies OutputListenerStatus,
    };

    renderModal({ node, outputRuntime });

    expect(screen.queryByRole("tab", { name: "SQL" })).toBeNull();
    expect(screen.getByLabelText("Predicate")).toBeTruthy();
  });

  test("discard confirmation clears before a custom close callback that does not unmount the modal returns", async () => {
    const user = userEvent.setup();
    const onClose = mock();
    let dialogPresentDuringCustomClose = false;
    const customClose = mock(() => {
      dialogPresentDuringCustomClose =
        screen.queryByRole("dialog", { name: "Discard changes?" }) !== null;
    });
    const ref = createRef<NodeEditorModalHandle>();
    const node: GraphNode = {
      id: "where-custom-sticky-confirm",
      kind: "where",
      label: "Filter orders",
      position: { x: 0, y: 0 },
      data: {
        predicate: "status = 'paid'",
      },
    };

    const document: GraphDocument = {
      version: 1,
      metadata: { name: "Test document" },
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [node],
      edges: [],
    };

    render(
      <>
        <button type="button" onClick={() => ref.current?.requestClose(customClose)}>
          Trigger custom close
        </button>
        <DocumentProvider initialDocument={document}>
          <NodeEditorModal ref={ref} node={node} onClose={onClose} onSave={() => {}} />
        </DocumentProvider>
      </>,
    );

    await user.clear(screen.getByLabelText("Node name"));
    await user.type(screen.getByLabelText("Node name"), "Paid orders");

    await user.click(screen.getByRole("button", { name: "Trigger custom close" }));
    await user.click(screen.getByRole("button", { name: "Discard changes" }));

    expect(customClose).toHaveBeenCalledTimes(1);
    expect(dialogPresentDuringCustomClose).toBe(false);
    expect(screen.queryByRole("dialog", { name: "Discard changes?" })).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  test("focus moves into the discard confirmation and returns to the previously focused control on keep editing", async () => {
    const user = userEvent.setup();
    const onClose = mock();
    const node: GraphNode = {
      id: "where-confirm-focus",
      kind: "where",
      label: "Filter orders",
      position: { x: 0, y: 0 },
      data: {
        predicate: "status = 'paid'",
      },
    };

    renderModal({ node, onClose });

    const nodeNameInput = screen.getByLabelText("Node name");
    await user.clear(nodeNameInput);
    await user.type(nodeNameInput, "Paid orders");
    await user.click(nodeNameInput);
    expect(globalThis.document.activeElement).toBe(nodeNameInput);

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    const keepEditingButton = screen.getByRole("button", { name: "Keep editing" });
    expect(globalThis.document.activeElement).toBe(keepEditingButton);

    await user.click(keepEditingButton);

    expect(screen.queryByRole("dialog", { name: "Discard changes?" })).toBeNull();
    expect(globalThis.document.activeElement).toBe(nodeNameInput);
    expect(onClose).not.toHaveBeenCalled();
  });

  test("backdrop click and Escape on a dirty modal show discard confirmation instead of closing", async () => {
    const user = userEvent.setup();
    const onClose = mock();
    const node: GraphNode = {
      id: "where-dirty-dismiss",
      kind: "where",
      label: "Filter orders",
      position: { x: 0, y: 0 },
      data: {
        predicate: "status = 'paid'",
      },
    };

    renderModal({ node, onClose });

    await user.clear(screen.getByLabelText("Node name"));
    await user.type(screen.getByLabelText("Node name"), "Paid orders");

    await user.click(screen.getByTestId("node-editor-backdrop"));
    expect(screen.getByRole("dialog", { name: "Discard changes?" })).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.getByRole("dialog", { name: "Discard changes?" })).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
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

  test("preserves raw expression text (no trimming) when saving select mappings", async () => {
    const user = userEvent.setup();
    const onSave = mock();

    const node: GraphNode = {
      id: "select-preserve-expression",
      kind: "select",
      label: "Project",
      position: { x: 0, y: 0 },
      data: {
        mappings: [{ name: "gross_total", expression: " ( " }],
      },
    };

    renderModal({ node, onSave });

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalled();
    expect(onSave.mock.calls[0][0].data.mappings).toEqual([
      { name: "gross_total", expression: " ( " },
    ]);
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

  test("uses inferred upstream schemas for downstream predicate checks even without an output node", () => {
    const document: GraphDocument = {
      version: 1,
      metadata: { name: "Schema inference parity" },
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        {
          id: "in",
          kind: "graphInput",
          label: "Input",
          position: { x: 0, y: 0 },
          data: { columns: { total: "int" } },
        },
        {
          id: "select-1",
          kind: "select",
          label: "Select",
          position: { x: 0, y: 0 },
          data: {
            mappings: [
              // This expression is boolean, so downstream predicates should accept it.
              { name: "is_positive", expression: "total > 0" },
            ],
          },
        },
        {
          id: "where-1",
          kind: "where",
          label: "Where",
          position: { x: 0, y: 0 },
          data: { predicate: "is_positive" },
        },
      ],
      edges: [
        {
          id: "e-in-select",
          source: "in",
          sourceHandle: "out",
          target: "select-1",
          targetHandle: "in",
        },
        {
          id: "e-select-where",
          source: "select-1",
          sourceHandle: "out",
          target: "where-1",
          targetHandle: "in",
        },
      ],
    };

    const whereNode = document.nodes.find((node) => node.id === "where-1") as GraphNode;
    renderModal({ node: whereNode, document });

    expect(screen.queryByText("Predicate must be boolean.")).toBeNull();
  });
});
