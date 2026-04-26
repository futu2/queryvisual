import type { DragEventHandler, ReactNode } from "react";

type RowCardProps = {
  dragLabel: string;
  testId?: string;
  draggable?: boolean;
  onDragStart?: DragEventHandler<HTMLElement>;
  onDragOver?: DragEventHandler<HTMLElement>;
  onDrop?: DragEventHandler<HTMLElement>;
  header: ReactNode;
  actions: ReactNode;
  children?: ReactNode;
};

export function RowCard({
  dragLabel,
  testId,
  draggable = false,
  onDragStart,
  onDragOver,
  onDrop,
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
      className="row-card"
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
        >
          ⋮⋮
        </button>
        <div className="row-card-title">{header}</div>
        <div className="row-card-actions">{actions}</div>
      </div>
      {children ? <div className="row-card-body">{children}</div> : null}
    </section>
  );
}
