import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import type { GraphDocument } from "../../domain/document/types";

// Scope suggestions have a contract: `key` is a stable identifier, while `insertText`
// is the completion text. The real scope builder currently sets them equal, so this
// test file intentionally breaks that equality to ensure ExpressionInput filters by
// `insertText` rather than `key`.
const realExpressionScope = await import("../../domain/graph/expressionScope");
const realBuildExpressionScope = realExpressionScope.buildExpressionScope;

mock.module("../../domain/graph/expressionScope", () => ({
  ...realExpressionScope,
  buildExpressionScope: (
    ...args: Parameters<typeof realExpressionScope.buildExpressionScope>
  ) => {
    const scope = realBuildExpressionScope(...args);
    return {
      ...scope,
      suggestions: scope.suggestions.map((sugg) => ({
        ...sugg,
        key: `stable:${sugg.key}`,
      })),
    };
  },
}));

const { ExpressionInput } = await import("./ExpressionInput");

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

  test("inserts suggestion by replacing the whole token under the caret (mid-token)", async () => {
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
      const [value, setValue] = useState("input.totl");
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

    const input = screen.getByLabelText("Predicate") as HTMLInputElement;
    input.focus();
    // Place caret mid-token: input.t|otl
    input.setSelectionRange("input.t".length, "input.t".length);
    fireEvent.select(input);

    expect(screen.getByRole("button", { name: "Insert input.total" })).toBeTruthy();

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

  test("can require boolean expressions and surfaces non-boolean diagnostics", async () => {
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
        value="1"
        onChange={onChange}
        document={document}
        nodeId="where"
        {...({ requireBoolean: true } as any)}
      />,
    );

    expect(screen.getByText("Predicate must be boolean.")).toBeTruthy();
  });

  test("does not show diagnostics for an empty/pristine expression", async () => {
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
        value=""
        onChange={onChange}
        document={document}
        nodeId="where"
      />,
    );

    expect(screen.queryByLabelText("Diagnostics")).toBeNull();
    expect(screen.queryByText("Expression could not be parsed.")).toBeNull();
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
