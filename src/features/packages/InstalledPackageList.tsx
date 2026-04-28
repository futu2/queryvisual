import type { InstalledGraphPackage } from "../../domain/package/types";
import { useI18n } from "../i18n/I18nContext";

export function InstalledPackageList({
  packages,
}: {
  packages: InstalledGraphPackage[];
}) {
  const { t } = useI18n();

  return (
    <section
      className="installed-package-list"
      aria-label={t("packages.title")}
    >
      <div className="installed-package-list__header">
        <h2>{t("packages.title")}</h2>
      </div>

      {packages.length === 0 ? (
        <p className="muted">{t("packages.empty")}</p>
      ) : (
        <div className="installed-package-list__items">
          {packages.map((pkg) => {
            const exportCount = pkg.exports.length;
            const exportCountLabel =
              exportCount === 1
                ? t("packages.exportCountOne")
                : t("packages.exportCountMany", { count: exportCount });

            return (
              <article
                key={`${pkg.packageId}@${pkg.version}`}
                className="installed-package-card"
              >
                <div className="installed-package-card__header">
                  <div>
                    <div className="installed-package-card__id">{pkg.packageId}</div>
                    <div className="muted">{pkg.metadata.name}</div>
                  </div>
                  <span className="installed-package-card__version">
                    {pkg.version}
                  </span>
                </div>
                <div className="installed-package-card__meta">
                  {exportCountLabel}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
