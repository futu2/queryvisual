import { describe, expect, test } from "bun:test";
import { parseExpression } from "./parser";

describe("parseExpression", () => {
  test("parses arithmetic precedence", () => {
    const parsed = parseExpression("total * 1.2 + 5");

    expect(parsed.kind).toBe("binary");
    expect(parsed.op).toBe("+");
  });

  test("parses function calls", () => {
    const parsed = parseExpression("coalesce(total, 0)");

    expect(parsed.kind).toBe("call");
    expect(parsed.name).toBe("coalesce");
    expect(parsed.args).toHaveLength(2);
  });

  test("parses case expressions", () => {
    const parsed = parseExpression(
      "case when status = 'paid' then total else 0 end",
    );

    expect(parsed.kind).toBe("case");
    expect(parsed.branches).toHaveLength(1);
  });

  test("throws on invalid characters", () => {
    expect(() => parseExpression("1 $ 2")).toThrow();
  });

  test("throws on malformed numeric tokenization", () => {
    expect(() => parseExpression("1.2.3")).toThrow();
  });

  test("throws on malformed function calls", () => {
    expect(() => parseExpression("coalesce(total,)")).toThrow();
  });

  test("throws on malformed case expressions", () => {
    expect(() => parseExpression("case end")).toThrow();
  });

  test("throws on invalid cast target types", () => {
    expect(() => parseExpression("cast(total as nonsense)")).toThrow();
  });
});
