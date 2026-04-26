import { afterEach, describe, expect, test } from "bun:test";
import { act, cleanup, render, screen } from "@testing-library/react";
import { App } from "./App";

afterEach(cleanup);

describe("App", () => {
  test("renders the QueryVisual shell without an Outputs panel", async () => {
    await act(async () => {
      render(<App />);
    });

    expect(screen.getByText("QueryVisual")).toBeTruthy();
    expect(screen.getByText("Canvas")).toBeTruthy();
    expect(screen.queryByText("Outputs")).toBeNull();
  });
});
