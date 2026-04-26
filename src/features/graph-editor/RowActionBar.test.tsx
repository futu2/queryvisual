import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RowActionBar } from "./RowActionBar";
import { RowCard } from "./RowCard";

afterEach(cleanup);

describe("RowActionBar", () => {
  test("renders icon-only controls with required accessible labels and move constraints", () => {
    const onMoveUp = mock();
    const onMoveDown = mock();
    const onDuplicate = mock();
    const onRemove = mock();

    const { container, rerender } = render(
      <RowActionBar
        itemName="mapping"
        rowNumber={1}
        rowCount={3}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        onDuplicate={onDuplicate}
        onRemove={onRemove}
      />,
    );

    const moveUp = screen.getByRole("button", { name: "Move mapping 1 up" });
    const moveDown = screen.getByRole("button", { name: "Move mapping 1 down" });
    const duplicate = screen.getByRole("button", { name: "Duplicate mapping 1" });
    const remove = screen.getByRole("button", { name: "Remove mapping 1" });
    const wrapper = container.querySelector("div");

    expect(wrapper?.classList.contains("row-action-bar")).toBeTrue();
    expect(moveUp.classList.contains("row-icon-button")).toBeTrue();
    expect(moveDown.classList.contains("row-icon-button")).toBeTrue();
    expect(duplicate.classList.contains("row-icon-button")).toBeTrue();
    expect(remove.classList.contains("row-icon-button")).toBeTrue();
    expect(remove.classList.contains("row-icon-button-danger")).toBeTrue();
    expect((moveUp as HTMLButtonElement).disabled).toBeTrue();
    expect((moveDown as HTMLButtonElement).disabled).toBeFalse();
    expect(duplicate.textContent?.trim().length).toBeGreaterThan(0);
    expect(remove.textContent?.trim().length).toBeGreaterThan(0);
    expect((duplicate.textContent ?? "").toLowerCase()).not.toContain("duplicate");
    expect((remove.textContent ?? "").toLowerCase()).not.toContain("remove");

    rerender(
      <RowActionBar
        itemName="mapping"
        rowNumber={3}
        rowCount={3}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        onDuplicate={onDuplicate}
        onRemove={onRemove}
      />,
    );

    expect(
      (screen.getByRole("button", {
        name: "Move mapping 3 down",
      }) as HTMLButtonElement).disabled,
    ).toBeTrue();
  });

  test("wires callbacks correctly", async () => {
    const user = userEvent.setup();
    const onMoveUp = mock();
    const onMoveDown = mock();
    const onDuplicate = mock();
    const onRemove = mock();

    render(
      <RowActionBar
        itemName="field"
        rowNumber={2}
        rowCount={4}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        onDuplicate={onDuplicate}
        onRemove={onRemove}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Move field 2 up" }));
    await user.click(screen.getByRole("button", { name: "Move field 2 down" }));
    await user.click(screen.getByRole("button", { name: "Duplicate field 2" }));
    await user.click(screen.getByRole("button", { name: "Remove field 2" }));

    expect(onMoveUp).toHaveBeenCalledTimes(1);
    expect(onMoveDown).toHaveBeenCalledTimes(1);
    expect(onDuplicate).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});

describe("RowCard", () => {
  test("renders row card shell with drag handle, header slot, actions slot, and optional body", () => {
    const { rerender } = render(
      <RowCard
        dragLabel="Drag mapping 1"
        header={<strong>Mapping 1</strong>}
        actions={<button type="button">Action slot</button>}
      >
        <div>Body content</div>
      </RowCard>,
    );

    const dragHandle = screen.getByRole("button", { name: "Drag mapping 1" });
    expect(dragHandle.getAttribute("tabindex")).toBe("-1");
    expect(dragHandle.classList.contains("row-drag-handle")).toBeTrue();
    expect(screen.getByText("Mapping 1")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Action slot" })).toBeTruthy();
    expect(screen.getByText("Body content")).toBeTruthy();

    rerender(
      <RowCard
        dragLabel="Drag mapping 1"
        header={<strong>Mapping 1</strong>}
        actions={<button type="button">Action slot</button>}
      />,
    );

    expect(screen.queryByText("Body content")).toBeNull();
  });

  test("when draggable, prevents default on drag over/drop and delegates drag callbacks", () => {
    const onDragStart = mock();
    const onDragOver = mock();
    const onDrop = mock();

    const { container } = render(
      <RowCard
        dragLabel="Drag field 2"
        draggable
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
        header={<span>Field 2</span>}
        actions={<span>Actions</span>}
      />,
    );

    const section = container.querySelector("section");
    expect(section).toBeTruthy();
    const dragStartEvent = new Event("dragstart", { bubbles: true, cancelable: true });
    const dragOverEvent = new Event("dragover", { bubbles: true, cancelable: true });
    const dropEvent = new Event("drop", { bubbles: true, cancelable: true });

    fireEvent(section as HTMLElement, dragStartEvent);
    fireEvent(section as HTMLElement, dragOverEvent);
    fireEvent(section as HTMLElement, dropEvent);

    expect(onDragStart).toHaveBeenCalledTimes(1);
    expect(onDragOver).toHaveBeenCalledTimes(1);
    expect(onDrop).toHaveBeenCalledTimes(1);
    expect(dragOverEvent.defaultPrevented).toBeTrue();
    expect(dropEvent.defaultPrevented).toBeTrue();
  });
});
