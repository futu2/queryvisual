import { useI18n } from "../i18n/I18nContext";
import type { MessageKey } from "../i18n/types";

type RowActionBarProps = {
  itemKey: "mapping" | "field" | "column" | "groupKey" | "aggregate" | "sortItem";
  rowNumber: number;
  rowCount: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
};

const rowActionItemMessageKeys = {
  mapping: "rowActions.mapping",
  field: "rowActions.field",
  column: "rowActions.column",
  groupKey: "rowActions.groupKey",
  aggregate: "rowActions.aggregate",
  sortItem: "rowActions.sortItem",
} as const satisfies Record<RowActionBarProps["itemKey"], MessageKey>;

export function RowActionBar({
  itemKey,
  rowNumber,
  rowCount,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onRemove,
}: RowActionBarProps) {
  const { t } = useI18n();
  const itemLabel = t(rowActionItemMessageKeys[itemKey]);
  const groupLabel = t("rowActions.group", { item: itemLabel, row: rowNumber });
  const moveUpLabel = t("rowActions.moveUp", { item: itemLabel, row: rowNumber });
  const moveDownLabel = t("rowActions.moveDown", { item: itemLabel, row: rowNumber });
  const duplicateLabel = t("rowActions.duplicate", { item: itemLabel, row: rowNumber });
  const removeLabel = t("rowActions.remove", { item: itemLabel, row: rowNumber });

  return (
    <div
      className="row-action-bar"
      role="group"
      aria-label={groupLabel}
    >
      <button
        className="row-icon-button"
        type="button"
        aria-label={moveUpLabel}
        onClick={onMoveUp}
        disabled={rowNumber === 1}
      >
        ↑
      </button>
      <button
        className="row-icon-button"
        type="button"
        aria-label={moveDownLabel}
        onClick={onMoveDown}
        disabled={rowNumber === rowCount}
      >
        ↓
      </button>
      <button
        className="row-icon-button"
        type="button"
        aria-label={duplicateLabel}
        onClick={onDuplicate}
      >
        ⧉
      </button>
      <button
        className="row-icon-button row-icon-button-danger"
        type="button"
        aria-label={removeLabel}
        onClick={onRemove}
      >
        ✕
      </button>
    </div>
  );
}
