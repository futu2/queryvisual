import { useRef, useState } from "react";
import { useDocumentContext } from "../../app/state/DocumentContext";
import { LanguageSwitcher } from "../i18n/LanguageSwitcher";
import { useI18n } from "../i18n/I18nContext";
import { downloadWorkspace, parseWorkspaceJson } from "./fileIO";

export function DocumentToolbar() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [hasLoadError, setHasLoadError] = useState(false);
  const { state, dispatch } = useDocumentContext();
  const { t } = useI18n();

  return (
    <div className="toolbar-row">
      {hasLoadError ? <p role="alert">{t("toolbar.loadError")}</p> : null}
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
      <LanguageSwitcher />
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
    </div>
  );
}
