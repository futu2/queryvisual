import {
  forwardRef,
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useId,
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
import { useI18n } from "../i18n/I18nContext";
import type { MessageKey, TranslationVars } from "../i18n/types";

type Translator = (key: MessageKey, vars?: TranslationVars) => string;

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

const nodeKindMessageKeys = {
  graphInput: "nodeKinds.graphInput",
  fromTable: "nodeKinds.fromTable",
  subgraph: "nodeKinds.subgraph",
  helperFunctions: "nodeKinds.helperFunctions",
  importHelperFunctions: "nodeKinds.importHelperFunctions",
  importGraphHelpers: "nodeKinds.importGraphHelpers",
  join: "nodeKinds.join",
  where: "nodeKinds.where",
  select: "nodeKinds.select",
  aggregation: "nodeKinds.aggregation",
  sort: "nodeKinds.sort",
  limit: "nodeKinds.limit",
  output: "nodeKinds.output",
} as const satisfies Record<GraphNode["kind"], MessageKey>;

function formatRuntimeTimestamp(t: Translator, timestamp: number | null) {
  if (!timestamp) {
    return t("outputRuntime.never");
  }

  return new Date(timestamp).toLocaleString();
}

function renderJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function OutputRuntimeInspector({
  outputId,
  compileResult,
  listenerStatus,
  t,
}: {
  outputId: string;
  compileResult: CompileOutputResult | null;
  listenerStatus: OutputListenerStatus | null;
  t: Translator;
}) {
  const [activeTab, setActiveTab] = useState<OutputInspectorTab>("sql");
  const tabsBaseId = useId();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const panelId = `${tabsBaseId}-panel`;

  useEffect(() => {
    setActiveTab("sql");
  }, [compileResult, listenerStatus, outputId]);

  const tabDefinitions: Array<{ id: OutputInspectorTab; label: string }> = [
    { id: "diagnostics", label: t("outputRuntime.tabs.diagnostics") },
    { id: "semantic", label: t("outputRuntime.tabs.semantic") },
    { id: "ir", label: t("outputRuntime.tabs.ir") },
    { id: "optimized-ir", label: t("outputRuntime.tabs.optimizedIr") },
    { id: "sql", label: t("outputRuntime.tabs.sql") },
  ];
  const diagnostics = compileResult?.semantic.diagnostics ?? [];
  const hasRuntimeData = Boolean(compileResult || listenerStatus);
  const activeTabId = `${tabsBaseId}-${activeTab}`;

  let tabContent: string;
  if (!hasRuntimeData) {
    tabContent = t("outputRuntime.noRuntimeData");
  } else if (activeTab === "diagnostics") {
    tabContent =
      diagnostics.length > 0
        ? diagnostics.map((diagnostic) => diagnostic.message).join("\n")
        : t("outputRuntime.noDiagnostics");
  } else if (activeTab === "semantic") {
    tabContent = compileResult ? renderJson(compileResult.semantic) : t("outputRuntime.noSemantic");
  } else if (activeTab === "ir") {
    tabContent = compileResult?.ir ? renderJson(compileResult.ir) : t("outputRuntime.noIr");
  } else if (activeTab === "optimized-ir") {
    tabContent = compileResult?.optimizedIr
      ? renderJson(compileResult.optimizedIr)
      : t("outputRuntime.noOptimizedIr");
  } else {
    tabContent = compileResult?.sql.trim()
      ? compileResult.sql
      : t("outputRuntime.noSql");
  }

  return (
    <section
      className="output-runtime-section"
      aria-label={t("outputRuntime.sectionTitle")}
    >
      <h3>{t("outputRuntime.sectionTitle")}</h3>
      <div className="output-runtime-status" role="status" aria-live="polite">
        <div>
          <strong>{t("outputRuntime.lastRun")}</strong>{" "}
          {formatRuntimeTimestamp(t, listenerStatus?.lastRunAt ?? null)}
        </div>
        <div>
          <strong>{t("outputRuntime.lastError")}</strong>{" "}
          {listenerStatus?.lastErrorMessage ?? t("outputRuntime.none")}
        </div>
      </div>
      <div
        className="output-runtime-tabs"
        role="tablist"
        aria-label={t("outputRuntime.sectionTitle")}
      >
        {tabDefinitions.map((tab, index) => {
          const isActive = tab.id === activeTab;
          const tabId = `${tabsBaseId}-${tab.id}`;

          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={tabId}
              aria-selected={isActive}
              aria-controls={panelId}
              tabIndex={isActive ? 0 : -1}
              className={isActive ? "output-runtime-tab is-active" : "output-runtime-tab"}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(event) => {
                if (
                  event.key !== "ArrowRight" &&
                  event.key !== "ArrowLeft" &&
                  event.key !== "Home" &&
                  event.key !== "End"
                ) {
                  return;
                }

                event.preventDefault();
                const currentIndex = tabDefinitions.findIndex(
                  (candidate) => candidate.id === activeTab,
                );
                if (currentIndex === -1) {
                  return;
                }

                let nextIndex = currentIndex;
                if (event.key === "ArrowRight") {
                  nextIndex = (currentIndex + 1) % tabDefinitions.length;
                } else if (event.key === "ArrowLeft") {
                  nextIndex =
                    (currentIndex - 1 + tabDefinitions.length) % tabDefinitions.length;
                } else if (event.key === "Home") {
                  nextIndex = 0;
                } else if (event.key === "End") {
                  nextIndex = tabDefinitions.length - 1;
                }

                const nextTab = tabDefinitions[nextIndex];
                setActiveTab(nextTab.id);
                tabRefs.current[nextIndex]?.focus();
              }}
              ref={(element) => {
                tabRefs.current[index] = element;
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={panelId}
        aria-labelledby={activeTabId}
        className="output-runtime-panel"
      >
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
  const { state, dispatch } = useDocumentContext();
  const { t } = useI18n();
  const graphDocument = state.document;
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

  const schemaOverrides = useMemo(() => {
    const needsOverrides =
      node.kind === "where" ||
      node.kind === "join" ||
      node.kind === "select" ||
      node.kind === "aggregation" ||
      node.kind === "sort";

    return needsOverrides
      ? inferNodeSchemas(graphDocument, node.id, { workspace: state.workspace })
      : undefined;
  }, [graphDocument, node.id, node.kind, state.workspace]);
  const serializedDraft = useMemo(() => serializeNodeEditorDraft(draft), [draft]);
  const isDirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(initialDraft),
    [draft, initialDraft],
  );
  const nodeKindLabel = t(nodeKindMessageKeys[node.kind]);
  const modalAriaLabel = t("modal.editNodeAria", { kind: nodeKindLabel });

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
        aria-label={showDiscardDialog ? undefined : modalAriaLabel}
        onFocusCapture={(event) => {
          const target = event.target;
          if (!(target instanceof HTMLElement)) return;
          if (target.closest(".modal-footer")) return;
          if (target.closest(".modal-confirmation-card")) return;
          previousEditorFocusRef.current = target;
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-content" aria-hidden={showDiscardDialog}>
          <header className="modal-header">
            <div>
              <div className="modal-kind">{nodeKindLabel}</div>
              <label className="modal-title-field">
                <span className="sr-only">{t("modal.nodeName")}</span>
                <input
                  aria-label={t("modal.nodeName")}
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

          <section
            className="modal-body"
            style={{ flexGrow: 1, flexShrink: 1, minHeight: 0 }}
          >
            {renderNodeEditor(draft, setDraft, graphDocument, t, schemaOverrides, {
              workspace: state.workspace,
              activeGraphId: state.activeGraphId,
              onOpenGraph: (graphId) => {
                requestClose(() => {
                  dispatch({ type: "set-active-graph", graphId });
                  onClose();
                });
              },
            })}
            {node.kind === "output" ? (
              <OutputRuntimeInspector
                outputId={node.id}
                compileResult={outputRuntime?.compileResult ?? null}
                listenerStatus={outputRuntime?.listenerStatus ?? null}
                t={t}
              />
            ) : null}
          </section>

          <footer className="modal-footer">
            <button
              type="button"
              className="ghost-button"
              onClick={() => requestClose()}
            >
              {t("modal.cancel")}
            </button>
            <button
              type="button"
              className="solid-button"
              onClick={() => onSave(serializedDraft)}
            >
              {t("modal.save")}
            </button>
          </footer>
        </div>

        {showDiscardDialog ? (
          <div className="modal-confirmation-scrim">
            <div
              className="modal-confirmation-card"
              role="dialog"
              aria-modal="true"
              aria-label={t("modal.discard.title")}
              ref={discardDialogRef}
              onKeyDown={handleDiscardDialogKeyDown}
            >
              <h3>{t("modal.discard.title")}</h3>
              <p>{t("modal.discard.body")}</p>
              <div className="modal-confirmation-actions">
                <button
                  type="button"
                  className="ghost-button"
                  ref={keepEditingButtonRef}
                  onClick={handleKeepEditing}
                >
                  {t("modal.discard.keepEditing")}
                </button>
                <button
                  type="button"
                  className="solid-button"
                  onClick={handleDiscardChanges}
                >
                  {t("modal.discard.confirm")}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
});
