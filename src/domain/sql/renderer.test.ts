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
    expect(renderSql(ir)).toBe(
      'SELECT order_id AS "order_id", total AS "gross_total" FROM sales.orders',
    );
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
      'SELECT * FROM (SELECT * FROM (SELECT region AS "region", SUM(total) AS "sum_total" FROM (SELECT * FROM (SELECT * FROM sales.orders INNER JOIN sales.customers ON (orders.customer_id = customers.customer_id)) AS q1 WHERE (status = \'paid\')) AS q2 GROUP BY region) AS q3 ORDER BY sum_total DESC) AS q4 LIMIT 10 OFFSET 5',
    );
  });

  test("renders filter over limit as a valid outer query", () => {
    const ir: IRRelNode = {
      kind: "filter",
      predicateSql: "(status = 'paid')",
      input: {
        kind: "limit",
        count: 5,
        offset: null,
        input: {
          kind: "scan",
          tableSql: "sales.orders",
          schema: {},
        },
      },
    };

    expect(renderSql(ir)).toBe(
      "SELECT * FROM (SELECT * FROM sales.orders LIMIT 5) AS q1 WHERE (status = 'paid')",
    );
  });

  test("omits GROUP BY when aggregate has no grouping keys", () => {
    const ir: IRRelNode = {
      kind: "aggregate",
      groupBy: [],
      aggregates: [{ alias: "sum total", expressionSql: "SUM(total)" }],
      input: {
        kind: "scan",
        tableSql: "sales.orders",
        schema: {},
      },
      schema: {
        "sum total": "float",
      },
    };

    expect(renderSql(ir)).toBe('SELECT SUM(total) AS "sum total" FROM sales.orders');
  });
});
