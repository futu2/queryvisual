import { useRef, useState } from "react";
import { useDocumentContext } from "../../app/state/DocumentContext";
import { buildPackageFileFromWorkspace } from "../../domain/package/export";
import { isWorkspacePackageManifestValid } from "../../domain/package/types";
import type { GraphPackageFile, WorkspacePackageManifest } from "../../domain/package/types";
import { LanguageSwitcher } from "../i18n/LanguageSwitcher";
import { useI18n } from "../i18n/I18nContext";
import { PackageManifestModal } from "../packages/PackageManifestModal";
import { downloadWorkspace, parsePackageJson, parseWorkspaceJson } from "./fileIO";

function sanitizeFilename(name: string) {
  const sanitized = name
    .trim()
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return sanitized === "" ? "queryvisual-package" : sanitized;
}

function downloadPackageFile(pkg: GraphPackageFile) {
  const blob = new Blob([JSON.stringify(pkg, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = `${sanitizeFilename(`${pkg.packageId}-${pkg.version}`)}.qvpkg.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function DocumentToolbar() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const packageInputRef = useRef<HTMLInputElement>(null);
  const [hasLoadError, setHasLoadError] = useState(false);
  const [hasPackageInstallError, setHasPackageInstallError] = useState(false);
  const [hasPackageExportError, setHasPackageExportError] = useState(false);
  const [showManifestModal, setShowManifestModal] = useState(false);
  const { state, dispatch } = useDocumentContext();
  const { t } = useI18n();

  function handleManifestSave(manifest: WorkspacePackageManifest) {
    if (!isWorkspacePackageManifestValid(manifest, state.workspace.graphs)) {
      setHasPackageExportError(true);
      return;
    }

    const nextWorkspace = {
      ...state.workspace,
      packageManifest: manifest,
    };

    try {
      const pkg = buildPackageFileFromWorkspace(nextWorkspace);
      dispatch({ type: "set-package-manifest", manifest });
      setHasPackageExportError(false);
      setShowManifestModal(false);
      downloadPackageFile(pkg);
    } catch {
      setHasPackageExportError(true);
    }
  }

  return (
    <>
      <div className="toolbar-stack">
        {hasLoadError ? <p role="alert">{t("toolbar.loadError")}</p> : null}
        {hasPackageInstallError ? (
          <p role="alert">{t("toolbar.installPackageError")}</p>
        ) : null}
        {hasPackageExportError ? (
          <p role="alert">{t("toolbar.exportPackageError")}</p>
        ) : null}

        <div className="toolbar-row">
          <button
            type="button"
            className="ghost-button"
            onClick={() => downloadWorkspace(state.workspace)}
          >
            {t("toolbar.saveJson")}
          </button>
          <button
            type="button"
            className="ghost-button"
            onClick={() => fileInputRef.current?.click()}
          >
            {t("toolbar.loadJson")}
          </button>
          <button
            type="button"
            className="ghost-button"
            onClick={() => packageInputRef.current?.click()}
          >
            {t("toolbar.installPackage")}
          </button>
          <button
            type="button"
            className="ghost-button"
            onClick={() => setShowManifestModal(true)}
          >
            {t("toolbar.exportPackage")}
          </button>
          <LanguageSwitcher />
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          hidden
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;

            try {
              const raw = await file.text();
              dispatch({
                type: "replace-workspace",
                workspace: parseWorkspaceJson(raw),
              });
              setHasLoadError(false);
            } catch {
              setHasLoadError(true);
            } finally {
              event.target.value = "";
            }
          }}
        />

        <input
          ref={packageInputRef}
          type="file"
          accept="application/json"
          aria-label={t("toolbar.installPackageFile")}
          hidden
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;

            try {
              const raw = await file.text();
              dispatch({
                type: "install-package",
                pkg: parsePackageJson(raw),
              });
              setHasPackageInstallError(false);
            } catch {
              setHasPackageInstallError(true);
            } finally {
              event.target.value = "";
            }
          }}
        />
      </div>

      {showManifestModal ? (
        <PackageManifestModal
          graphs={state.workspace.graphs}
          value={state.workspace.packageManifest}
          onClose={() => {
            setHasPackageExportError(false);
            setShowManifestModal(false);
          }}
          onSave={handleManifestSave}
        />
      ) : null}
    </>
  );
}
