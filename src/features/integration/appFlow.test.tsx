import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { App } from "../../App";

afterEach(cleanup);

describe("App integration", () => {
  test("shows generated SQL for the sample output", () => {
    render(<App />);

    expect(screen.getByRole("tab", { name: "SQL" })).toBeTruthy();
    expect(screen.getByText(/FROM sales\.orders/i)).toBeTruthy();
  });
});
