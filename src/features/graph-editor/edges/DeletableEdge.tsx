import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type Edge,
  type EdgeProps,
} from "@xyflow/react";
import { useRef, useState } from "react";
import { useI18n } from "../../i18n/I18nContext";

export interface DeletableEdgeData extends Record<string, unknown> {
  onDelete: (edgeId: string) => void;
}

export function DeletableEdge({
  id,
  data,
  selected,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
}: EdgeProps<Edge<DeletableEdgeData, "deletableEdge">>) {
  const { t } = useI18n();
  const [isHovered, setIsHovered] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  return (
    <>
      <BaseEdge id={id} path={path} />
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={24}
        className="deletable-edge__hitbox"
        data-testid="deletable-edge-hitbox"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={(event) => {
          if (event.relatedTarget === buttonRef.current) {
            return;
          }

          setIsHovered(false);
        }}
      />
      {selected || isHovered ? (
        <EdgeLabelRenderer>
          <button
            ref={buttonRef}
            type="button"
            className="deletable-edge__button nopan nodrag"
            style={{
              pointerEvents: "all",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
            aria-label={t("edge.delete")}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onClick={(event) => {
              event.stopPropagation();
              data?.onDelete(id);
            }}
          >
            x
          </button>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
