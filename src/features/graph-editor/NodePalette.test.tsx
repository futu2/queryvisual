import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "bun:test";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { DocumentProvider, useDocumentContext } from "../../app/state/DocumentContext";
import { createSampleWorkspace } from "../../domain/workspace/sample";
import { I18nProvider } from "../i18n/I18nContext";
import { NodePalette } from "./NodePalette";

afterEach(cleanup);

function renderWithProviders(
  ui: ReactElement,
  options?: { navigatorLanguage?: string },
) {
  const navigatorLanguage = options?.navigatorLanguage ?? "en-US";

  return render(
    <I18nProvider
      deps={{
        navigatorLanguage,
        storage: {
          getItem: () => null,
          setItem: () => {},
        },
      }}
    >
      {ui}
    </I18nProvider>,
  );
}

function NodeLabelProbe() {
  const { state } = useDocumentContext();

  return (
    <ul>
      {state.document.nodes.map((node) => (
        <li key={node.id}>{node.label}</li>
      ))}
    </ul>
  );
}

describe("NodePalette", () => {
  test("localizes palette labels without translating created node labels", async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <DocumentProvider initialWorkspace={createSampleWorkspace()}>
        <NodePalette />
        <NodeLabelProbe />
      </DocumentProvider>,
      { navigatorLanguage: "zh-CN" },
    );

    expect(screen.getByText("节点")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "图输入" }));

    expect(screen.getByText("Graph Input")).toBeTruthy();
  });
});

