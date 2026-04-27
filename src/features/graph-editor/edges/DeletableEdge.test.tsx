import { afterEach, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

mock.module("@xyflow/react", () => ({
  BaseEdge: () => <div data-testid="base-edge" />,
  EdgeLabelRenderer: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  getBezierPath: () => ["M0,0 L100,0", 50, 0],
}));

const { DeletableEdge } = await import("./DeletableEdge");
const { I18nProvider } = await import("../../i18n/I18nContext");

afterEach(() => {
  cleanup();
});

test("shows a delete button when hovered and calls onDelete with the edge id", async () => {
  const onDelete = mock();

  render(
    <I18nProvider deps={{ navigatorLanguage: "zh-CN" }}>
      <DeletableEdge
        id="edge-select-output"
        sourceX={0}
        sourceY={0}
        targetX={100}
        targetY={0}
        sourcePosition="right"
        targetPosition="left"
        data={{ onDelete }}
        selected={false}
      />
    </I18nProvider>,
  );

  expect(screen.queryByRole("button", { name: "删除连线" })).toBeNull();

  fireEvent.mouseEnter(screen.getByTestId("deletable-edge-hitbox"));
  const deleteButton = screen.getByRole("button", { name: "删除连线" });

  expect(deleteButton.className).toContain("nopan");
  expect(deleteButton.className).toContain("nodrag");
  expect(deleteButton.style.pointerEvents).toBe("all");

  fireEvent.click(deleteButton);

  expect(onDelete).toHaveBeenCalledWith("edge-select-output");
});

test("keeps the delete button visible while the edge is selected", () => {
  render(
    <I18nProvider deps={{ navigatorLanguage: "zh-CN" }}>
      <DeletableEdge
        id="edge-selected"
        sourceX={0}
        sourceY={0}
        targetX={100}
        targetY={0}
        sourcePosition="right"
        targetPosition="left"
        data={{ onDelete: () => {} }}
        selected
      />
    </I18nProvider>,
  );

  const deleteButton = screen.getByRole("button", { name: "删除连线" });

  expect(deleteButton.className).toContain("nopan");
  expect(deleteButton.className).toContain("nodrag");
  expect(deleteButton.style.pointerEvents).toBe("all");
});
