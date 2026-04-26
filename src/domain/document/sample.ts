import type { GraphDocument } from "./types";
import { createDefaultOutputListenerConfig } from "./outputListeners";

export function createSampleDocument(): GraphDocument {
  return {
    version: 1,
    metadata: {
      name: "Orders Sample",
    },
    viewport: {
      x: 0,
      y: 0,
      zoom: 1,
    },
    nodes: [
      {
        id: "from-orders",
        kind: "fromTable",
        label: "Orders",
        position: { x: 120, y: 140 },
        data: {
          tableRef: { schemaName: "sales", tableName: "orders" },
          columns: {
            order_id: "int",
            customer_id: "int",
            total: "float",
            status: "string",
          },
        },
      },
      {
        id: "select-orders",
        kind: "select",
        label: "Project",
        position: { x: 420, y: 140 },
        data: {
          mappings: [
            { name: "order_id", expression: "order_id" },
            { name: "gross_total", expression: "total" },
          ],
        },
      },
      {
        id: "output-orders",
        kind: "output",
        label: "Orders Report",
        position: { x: 720, y: 140 },
        data: {
          outputName: "orders_report",
          listeners: createDefaultOutputListenerConfig("orders_report"),
        },
      },
    ],
    edges: [
      {
        id: "edge-from-select",
        source: "from-orders",
        sourceHandle: "out",
        target: "select-orders",
        targetHandle: "in",
      },
      {
        id: "edge-select-output",
        source: "select-orders",
        sourceHandle: "out",
        target: "output-orders",
        targetHandle: "in",
      },
    ],
  };
}
