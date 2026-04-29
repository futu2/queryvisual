import { useI18n } from "../i18n/I18nContext";
import { paletteItems, type NodePlacementRequest } from "./nodeFactory";

function PaletteLabel({ label }: { label: string }) {
  const parts = label.split(" ");

  return (
    <>
      {parts.map((part, index) => (
        <span key={`${part}-${index}`}>
          {index > 0 ? " " : ""}
          {part}
        </span>
      ))}
    </>
  );
}

export function NodePalette({
  pendingKind,
  onRequestNodePlacement,
}: {
  pendingKind: NodePlacementRequest["kind"] | null;
  onRequestNodePlacement: (request: NodePlacementRequest) => void;
}) {
  const { t } = useI18n();

  return (
    <div>
      <h2>{t("nodePalette.title")}</h2>
      <div className="stack">
        {paletteItems.map((item) => (
          <button
            key={item.kind}
            className="ghost-button"
            type="button"
            aria-pressed={pendingKind === item.kind}
            onClick={() =>
              onRequestNodePlacement({
                kind: item.kind,
                label: t(item.messageKey),
              })
            }
          >
            <PaletteLabel label={t(item.messageKey)} />
          </button>
        ))}
      </div>
    </div>
  );
}
