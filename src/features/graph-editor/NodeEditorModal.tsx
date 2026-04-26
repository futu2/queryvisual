import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import type { GraphNode } from "../../domain/document/types";
import { useDocumentContext } from "../../app/state/DocumentContext";
import { inferNodeSchemas } from "../../domain/graph/inferSchemas";
import {
  renderNodeEditor,
  serializeNodeEditorDraft,
  useEditableNode,
} from "./nodeEditors";

export type NodeEditorModalHandle = {
  requestClose: (closeAction?: () => void) => void;
};

type NodeEditorModalProps = {
  node: GraphNode;
  onClose: () => void;
  onSave: (node: GraphNode) => void;
};

export const NodeEditorModal = forwardRef<NodeEditorModalHandle, NodeEditorModalProps>(
function NodeEditorModal({
  node,
  onClose,
  onSave,
}, ref) {
  const {
    state: { document: graphDocument },
  } = useDocumentContext();
  const { draft, setDraft } = useEditableNode(node);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const [pendingCloseAction, setPendingCloseAction] = useState<(() => void) | null>(
    null,
  );

  const schemaOverrides = useMemo(
    () => inferNodeSchemas(graphDocument, node.id),
    [graphDocument, node.id],
  );
  const serializedDraft = useMemo(() => serializeNodeEditorDraft(draft), [draft]);
  const isDirty = useMemo(
    () => JSON.stringify(serializedDraft) !== JSON.stringify(node),
    [node, serializedDraft],
  );

  function requestClose(closeAction: () => void = onClose) {
    if (!isDirty) {
      closeAction();
      return;
    }

    setPendingCloseAction(() => closeAction);
    setShowDiscardDialog(true);
  }

  useImperativeHandle(
    ref,
    () => ({
      requestClose,
    }),
    [isDirty, onClose],
  );

  function handleKeepEditing() {
    setPendingCloseAction(null);
    setShowDiscardDialog(false);
  }

  function handleDiscardChanges() {
    const closeAction = pendingCloseAction ?? onClose;
    setPendingCloseAction(null);
    closeAction();
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;

      event.preventDefault();
      requestClose();
    }

    globalThis.document.addEventListener("keydown", handleKeyDown);
    return () =>
      globalThis.document.removeEventListener("keydown", handleKeyDown);
  }, [isDirty, onClose]);

  return (
    <div
      className="modal-backdrop"
      data-testid="node-editor-backdrop"
      role="presentation"
      onClick={() => requestClose()}
    >
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label={`Edit ${node.kind} node`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <div className="modal-kind">{node.kind}</div>
            <label className="modal-title-field">
              <span className="sr-only">Node name</span>
              <input
                aria-label="Node name"
                className="modal-title-input"
                value={draft.label}
                onChange={(event) =>
                  setDraft({ ...draft, label: event.target.value })
                }
              />
            </label>
          </div>
        </header>

        <section className="modal-body">
          {renderNodeEditor(draft, setDraft, graphDocument, schemaOverrides)}
        </section>

        <footer className="modal-footer">
          <button
            type="button"
            className="ghost-button"
            onClick={() => requestClose()}
          >
            Cancel
          </button>
          <button
            type="button"
            className="solid-button"
            onClick={() => onSave(serializedDraft)}
          >
            Save
          </button>
        </footer>

        {showDiscardDialog ? (
          <div className="modal-confirmation-scrim">
            <div
              className="modal-confirmation-card"
              role="dialog"
              aria-modal="true"
              aria-label="Discard changes?"
            >
              <h3>Discard changes?</h3>
              <p>Your unsaved edits will be lost.</p>
              <div className="modal-confirmation-actions">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={handleKeepEditing}
                >
                  Keep editing
                </button>
                <button
                  type="button"
                  className="solid-button"
                  onClick={handleDiscardChanges}
                >
                  Discard changes
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
});
