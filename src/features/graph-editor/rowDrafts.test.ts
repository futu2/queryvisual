import { describe, expect, test } from "bun:test";
import {
  addDraftRow,
  duplicateDraftRow,
  ensureDraftRows,
  moveDraftRow,
  removeDraftRow,
  stripDraftRows,
  type DraftRow,
} from "./rowDrafts";

type MappingRow = {
  name: string;
  expression: string;
};

function blankMapping(): MappingRow {
  return { name: "", expression: "" };
}

describe("rowDrafts", () => {
  test("re-ensuring already drafted rows preserves stable row ids", () => {
    const firstPass = ensureDraftRows<MappingRow>(
      [
        { name: "a", expression: "1" },
        { name: "b", expression: "2" },
      ],
      blankMapping,
    );

    const secondPass = ensureDraftRows<MappingRow>(firstPass, blankMapping);

    expect(secondPass).toHaveLength(2);
    expect(secondPass[0]?.rowId).toBe(firstPass[0]?.rowId);
    expect(secondPass[1]?.rowId).toBe(firstPass[1]?.rowId);
  });

  test("ensures at least one blank row and strips row ids before save", () => {
    const rows = ensureDraftRows<MappingRow>([], blankMapping);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.rowId).toBeString();
    expect(stripDraftRows(rows)).toEqual([{ name: "", expression: "" }]);
  });

  test("duplicate row gets a fresh row id while preserving field values", () => {
    const rows = ensureDraftRows<MappingRow>(
      [{ name: "gross_total", expression: "sum(total)" }],
      blankMapping,
    );

    const duplicated = duplicateDraftRow(rows, 0, (row) => ({
      name: row.name,
      expression: row.expression,
    }));

    expect(duplicated).toHaveLength(2);
    expect(duplicated[1]?.name).toBe("gross_total");
    expect(duplicated[1]?.expression).toBe("sum(total)");
    expect(duplicated[1]?.rowId).not.toBe(duplicated[0]?.rowId);
  });

  test("move and remove preserve row order semantics and one blank fallback row", () => {
    const rows = ensureDraftRows<MappingRow>(
      [
        { name: "a", expression: "1" },
        { name: "b", expression: "2" },
        { name: "c", expression: "3" },
      ],
      blankMapping,
    );

    const moved = moveDraftRow(rows, 2, 0);
    expect(moved.map((row) => row.name)).toEqual(["c", "a", "b"]);

    const removedToOne = removeDraftRow(
      ensureDraftRows([{ name: "solo", expression: "x" }], blankMapping),
      0,
      blankMapping,
    );

    expect(removedToOne).toHaveLength(1);
    expect(stripDraftRows(removedToOne)).toEqual([{ name: "", expression: "" }]);
  });

  test("addDraftRow appends a blank drafted row with a new row id", () => {
    const rows = ensureDraftRows<MappingRow>(
      [{ name: "existing", expression: "count(*)" }],
      blankMapping,
    );

    const next = addDraftRow(rows, blankMapping);

    expect(next).toHaveLength(2);
    expect(next[0]?.name).toBe("existing");
    expect(next[1]?.name).toBe("");
    expect(next[1]?.expression).toBe("");
    expect(next[1]?.rowId).toBeString();
    expect(next[1]?.rowId).not.toBe(next[0]?.rowId);
  });
});
