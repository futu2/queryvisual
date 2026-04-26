import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
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
  const keepEditingButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousEditorFocusRef = useRef<HTMLElement | null>(null);
  const shouldRestoreFocusRef = useRef(false);

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

    shouldRestoreFocusRef.current = false;
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
    shouldRestoreFocusRef.current = true;
    setPendingCloseAction(null);
    setShowDiscardDialog(false);
  }

  function handleDiscardChanges() {
    const closeAction = pendingCloseAction ?? onClose;
    shouldRestoreFocusRef.current = false;
    flushSync(() => {
      setPendingCloseAction(null);
      setShowDiscardDialog(false);
    });
    closeAction();
  }

  useEffect(() => {
    if (showDiscardDialog) {
      keepEditingButtonRef.current?.focus();
      return;
    }

    if (!shouldRestoreFocusRef.current) {
      return;
    }

    shouldRestoreFocusRef.current = false;
    previousEditorFocusRef.current?.focus();
  }, [showDiscardDialog]);

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
        role={showDiscardDialog ? undefined : "dialog"}
        aria-modal={showDiscardDialog ? undefined : true}
        aria-label={showDiscardDialog ? undefined : `Edit ${node.kind} node`}
        onFocusCapture={(event) => {
          const target = event.target;
          if (!(target instanceof HTMLElement)) return;
          if (target.closest(".modal-footer")) return;
          if (target.closest(".modal-confirmation-card")) return;
          previousEditorFocusRef.current = target;
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div aria-hidden={showDiscardDialog}>
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
        </div>

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
                  ref={keepEditingButtonRef}
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
