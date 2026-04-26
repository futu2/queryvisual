import { afterEach, describe, expect, test } from "bun:test";
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen, within } from "@testing-library/react";
import { DocumentProvider } from "../../app/state/DocumentContext";
import { createSampleWorkspace } from "../../domain/workspace/sample";
import { GraphCatalog } from "./GraphCatalog";

afterEach(cleanup);

function getGraphRowByName(name: string) {
  const input = screen.getByDisplayValue(name);
  const row = input.closest('[data-testid^="graph-catalog-item-"]');
  if (!row) {
    throw new Error(`Missing row for graph ${name}`);
  }

  return row as HTMLElement;
}

describe("GraphCatalog", () => {
  test("creates, renames, and switches graphs through the catalog", async () => {
    const user = userEvent.setup();

    render(
      <DocumentProvider initialWorkspace={createSampleWorkspace()}>
        <GraphCatalog />
      </DocumentProvider>,
    );

    expect(screen.getAllByLabelText(/Graph name/i)).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "New graph" }));

    expect(screen.getAllByLabelText(/Graph name/i)).toHaveLength(2);

    const graphNameInputs = screen.getAllByLabelText(
      /Graph name/i,
    ) as HTMLInputElement[];
    const newGraphNameInput = graphNameInputs[1];
    await user.clear(newGraphNameInput);
    await user.type(newGraphNameInput, "Segmented Revenue");

    const newGraphRow = getGraphRowByName("Segmented Revenue");
    expect(within(newGraphRow).getByText("Active")).toBeTruthy();

    const originalGraphRow = getGraphRowByName("Orders Sample");
    await user.click(within(originalGraphRow).getByRole("button", { name: "Open" }));
    expect(within(originalGraphRow).getByText("Active")).toBeTruthy();

    const renamedRow = getGraphRowByName("Segmented Revenue");
    await user.click(within(renamedRow).getByRole("button", { name: "Open" }));
    expect(within(renamedRow).getByText("Active")).toBeTruthy();
  });
});
