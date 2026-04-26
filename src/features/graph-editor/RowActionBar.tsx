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
    <div className="row-action-bar" aria-label={`${itemName} ${rowNumber} actions`}>
      <button
        className="row-icon-button"
        type="button"
        aria-label={`Move ${itemName} ${rowNumber} up`}
        onClick={onMoveUp}
        disabled={rowNumber === 1}
      >
        ↑
      </button>
      <button
        className="row-icon-button"
        type="button"
        aria-label={`Move ${itemName} ${rowNumber} down`}
        onClick={onMoveDown}
        disabled={rowNumber === rowCount}
      >
        ↓
      </button>
      <button
        className="row-icon-button"
        type="button"
        aria-label={`Duplicate ${itemName} ${rowNumber}`}
        onClick={onDuplicate}
      >
        ⧉
      </button>
      <button
        className="row-icon-button row-icon-button-danger"
        type="button"
        aria-label={`Remove ${itemName} ${rowNumber}`}
        onClick={onRemove}
      >
        ✕
      </button>
    </div>
  );
}
