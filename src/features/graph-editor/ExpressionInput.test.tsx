import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import type { GraphDocument } from "../../domain/document/types";
import { ExpressionInput } from "./ExpressionInput";

afterEach(cleanup);

function makeBaseDocument(): GraphDocument {
  return {
    version: 1,
    metadata: { name: "Test" },
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [],
    edges: [],
  };
}

describe("ExpressionInput", () => {
  test('suggests from scope using current prefix in single-input scope ("inp" -> "input." / "input.total")', async () => {
    const user = userEvent.setup();

    const document: GraphDocument = {
      ...makeBaseDocument(),
      nodes: [
        {
          id: "in",
          kind: "graphInput",
          label: "Input",
          position: { x: 0, y: 0 },
          data: { columns: { total: "int" } },
        },
        {
          id: "where",
          kind: "where",
          label: "Where",
          position: { x: 0, y: 0 },
          data: { predicate: "" },
        },
      ],
      edges: [
        {
          id: "e1",
          source: "in",
          sourceHandle: "out",
          target: "where",
          targetHandle: "in",
        },
      ],
    };

    function Harness() {
      const [value, setValue] = useState("");
      return (
        <ExpressionInput
          label="Predicate"
          value={value}
          onChange={setValue}
          document={document}
          nodeId="where"
        />
      );
    }

    render(<Harness />);

    await user.type(screen.getByLabelText("Predicate"), "inp");

    expect(screen.getByRole("button", { name: "Insert input." })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Insert input.total" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Insert total" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Insert input.total" }));
    expect((screen.getByLabelText("Predicate") as HTMLInputElement).value).toBe(
      "input.total",
    );
  });

  test('suggests join namespaces from scope ("le" -> "left." / "left.id", no ambiguous bare "id")', async () => {
    const user = userEvent.setup();

    const document: GraphDocument = {
      ...makeBaseDocument(),
      nodes: [
        {
          id: "l",
          kind: "graphInput",
          label: "Left",
          position: { x: 0, y: 0 },
          data: { columns: { id: "int" } },
        },
        {
          id: "r",
          kind: "graphInput",
          label: "Right",
          position: { x: 0, y: 0 },
          data: { columns: { id: "int" } },
        },
        {
          id: "j",
          kind: "join",
          label: "Join",
          position: { x: 0, y: 0 },
          data: { joinType: "inner", predicate: "" },
        },
      ],
      edges: [
        {
          id: "e-left",
          source: "l",
          sourceHandle: "out",
          target: "j",
          targetHandle: "left",
        },
        {
          id: "e-right",
          source: "r",
          sourceHandle: "out",
          target: "j",
          targetHandle: "right",
        },
      ],
    };

    function Harness() {
      const [value, setValue] = useState("");
      return (
        <ExpressionInput
          label="Join predicate"
          value={value}
          onChange={setValue}
          document={document}
          nodeId="j"
        />
      );
    }

    render(<Harness />);

    await user.type(screen.getByLabelText("Join predicate"), "le");

    expect(screen.getByRole("button", { name: "Insert left." })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Insert left.id" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Insert id" })).toBeNull();
  });

  test("renders inline diagnostics for invalid expressions", async () => {
    const document: GraphDocument = {
      ...makeBaseDocument(),
      nodes: [
        {
          id: "in",
          kind: "graphInput",
          label: "Input",
          position: { x: 0, y: 0 },
          data: { columns: { total: "int" } },
        },
        {
          id: "where",
          kind: "where",
          label: "Where",
          position: { x: 0, y: 0 },
          data: { predicate: "" },
        },
      ],
      edges: [
        {
          id: "e1",
          source: "in",
          sourceHandle: "out",
          target: "where",
          targetHandle: "in",
        },
      ],
    };

    const onChange = mock();
    render(
      <ExpressionInput
        label="Predicate"
        value="("
        onChange={onChange}
        document={document}
        nodeId="where"
        multiline
      />,
    );

    expect(screen.getByText("Expression could not be parsed.")).toBeTruthy();
  });
});
