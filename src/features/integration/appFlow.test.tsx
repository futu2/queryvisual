import { afterEach, describe, expect, test } from "bun:test";
import { act, cleanup, render, screen } from "@testing-library/react";
import type { Dispatch } from "react";
import {
  AppLayout,
} from "../../App";
import {
  DocumentProvider,
  useDocumentContext,
} from "../../app/state/DocumentContext";
import type { EditorAction } from "../../app/state/documentReducer";

let dispatch: Dispatch<EditorAction> | null = null;

function DispatchProbe() {
  dispatch = useDocumentContext().dispatch;
  return null;
}

afterEach(cleanup);

describe("App integration", () => {
  test("shows generated SQL for the sample output in the output node modal", async () => {
    render(
      <DocumentProvider>
        <DispatchProbe />
        <AppLayout />
      </DocumentProvider>,
    );

    expect(screen.queryByRole("tab", { name: "SQL" })).toBeNull();

    if (!dispatch) {
      throw new Error("Missing document dispatch");
    }

    await act(async () => {
      dispatch?.({ type: "select-node", nodeId: "output-orders" });
      dispatch?.({ type: "open-node-editor", nodeId: "output-orders" });
    });

    expect(await screen.findByRole("dialog", { name: "Edit output node" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "SQL" })).toBeTruthy();
    expect(screen.getByText(/FROM sales\.orders/i)).toBeTruthy();
  });
});
