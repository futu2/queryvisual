import type { GraphNode } from "../../domain/document/types";
import { useDocumentContext } from "../../app/state/DocumentContext";
import {
  renderNodeEditor,
  serializeNodeEditorDraft,
  useEditableNode,
} from "./nodeEditors";

export function NodeEditorModal({
  node,
  onClose,
  onSave,
}: {
  node: GraphNode;
  onClose: () => void;
  onSave: (node: GraphNode) => void;
}) {
  const {
    state: { document },
  } = useDocumentContext();
  const { draft, setDraft } = useEditableNode(node);

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <div className="modal-kind">{node.kind}</div>
            <h2>{node.label}</h2>
          </div>
        </header>

        <section className="modal-body">
          {renderNodeEditor(draft, setDraft, document)}
        </section>

        <footer className="modal-footer">
          <button
            type="button"
            className="ghost-button"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="solid-button"
            onClick={() => onSave(serializeNodeEditorDraft(draft))}
          >
            Save
          </button>
        </footer>
      </div>
    </div>
  );
}
