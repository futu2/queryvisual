type RowActionBarProps = {
  itemName: string;
  rowNumber: number;
  rowCount: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
};

export function RowActionBar({
  itemName,
  rowNumber,
  rowCount,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onRemove,
}: RowActionBarProps) {
  return (
    <div className="row-actions" aria-label={`${itemName} ${rowNumber} actions`}>
      <button
        type="button"
        aria-label={`Move ${itemName} ${rowNumber} up`}
        onClick={onMoveUp}
        disabled={rowNumber === 1}
      >
        ↑
      </button>
      <button
        type="button"
        aria-label={`Move ${itemName} ${rowNumber} down`}
        onClick={onMoveDown}
        disabled={rowNumber === rowCount}
      >
        ↓
      </button>
      <button
        type="button"
        aria-label={`Duplicate ${itemName} ${rowNumber}`}
        onClick={onDuplicate}
      >
        ⧉
      </button>
      <button
        type="button"
        aria-label={`Remove ${itemName} ${rowNumber}`}
        onClick={onRemove}
      >
        ✕
      </button>
    </div>
  );
}
