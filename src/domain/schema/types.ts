export type ColumnType =
  | "boolean"
  | "int"
  | "float"
  | "string"
  | "date"
  | "timestamp"
  | "null"
  | "unknown";

export type ColumnMap = Record<string, ColumnType>;

export interface TableRef {
  schemaName?: string;
  tableName: string;
}

export function formatTableRef(tableRef: TableRef) {
  return tableRef.schemaName
    ? `${tableRef.schemaName}.${tableRef.tableName}`
    : tableRef.tableName;
}
