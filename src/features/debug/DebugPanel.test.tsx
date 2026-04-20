import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { compileOutput } from "../../domain/compile/compileOutput";
import { createSampleDocument } from "../../domain/document/sample";
import { DebugPanel } from "./DebugPanel";

afterEach(cleanup);

describe("DebugPanel", () => {
  test("shows generated SQL in the SQL tab", () => {
    const result = compileOutput(createSampleDocument(), "output-orders");
    render(
      <DebugPanel
        result={result}
        outputs={[{ id: "output-orders", name: "orders_report" }]}
        activeOutputId="output-orders"
        onSelectOutput={() => {}}
      />,
    );

    expect(screen.getByRole("tab", { name: "SQL" })).toBeTruthy();
    expect(screen.getByText(/SELECT/i)).toBeTruthy();
  });
});
