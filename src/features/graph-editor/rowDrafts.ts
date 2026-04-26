export type DraftRow<T> = T & {
  rowId: string;
};

function createRowId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `row-${Math.random().toString(36).slice(2, 10)}`;
}

function withRowId<T extends object>(row: T): DraftRow<T> {
  return { ...row, rowId: createRowId() };
}

export function ensureDraftRows<T extends object>(
  rows: T[],
  createBlank: () => T,
): DraftRow<T>[] {
  const source = rows.length > 0 ? rows : [createBlank()];
  return source.map(withRowId);
}

export function addDraftRow<T extends object>(
  rows: DraftRow<T>[],
  createBlank: () => T,
) {
  return [...rows, withRowId(createBlank())];
}

export function moveDraftRow<T extends object>(
  rows: DraftRow<T>[],
  fromIndex: number,
  toIndex: number,
) {
  if (
    fromIndex < 0 ||
    fromIndex >= rows.length ||
    toIndex < 0 ||
    toIndex >= rows.length ||
    fromIndex === toIndex
  ) {
    return rows;
  }

  const next = [...rows];
  const [moved] = next.splice(fromIndex, 1);
  if (!moved) return rows;
  next.splice(toIndex, 0, moved);
  return next;
}

export function duplicateDraftRow<T extends object>(
  rows: DraftRow<T>[],
  index: number,
  cloneRow: (row: DraftRow<T>) => T,
) {
  const source = rows[index];
  if (!source) return rows;

  return [
    ...rows.slice(0, index + 1),
    withRowId(cloneRow(source)),
    ...rows.slice(index + 1),
  ];
}

export function removeDraftRow<T extends object>(
  rows: DraftRow<T>[],
  index: number,
  createBlank: () => T,
) {
  const next = rows.filter((_, rowIndex) => rowIndex !== index);
  return next.length > 0 ? next : [withRowId(createBlank())];
}

export function stripDraftRows<T extends object>(rows: DraftRow<T>[]): T[] {
  return rows.map(({ rowId: _rowId, ...rest }) => rest as T);
}
