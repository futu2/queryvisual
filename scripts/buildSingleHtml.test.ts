import { describe, expect, test } from "bun:test";
import {
  assertNoExternalAssets,
  collectBundleOutputs,
  renderSingleHtml,
} from "./buildSingleHtml";

function artifact(path: string, type: string, body: string): Blob & { path: string } {
  return Object.assign(new Blob([body], { type }), { path });
}

describe("renderSingleHtml", () => {
  test("inlines css and javascript into a stable html shell", () => {
    const html = renderSingleHtml({
      css: ".app{color:red}",
      js: "document.body.dataset.ready = 'true';",
    });

    expect(html).toContain("<title>QueryVisual</title>");
    expect(html).toContain('<div id="root"></div>');
    expect(html).toContain("<style>");
    expect(html).toContain(".app{color:red}");
    expect(html).toContain('<script type="module">');
    expect(html).toContain("document.body.dataset.ready");
  });

  test("escapes inline end tags so html parsing does not truncate assets", () => {
    const html = renderSingleHtml({
      css: "body::before{content:'</style>'}",
      js: "console.log('</script>');",
    });

    expect(html).toContain("<\\/style>");
    expect(html).toContain("<\\/script>");
    expect(html).not.toContain("content:'</style>'");
    expect(html).not.toContain("console.log('</script>');");
  });
});

describe("collectBundleOutputs", () => {
  test("collects javascript and css outputs from Bun build artifacts", async () => {
    const outputs = [
      artifact("./frontend.js", "text/javascript;charset=utf-8", "console.log('ok')"),
      artifact("./frontend.css", "text/css;charset=utf-8", ".root{display:block}"),
    ];

    await expect(collectBundleOutputs(outputs)).resolves.toEqual({
      js: "console.log('ok')",
      css: ".root{display:block}",
    });
  });

  test("throws when the javascript bundle is missing", async () => {
    const outputs = [artifact("./frontend.css", "text/css", ".root{}")];

    await expect(collectBundleOutputs(outputs)).rejects.toThrow(
      "Bun build did not produce a JavaScript bundle",
    );
  });

  test("throws when the css bundle is missing", async () => {
    const outputs = [artifact("./frontend.js", "text/javascript", "console.log('ok')")];

    await expect(collectBundleOutputs(outputs)).rejects.toThrow(
      "Bun build did not produce a CSS bundle",
    );
  });
});

describe("assertNoExternalAssets", () => {
  test("allows inline-only html", () => {
    expect(() =>
      assertNoExternalAssets(
        '<style>.app{}</style><div id="root"></div><script type="module">console.log(1)</script>',
      ),
    ).not.toThrow();
  });

  test("allows inline-only html when inline assets contain external tag-like strings", () => {
    expect(() =>
      assertNoExternalAssets(
        [
          "<style>",
          '.app::before{content:"<link rel=\\"stylesheet\\" href=\\"frontend.css\\">"}',
          "</style>",
          '<script type="module">',
          'console.log("<script src=./frontend.js>");',
          "</script>",
        ].join(""),
      ),
    ).not.toThrow();
  });

  test("rejects external script sources", () => {
    expect(() =>
      assertNoExternalAssets('<script type="module" src="./frontend.js"></script>'),
    ).toThrow("single HTML output still references an external script");
  });

  test("rejects external script sources when an earlier quoted attribute contains a greater-than sign", () => {
    expect(() =>
      assertNoExternalAssets('<script data-note=">" src="./frontend.js"></script>'),
    ).toThrow("single HTML output still references an external script");
  });

  test("rejects external stylesheet links", () => {
    expect(() =>
      assertNoExternalAssets('<link rel="stylesheet" href="./frontend.css">'),
    ).toThrow("single HTML output still references an external stylesheet");
  });

  test("rejects external stylesheet links when an earlier quoted attribute contains a greater-than sign", () => {
    expect(() =>
      assertNoExternalAssets(
        '<link data-note=">" rel="stylesheet" href="./frontend.css">',
      ),
    ).toThrow("single HTML output still references an external stylesheet");
  });

  test("rejects external stylesheet links with tokenized rel values", () => {
    expect(() =>
      assertNoExternalAssets('<link rel="preload stylesheet" href="./frontend.css">'),
    ).toThrow("single HTML output still references an external stylesheet");
  });
});
