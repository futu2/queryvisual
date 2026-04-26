import { useDocumentContext } from "../../app/state/DocumentContext";

export function GraphCatalog({
  runGraphMutation,
}: {
  runGraphMutation?: (action: () => void) => void;
}) {
  const { state, dispatch } = useDocumentContext();
  const { graphs } = state.workspace;
  const transition = runGraphMutation ?? ((action: () => void) => action());

  return (
    <section className="graph-catalog" aria-label="Graph catalog">
      <div className="graph-catalog__header">
        <h2>Graphs</h2>
        <button
          className="ghost-button"
          type="button"
          onClick={() => transition(() => dispatch({ type: "create-graph" }))}
        >
          New graph
        </button>
      </div>
      <div className="graph-catalog__list">
        {graphs.map((graph) => {
          const isActive = graph.id === state.activeGraphId;
          const canDelete = graphs.length > 1;

          return (
            <div
              key={graph.id}
              className="graph-catalog__item"
              data-testid={`graph-catalog-item-${graph.id}`}
            >
              <label className="graph-catalog__name-field">
                <span className="sr-only">Graph name</span>
                <input
                  aria-label={`Graph name ${graph.metadata.name}`}
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
                  <span className="graph-catalog__active-pill">Active</span>
                ) : (
                  <button
                    className="ghost-button"
                    type="button"
                    aria-label={`Open ${graph.metadata.name}`}
                    onClick={() => {
                      transition(() =>
                        dispatch({ type: "set-active-graph", graphId: graph.id }),
                      );
                    }}
                  >
                    Open
                  </button>
                )}
                <button
                  className="ghost-button graph-catalog__delete-button"
                  type="button"
                  aria-label={`Delete ${graph.metadata.name}`}
                  onClick={() => {
                    transition(() =>
                      dispatch({ type: "delete-graph", graphId: graph.id }),
                    );
                  }}
                  disabled={!canDelete}
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
