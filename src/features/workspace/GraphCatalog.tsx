import { useMemo, useState } from "react";
import { useDocumentContext } from "../../app/state/DocumentContext";
import { collectReferencedGraphIds } from "../../domain/workspace/dependencies";
import { useI18n } from "../i18n/I18nContext";

export function GraphCatalog({
  runGraphMutation,
}: {
  runGraphMutation?: (action: () => void) => void;
}) {
  const { state, dispatch } = useDocumentContext();
  const { t } = useI18n();
  const { graphs } = state.workspace;
  const transition = runGraphMutation ?? ((action: () => void) => action());
  const [deleteBlockedGraphId, setDeleteBlockedGraphId] = useState<string | null>(
    null,
  );
  const referencedGraphIds = useMemo(() => {
    const ids = new Set<string>();

    for (const graph of graphs) {
      for (const referencedGraphId of collectReferencedGraphIds(graph)) {
        ids.add(referencedGraphId);
      }
    }

    return ids;
  }, [graphs]);

  return (
    <section className="graph-catalog" aria-label={t("graphCatalog.title")}>
      <div className="graph-catalog__header">
        <h2>{t("graphCatalog.title")}</h2>
        <button
          className="ghost-button"
          type="button"
          onClick={() => transition(() => dispatch({ type: "create-graph" }))}
        >
          {t("graphCatalog.newGraph")}
        </button>
      </div>
      <div className="graph-catalog__list">
        {graphs.map((graph) => {
          const isActive = graph.id === state.activeGraphId;
          const canDelete = graphs.length > 1;
          const isReferenced = referencedGraphIds.has(graph.id);
          const showDeleteBlockedMessage =
            deleteBlockedGraphId === graph.id && isReferenced;

          return (
            <div
              key={graph.id}
              className="graph-catalog__item"
              data-testid={`graph-catalog-item-${graph.id}`}
            >
              <label className="graph-catalog__name-field">
                <span className="sr-only">{t("graphCatalog.graphNameSrOnly")}</span>
                <input
                  aria-label={t("graphCatalog.graphNameLabel", {
                    name: graph.metadata.name,
                  })}
                  value={graph.metadata.name}
                  onChange={(event) =>
                    dispatch({
                      type: "rename-graph",
                      graphId: graph.id,
                      name: event.target.value,
                    })
                  }
                />
              </label>
              <div className="graph-catalog__item-actions">
                {isActive ? (
                  <span className="graph-catalog__active-pill">
                    {t("graphCatalog.active")}
                  </span>
                ) : (
                  <button
                    className="ghost-button"
                    type="button"
                    aria-label={t("graphCatalog.openNamed", {
                      name: graph.metadata.name,
                    })}
                    onClick={() => {
                      transition(() =>
                        dispatch({ type: "set-active-graph", graphId: graph.id }),
                      );
                    }}
                  >
                    {t("graphCatalog.open")}
                  </button>
                )}
                <button
                  className="ghost-button graph-catalog__delete-button"
                  type="button"
                  aria-label={t("graphCatalog.deleteNamed", {
                    name: graph.metadata.name,
                  })}
                  onClick={() => {
                    if (isReferenced) {
                      setDeleteBlockedGraphId(graph.id);
                      return;
                    }

                    setDeleteBlockedGraphId(null);
                    if (isActive) {
                      transition(() =>
                        dispatch({ type: "delete-graph", graphId: graph.id }),
                      );
                      return;
                    }

                    dispatch({ type: "delete-graph", graphId: graph.id });
                  }}
                  disabled={!canDelete}
                >
                  {t("graphCatalog.delete")}
                </button>
              </div>
              {showDeleteBlockedMessage ? (
                <p className="graph-catalog__error" role="alert">
                  {t("graphCatalog.deleteBlocked")}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
