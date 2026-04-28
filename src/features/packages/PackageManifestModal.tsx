import { useEffect, useMemo, useRef, useState } from "react";
import type { GraphDefinition } from "../../domain/document/types";
import type { WorkspacePackageManifest } from "../../domain/package/types";
import { useI18n } from "../i18n/I18nContext";

type ExportDraft = {
  exportKey: string;
  graphId: string;
};

function createExportDrafts(
  value: WorkspacePackageManifest | null,
): ExportDraft[] {
  if (!value) {
    return [];
  }

  return value.exports.map((entry) => ({
    exportKey: entry.exportKey,
    graphId: entry.graphId,
  }));
}

export function PackageManifestModal({
  graphs,
  value,
  onClose,
  onSave,
}: {
  graphs: GraphDefinition[];
  value: WorkspacePackageManifest | null;
  onClose: () => void;
  onSave: (manifest: WorkspacePackageManifest) => void;
}) {
  const { t } = useI18n();
  const packageIdInputRef = useRef<HTMLInputElement | null>(null);
  const [packageId, setPackageId] = useState(value?.packageId ?? "");
  const [version, setVersion] = useState(value?.version ?? "");
  const [name, setName] = useState(value?.name ?? "");
  const [description, setDescription] = useState(value?.description ?? "");
  const [exportsDraft, setExportsDraft] = useState<ExportDraft[]>(() =>
    createExportDrafts(value),
  );

  useEffect(() => {
    packageIdInputRef.current?.focus();
  }, []);

  const graphsById = useMemo(
    () => new Map(graphs.map((graph) => [graph.id, graph])),
    [graphs],
  );

  const trimmedExportKeys = exportsDraft.map((entry) => entry.exportKey.trim());
  const hasDuplicateExportKeys =
    new Set(trimmedExportKeys.filter((entry) => entry !== "")).size !==
    trimmedExportKeys.filter((entry) => entry !== "").length;

  const canSave =
    packageId.trim() !== "" &&
    version.trim() !== "" &&
    name.trim() !== "" &&
    exportsDraft.length > 0 &&
    !hasDuplicateExportKeys &&
    exportsDraft.every(
      (entry) => entry.exportKey.trim() !== "" && entry.graphId !== "",
    );

  function updateExportDraft(
    index: number,
    patch: Partial<ExportDraft>,
  ) {
    setExportsDraft((current) =>
      current.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, ...patch } : entry,
      ),
    );
  }

  function handleSave() {
    const exports = exportsDraft.map((entry) => {
      const graph = graphsById.get(entry.graphId);

      return {
        exportKey: entry.exportKey.trim(),
        graphId: entry.graphId,
        displayName: graph?.metadata.name ?? entry.graphId,
      };
    });

    onSave({
      packageId: packageId.trim(),
      version: version.trim(),
      name: name.trim(),
      description: description.trim(),
      exports,
    });
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label={t("packageManifest.title")}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-content">
          <header className="modal-header">
            <div>
              <div className="modal-kind">{t("toolbar.exportPackage")}</div>
              <h2>{t("packageManifest.title")}</h2>
            </div>
          </header>

          <section className="modal-body package-manifest-modal">
            <div className="package-manifest-modal__grid">
              <label>
                <span>{t("packageManifest.packageId")}</span>
                <input
                  aria-label={t("packageManifest.packageId")}
                  ref={packageIdInputRef}
                  value={packageId}
                  onChange={(event) => setPackageId(event.target.value)}
                />
              </label>

              <label>
                <span>{t("packageManifest.version")}</span>
                <input
                  aria-label={t("packageManifest.version")}
                  value={version}
                  onChange={(event) => setVersion(event.target.value)}
                />
              </label>
            </div>

            <label>
              <span>{t("packageManifest.name")}</span>
              <input
                aria-label={t("packageManifest.name")}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>

            <label>
              <span>{t("packageManifest.description")}</span>
              <textarea
                aria-label={t("packageManifest.description")}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>

            <div className="editor-section">
              <div className="package-manifest-modal__section-header">
                <h3>{t("packageManifest.exports")}</h3>
                <button
                  type="button"
                  className="row-add-button"
                  onClick={() =>
                    setExportsDraft((current) => [
                      ...current,
                      { exportKey: "", graphId: "" },
                    ])
                  }
                >
                  {t("packageManifest.addExport")}
                </button>
              </div>

              <div className="package-manifest-modal__exports">
                {exportsDraft.map((entry, index) => (
                  <div key={index} className="row-card">
                    <div className="package-manifest-modal__export-row">
                      <label>
                        <span>
                          {t("packageManifest.exportKey", { row: index + 1 })}
                        </span>
                        <input
                          aria-label={t("packageManifest.exportKey", {
                            row: index + 1,
                          })}
                          value={entry.exportKey}
                          onChange={(event) =>
                            updateExportDraft(index, {
                              exportKey: event.target.value,
                            })
                          }
                        />
                      </label>

                      <label>
                        <span>
                          {t("packageManifest.exportGraph", { row: index + 1 })}
                        </span>
                        <select
                          aria-label={t("packageManifest.exportGraph", {
                            row: index + 1,
                          })}
                          value={entry.graphId}
                          onChange={(event) =>
                            updateExportDraft(index, {
                              graphId: event.target.value,
                            })
                          }
                        >
                          <option value="">{t("packageManifest.selectGraph")}</option>
                          {graphs.map((graph) => (
                            <option key={graph.id} value={graph.id}>
                              {graph.metadata.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div className="row-action-bar">
                      <button
                        type="button"
                        className="row-icon-button row-icon-button-danger"
                        aria-label={t("packageManifest.removeExport", {
                          row: index + 1,
                        })}
                        onClick={() =>
                          setExportsDraft((current) =>
                            current.filter((_, entryIndex) => entryIndex !== index),
                          )
                        }
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <footer className="modal-footer">
            <button type="button" className="ghost-button" onClick={onClose}>
              {t("modal.cancel")}
            </button>
            <button
              type="button"
              className="solid-button"
              onClick={handleSave}
              disabled={!canSave}
            >
              {t("modal.save")}
            </button>
          </footer>
        </div>
      </div>
    </div>
  );
}
