import { describe, expect, test } from "bun:test";
import { createSampleDocument } from "../document/sample";
import { validateOutput } from "../graph/validate";
import { lowerOutputToIr } from "../ir/lower";
import { optimizeOutput } from "../ir/optimize";
import type { IRRelNode } from "../ir/types";
import { renderSql } from "./renderer";

describe("renderSql", () => {
  test("renders the sample select query", () => {
    const semantic = validateOutput(createSampleDocument(), "output-orders");
    const ir = optimizeOutput(lowerOutputToIr(semantic)!);
    const sql = renderSql(ir);

    expect(sql).toContain("SELECT");
    expect(sql).toContain("gross_total");
    expect(sql).toContain("FROM sales.orders");
  });

  test("renders nested join aggregate sort and limit queries", () => {
    const ir: IRRelNode = {
      kind: "limit",
      count: 10,
      offset: 5,
      input: {
        kind: "sort",
        items: [{ expressionSql: "sum_total", direction: "desc" }],
        input: {
          kind: "aggregate",
          groupBy: [{ alias: "region", expressionSql: "region" }],
          aggregates: [{ alias: "sum_total", expressionSql: "SUM(total)" }],
          input: {
            kind: "filter",
            predicateSql: "(status = 'paid')",
            input: {
              kind: "join",
              joinType: "inner",
              predicateSql: "(orders.customer_id = customers.customer_id)",
              left: {
                kind: "scan",
                tableSql: "sales.orders",
                schema: {},
              },
              right: {
                kind: "scan",
                tableSql: "sales.customers",
                schema: {},
              },
              schema: {},
            },
          },
          schema: {
            region: "string",
            sum_total: "float",
          },
        },
      },
    };

    expect(renderSql(ir)).toBe(
      "SELECT region AS region, SUM(total) AS sum_total FROM (SELECT * FROM sales.orders INNER JOIN sales.customers ON (orders.customer_id = customers.customer_id) WHERE (status = 'paid')) GROUP BY region ORDER BY sum_total DESC LIMIT 10 OFFSET 5",
    );
  });
});
