import { useI18n } from "./I18nContext";
import type { Locale } from "./types";

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();

  return (
    <label>
      <span className="sr-only">{t("toolbar.languageLabel")}</span>
      <select
        aria-label={t("toolbar.languageLabel")}
        value={locale}
        onChange={(event) => {
          setLocale(event.target.value as Locale);
        }}
      >
        <option value="en">{t("toolbar.locale.en")}</option>
        <option value="zh-CN">{t("toolbar.locale.zhCN")}</option>
      </select>
    </label>
  );
}

