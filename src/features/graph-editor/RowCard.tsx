import type { DragEventHandler, ReactNode } from "react";

type RowCardProps = {
  dragLabel: string;
  testId?: string;
  draggable?: boolean;
  onDragStart?: DragEventHandler<HTMLElement>;
  onDragEnd?: DragEventHandler<HTMLElement>;
  onDragOver?: DragEventHandler<HTMLElement>;
  onDrop?: DragEventHandler<HTMLElement>;
  isDragging?: boolean;
  header: ReactNode;
  actions: ReactNode;
  children?: ReactNode;
};

function DragHandleIcon() {
  return (
    <svg
      className="row-drag-handle-icon"
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 12 18"
    >
      <circle cx="3" cy="3" r="1.4" />
      <circle cx="9" cy="3" r="1.4" />
      <circle cx="3" cy="9" r="1.4" />
      <circle cx="9" cy="9" r="1.4" />
      <circle cx="3" cy="15" r="1.4" />
      <circle cx="9" cy="15" r="1.4" />
    </svg>
  );
}

export function RowCard({
  dragLabel,
  testId,
  draggable = false,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  isDragging = false,
  header,
  actions,
  children,
}: RowCardProps) {
  const handleDragOver: DragEventHandler<HTMLElement> = (event) => {
    event.preventDefault();
    onDragOver?.(event);
  };

  const handleDrop: DragEventHandler<HTMLElement> = (event) => {
    event.preventDefault();
    onDrop?.(event);
  };

  return (
    <section
      data-testid={testId}
      className={isDragging ? "row-card row-card--dragging" : "row-card"}
      onDragOver={onDragOver ? handleDragOver : undefined}
      onDrop={onDrop ? handleDrop : undefined}
    >
      <div className="row-card-header">
        <button
          className="row-drag-handle"
          type="button"
          aria-label={dragLabel}
          tabIndex={-1}
          draggable={draggable}
          onDragStart={draggable ? onDragStart : undefined}
          onDragEnd={draggable ? onDragEnd : undefined}
        >
          <DragHandleIcon />
        </button>
        <div className="row-card-title">{header}</div>
        <div className="row-card-actions">{actions}</div>
      </div>
      {children ? <div className="row-card-body">{children}</div> : null}
    </section>
  );
}
