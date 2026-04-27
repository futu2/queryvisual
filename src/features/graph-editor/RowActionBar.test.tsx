import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RowActionBar } from "./RowActionBar";
import { RowCard } from "./RowCard";
import { I18nProvider } from "../i18n/I18nContext";

afterEach(cleanup);

describe("RowActionBar", () => {
  test("renders icon-only controls with required accessible labels and move constraints", () => {
    const onMoveUp = mock();
    const onMoveDown = mock();
    const onDuplicate = mock();
    const onRemove = mock();

    const { container, rerender } = render(
      <I18nProvider deps={{ navigatorLanguage: "zh-CN" }}>
        <RowActionBar
          itemKey="mapping"
          rowNumber={1}
          rowCount={3}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          onDuplicate={onDuplicate}
          onRemove={onRemove}
        />
      </I18nProvider>,
    );

    const moveUp = screen.getByRole("button", { name: "上移 映射 1" });
    const moveDown = screen.getByRole("button", { name: "下移 映射 1" });
    const duplicate = screen.getByRole("button", { name: "复制 映射 1" });
    const remove = screen.getByRole("button", { name: "删除 映射 1" });
    const wrapper = container.querySelector("div");

    expect(wrapper?.classList.contains("row-action-bar")).toBeTrue();
    expect(wrapper?.getAttribute("role")).toBe("group");
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
      <I18nProvider deps={{ navigatorLanguage: "zh-CN" }}>
        <RowActionBar
          itemKey="mapping"
          rowNumber={3}
          rowCount={3}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          onDuplicate={onDuplicate}
          onRemove={onRemove}
        />
      </I18nProvider>,
    );

    expect(
      (screen.getByRole("button", {
        name: "下移 映射 3",
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
      <I18nProvider deps={{ navigatorLanguage: "zh-CN" }}>
        <RowActionBar
          itemKey="field"
          rowNumber={2}
          rowCount={4}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          onDuplicate={onDuplicate}
          onRemove={onRemove}
        />
      </I18nProvider>,
    );

    await user.click(screen.getByRole("button", { name: "上移 字段 2" }));
    await user.click(screen.getByRole("button", { name: "下移 字段 2" }));
    await user.click(screen.getByRole("button", { name: "复制 字段 2" }));
    await user.click(screen.getByRole("button", { name: "删除 字段 2" }));

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
    const dragHandle = screen.getByRole("button", { name: "Drag field 2" });
    expect(section).toBeTruthy();
    expect(section?.getAttribute("draggable")).not.toBe("true");
    expect(dragHandle.getAttribute("draggable")).toBe("true");
    const dragStartEvent = new Event("dragstart", { bubbles: true, cancelable: true });
    const dragOverEvent = new Event("dragover", { bubbles: true, cancelable: true });
    const dropEvent = new Event("drop", { bubbles: true, cancelable: true });

    fireEvent(dragHandle, dragStartEvent);
    fireEvent(section as HTMLElement, dragOverEvent);
    fireEvent(section as HTMLElement, dropEvent);

    expect(onDragStart).toHaveBeenCalledTimes(1);
    expect(onDragOver).toHaveBeenCalledTimes(1);
    expect(onDrop).toHaveBeenCalledTimes(1);
    expect(dragOverEvent.defaultPrevented).toBeTrue();
    expect(dropEvent.defaultPrevented).toBeTrue();
  });

  test("when non-draggable, still delegates drag over/drop callbacks and prevents default", () => {
    const onDragOver = mock();
    const onDrop = mock();

    const { container } = render(
      <RowCard
        dragLabel="Drag field 3"
        onDragOver={onDragOver}
        onDrop={onDrop}
        header={<span>Field 3</span>}
        actions={<span>Actions</span>}
      />,
    );

    const section = container.querySelector("section");
    expect(section).toBeTruthy();
    const dragOverEvent = new Event("dragover", { bubbles: true, cancelable: true });
    const dropEvent = new Event("drop", { bubbles: true, cancelable: true });

    fireEvent(section as HTMLElement, dragOverEvent);
    fireEvent(section as HTMLElement, dropEvent);

    expect(onDragOver).toHaveBeenCalledTimes(1);
    expect(onDrop).toHaveBeenCalledTimes(1);
    expect(dragOverEvent.defaultPrevented).toBeTrue();
    expect(dropEvent.defaultPrevented).toBeTrue();
  });

  test("when draggable, dragging the handle triggers drag-start callback once", () => {
    const onDragStart = mock();

    render(
      <RowCard
        dragLabel="Drag field 4"
        draggable
        onDragStart={onDragStart}
        header={<span>Field 4</span>}
        actions={<span>Actions</span>}
      />,
    );

    const dragHandle = screen.getByRole("button", { name: "Drag field 4" });
    expect(dragHandle.getAttribute("draggable")).toBe("true");
    const dragStartEvent = new Event("dragstart", { bubbles: true, cancelable: true });
    fireEvent(dragHandle, dragStartEvent);

    expect(onDragStart).toHaveBeenCalledTimes(1);
  });

  test("when draggable, ending a handle drag triggers drag-end callback once", () => {
    const onDragEnd = mock();

    render(
      <RowCard
        dragLabel="Drag field 5"
        draggable
        onDragEnd={onDragEnd}
        header={<span>Field 5</span>}
        actions={<span>Actions</span>}
      />,
    );

    const dragHandle = screen.getByRole("button", { name: "Drag field 5" });
    const dragEndEvent = new Event("dragend", { bubbles: true, cancelable: true });
    fireEvent(dragHandle, dragEndEvent);

    expect(onDragEnd).toHaveBeenCalledTimes(1);
  });
});
