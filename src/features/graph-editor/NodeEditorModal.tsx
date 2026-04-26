import {
  forwardRef,
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import type { CompileOutputResult } from "../../domain/compile/compileOutput";
import type { GraphNode } from "../../domain/document/types";
import { useDocumentContext } from "../../app/state/DocumentContext";
import { inferNodeSchemas } from "../../domain/graph/inferSchemas";
import {
  renderNodeEditor,
  serializeNodeEditorDraft,
  useEditableNode,
} from "./nodeEditors";
import type { OutputListenerStatus } from "../output-runtime/outputRuntime";

export type NodeEditorModalHandle = {
  requestClose: (closeAction?: () => void) => void;
};

type NodeEditorModalProps = {
  node: GraphNode;
  outputRuntime?: {
    compileResult: CompileOutputResult | null;
    listenerStatus: OutputListenerStatus | null;
  } | null;
  onClose: () => void;
  onSave: (node: GraphNode) => void;
};

type OutputInspectorTab = "diagnostics" | "semantic" | "ir" | "optimized-ir" | "sql";

function formatRuntimeTimestamp(timestamp: number | null) {
  if (!timestamp) {
    return "Never";
  }

  return new Date(timestamp).toLocaleString();
}

function renderJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function OutputRuntimeInspector({
  compileResult,
  listenerStatus,
}: {
  compileResult: CompileOutputResult | null;
  listenerStatus: OutputListenerStatus | null;
}) {
  const [activeTab, setActiveTab] = useState<OutputInspectorTab>("sql");

  useEffect(() => {
    setActiveTab("sql");
  }, [compileResult, listenerStatus]);

  const tabDefinitions: Array<{ id: OutputInspectorTab; label: string }> = [
    { id: "diagnostics", label: "Diagnostics" },
    { id: "semantic", label: "Semantic" },
    { id: "ir", label: "IR" },
    { id: "optimized-ir", label: "Optimized IR" },
    { id: "sql", label: "SQL" },
  ];
  const diagnostics = compileResult?.semantic.diagnostics ?? [];
  const hasRuntimeData = Boolean(compileResult || listenerStatus);

  let tabContent: string;
  if (!hasRuntimeData) {
    tabContent = "No runtime data available yet.";
  } else if (activeTab === "diagnostics") {
    tabContent =
      diagnostics.length > 0
        ? diagnostics.map((diagnostic) => diagnostic.message).join("\n")
        : "No diagnostics.";
  } else if (activeTab === "semantic") {
    tabContent = compileResult ? renderJson(compileResult.semantic) : "No semantic output.";
  } else if (activeTab === "ir") {
    tabContent = compileResult?.ir ? renderJson(compileResult.ir) : "No IR generated.";
  } else if (activeTab === "optimized-ir") {
    tabContent = compileResult?.optimizedIr
      ? renderJson(compileResult.optimizedIr)
      : "No optimized IR generated.";
  } else {
    tabContent = compileResult?.sql.trim()
      ? compileResult.sql
      : "No SQL generated.";
  }

  return (
    <section className="output-runtime-section" aria-label="Output runtime inspection">
      <h3>Output Runtime</h3>
      <div className="output-runtime-status" role="status" aria-live="polite">
        <div>
          <strong>Last run:</strong> {formatRuntimeTimestamp(listenerStatus?.lastRunAt ?? null)}
        </div>
        <div>
          <strong>Last error:</strong> {listenerStatus?.lastErrorMessage ?? "None"}
        </div>
      </div>
      <div className="output-runtime-tabs" role="tablist" aria-label="Output runtime tabs">
        {tabDefinitions.map((tab) => {
          const isActive = tab.id === activeTab;

          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={isActive ? "output-runtime-tab is-active" : "output-runtime-tab"}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" className="output-runtime-panel">
        <pre>{tabContent}</pre>
      </div>
    </section>
  );
}

export const NodeEditorModal = forwardRef<NodeEditorModalHandle, NodeEditorModalProps>(
function NodeEditorModal({
  node,
  outputRuntime = null,
  onClose,
  onSave,
}, ref) {
  const {
    state: { document: graphDocument },
  } = useDocumentContext();
  const { draft, initialDraft, setDraft } = useEditableNode(node);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const [pendingCloseAction, setPendingCloseAction] = useState<(() => void) | null>(
    null,
  );
  const nodeNameInputRef = useRef<HTMLInputElement | null>(null);
  const keepEditingButtonRef = useRef<HTMLButtonElement | null>(null);
  const discardDialogRef = useRef<HTMLDivElement | null>(null);
  const previousEditorFocusRef = useRef<HTMLElement | null>(null);
  const shouldRestoreFocusRef = useRef(false);

  const schemaOverrides = useMemo(
    () => inferNodeSchemas(graphDocument, node.id),
    [graphDocument, node.id],
  );
  const serializedDraft = useMemo(() => serializeNodeEditorDraft(draft), [draft]);
  const isDirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(initialDraft),
    [draft, initialDraft],
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

  function handleDiscardDialogKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") {
      return;
    }

    const focusableElements = discardDialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );

    if (!focusableElements || focusableElements.length === 0) {
      event.preventDefault();
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    const activeElement = globalThis.document.activeElement;

    if (event.shiftKey) {
      if (activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      }
      return;
    }

    if (activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
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
    nodeNameInputRef.current?.focus();
  }, [node.id]);

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
                  ref={nodeNameInputRef}
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
            {node.kind === "output" ? (
              <OutputRuntimeInspector
                compileResult={outputRuntime?.compileResult ?? null}
                listenerStatus={outputRuntime?.listenerStatus ?? null}
              />
            ) : null}
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
              ref={discardDialogRef}
              onKeyDown={handleDiscardDialogKeyDown}
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
