import type { DragEventHandler, ReactNode } from "react";

type RowCardProps = {
  dragLabel: string;
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
      className="row-card"
      draggable={draggable}
      onDragStart={draggable ? onDragStart : undefined}
      onDragOver={draggable ? handleDragOver : undefined}
      onDrop={draggable ? handleDrop : undefined}
    >
      <div className="row-card-header">
        <button
          className="row-drag-handle"
          type="button"
          aria-label={dragLabel}
          tabIndex={-1}
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
