import { afterEach, describe, expect, mock, test } from "bun:test";
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/react";
import type { GraphNode } from "../../domain/document/types";
import { NodeEditorModal } from "./NodeEditorModal";

afterEach(cleanup);

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

    render(<NodeEditorModal node={node} onClose={() => {}} onSave={onSave} />);

    await user.clear(screen.getByLabelText("Mapping name 1"));
    await user.type(screen.getByLabelText("Mapping name 1"), "net_total");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalled();
    expect(onSave.mock.calls[0][0].data.mappings[0].name).toBe("net_total");
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

    render(<NodeEditorModal node={node} onClose={onClose} onSave={() => {}} />);

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

    render(<NodeEditorModal node={node} onClose={() => {}} onSave={onSave} />);

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

    const { rerender } = render(
      <NodeEditorModal node={baseNode} onClose={() => {}} onSave={() => {}} />,
    );

    await user.clear(screen.getByLabelText("Mapping name 1"));
    await user.type(screen.getByLabelText("Mapping name 1"), "net_total");

    rerender(
      <NodeEditorModal
        node={{
          ...baseNode,
          data: {
            mappings: [{ name: "gross_total", expression: "total" }],
          },
        }}
        onClose={() => {}}
        onSave={() => {}}
      />,
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

    const { container } = render(
      <NodeEditorModal node={node} onClose={onClose} onSave={onSave} />,
    );

    const backdrop = container.querySelector(".modal-backdrop");
    if (!backdrop) {
      throw new Error("Missing modal backdrop");
    }

    await user.click(backdrop);

    expect(onClose).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });
});
