# Single HTML Build Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in `bun run build:single` command that writes a self-contained `dist/index.html` with inline JavaScript and CSS.

**Architecture:** Add a focused Bun build helper under `scripts/` that bundles `src/frontend.tsx` in memory, extracts JavaScript and CSS outputs, renders them into a static HTML shell, validates that no external JS or CSS asset references remain, and writes `dist/index.html`. Keep the existing `bun run build` command unchanged.

**Tech Stack:** Bun 1.3.11 build API, TypeScript, Bun test runner, React SPA entry point at `src/frontend.tsx`.

---

## File Structure

- Create `scripts/buildSingleHtml.ts`: owns the single-file build orchestration, HTML rendering, inline escaping, bundle output extraction, and validation.
- Create `scripts/buildSingleHtml.test.ts`: tests HTML rendering, script/style escaping, bundle output extraction, and external asset validation.
- Modify `package.json`: add `build:single` without changing the existing `build`.
- Modify `README.md`: document the new command and its output.

## Task 1: Test The Single HTML Helper Contract

**Files:**
- Create: `scripts/buildSingleHtml.test.ts`
- Create later in this task: `scripts/buildSingleHtml.ts`

- [ ] **Step 1: Write the failing tests**

Create `scripts/buildSingleHtml.test.ts` with:

```ts
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
});

describe("assertNoExternalAssets", () => {
  test("allows inline-only html", () => {
    expect(() =>
      assertNoExternalAssets(
        '<style>.app{}</style><div id="root"></div><script type="module">console.log(1)</script>',
      ),
    ).not.toThrow();
  });

  test("rejects external script sources", () => {
    expect(() =>
      assertNoExternalAssets('<script type="module" src="./frontend.js"></script>'),
    ).toThrow("single HTML output still references an external script");
  });

  test("rejects external stylesheet links", () => {
    expect(() =>
      assertNoExternalAssets('<link rel="stylesheet" href="./frontend.css">'),
    ).toThrow("single HTML output still references an external stylesheet");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
bun test scripts/buildSingleHtml.test.ts
```

Expected: FAIL because `scripts/buildSingleHtml.ts` does not exist yet.

- [ ] **Step 3: Implement the helper module**

Create `scripts/buildSingleHtml.ts` with:

```ts
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const distDir = "dist";
const outputHtmlPath = join(distDir, "index.html");

type BuildArtifact = Awaited<ReturnType<typeof Bun.build>>["outputs"][number];

type RenderSingleHtmlInput = {
  css: string;
  js: string;
};

type BundleOutputs = {
  css: string;
  js: string;
};

export function renderSingleHtml({ css, js }: RenderSingleHtmlInput): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>QueryVisual</title>
    <style>
${escapeInlineStyle(css)}
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module">
${escapeInlineScript(js)}
    </script>
  </body>
</html>
`;
}

export async function collectBundleOutputs(
  outputs: BuildArtifact[] | Array<Blob & { path?: string }>,
): Promise<BundleOutputs> {
  let css = "";
  let js = "";

  for (const output of outputs) {
    const path = output.path ?? "";
    const type = output.type ?? "";
    const text = await output.text();

    if (isJavaScriptOutput(path, type)) {
      js += text;
      continue;
    }

    if (isCssOutput(path, type)) {
      css += text;
    }
  }

  if (!js) {
    throw new Error("Bun build did not produce a JavaScript bundle");
  }

  return { css, js };
}

export function assertNoExternalAssets(html: string): void {
  if (/<script\b(?=[^>]*\bsrc\s*=)[^>]*>/i.test(html)) {
    throw new Error("single HTML output still references an external script");
  }

  if (/<link\b(?=[^>]*\brel\s*=\s*["']?stylesheet["']?)(?=[^>]*\bhref\s*=)[^>]*>/i.test(html)) {
    throw new Error("single HTML output still references an external stylesheet");
  }
}

export async function buildSingleHtml(): Promise<void> {
  const result = await Bun.build({
    entrypoints: ["./src/frontend.tsx"],
    target: "browser",
    minify: true,
    sourcemap: "none",
    define: {
      "process.env.NODE_ENV": JSON.stringify("production"),
    },
    env: "BUN_PUBLIC_*",
  });

  if (!result.success) {
    for (const log of result.logs) {
      console.error(log);
    }

    throw new Error("Bun build failed while creating single HTML output");
  }

  const bundle = await collectBundleOutputs(result.outputs);
  const html = renderSingleHtml(bundle);
  assertNoExternalAssets(html);

  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });
  await writeFile(outputHtmlPath, html);

  console.log(`Wrote ${outputHtmlPath}`);
}

function isJavaScriptOutput(path: string, type: string): boolean {
  return type.includes("javascript") || path.endsWith(".js");
}

function isCssOutput(path: string, type: string): boolean {
  return type.includes("css") || path.endsWith(".css");
}

function escapeInlineScript(source: string): string {
  return source.replace(/<\/script/gi, "<\\/script");
}

function escapeInlineStyle(source: string): string {
  return source.replace(/<\/style/gi, "<\\/style");
}

if (import.meta.main) {
  await buildSingleHtml();
}
```

- [ ] **Step 4: Run the helper tests to verify they pass**

Run:

```bash
bun test scripts/buildSingleHtml.test.ts
```

Expected: PASS for all tests in `scripts/buildSingleHtml.test.ts`.

- [ ] **Step 5: Commit the helper and tests**

Run:

```bash
git add scripts/buildSingleHtml.ts scripts/buildSingleHtml.test.ts
git commit -m "test: cover single html build helper"
```

## Task 2: Add The Opt-In Build Command

**Files:**
- Modify: `package.json`
- Modify: `README.md`

- [ ] **Step 1: Verify the command is not registered yet**

Run:

```bash
bun run build:single
```

Expected: FAIL with a message indicating the script `build:single` is not found.

- [ ] **Step 2: Add the package script**

In `package.json`, add `build:single` after `build` and leave `build` unchanged:

```json
{
  "scripts": {
    "dev": "bun --hot src/index.ts",
    "build": "bun build ./src/index.html --outdir=dist --sourcemap --target=browser --minify --define:process.env.NODE_ENV='\"production\"' --env='BUN_PUBLIC_*'",
    "build:single": "bun scripts/buildSingleHtml.ts",
    "start": "NODE_ENV=production bun src/index.ts",
    "test": "bun test"
  }
}
```

- [ ] **Step 3: Document the new command**

In `README.md`, update the command list to:

```md
- `bun run dev` starts the Bun server with HMR
- `bun test` runs the test suite
- `bun run build` builds the browser assets into `dist/`
- `bun run build:single` builds a self-contained `dist/index.html` with inline JavaScript and CSS
- `bun run start` serves the production build
```

- [ ] **Step 4: Run the single-file build**

Run:

```bash
bun run build:single
```

Expected: PASS and output includes:

```text
Wrote dist/index.html
```

- [ ] **Step 5: Verify the generated HTML has no external JS or CSS references**

Run:

```bash
test -f dist/index.html
! rg -n '<script\\b[^>]*\\bsrc\\s*=' dist/index.html
! rg -n '<link\\b[^>]*\\brel\\s*=\\s*["'\\''"]?stylesheet["'\\''"]?[^>]*\\bhref\\s*=' dist/index.html
```

Expected: all commands exit with status 0 and print no matching external asset references.

- [ ] **Step 6: Commit the script and docs changes**

Run:

```bash
git add package.json README.md
git commit -m "feat: add single html build command"
```

## Task 3: Final Verification

**Files:**
- No new file changes expected unless verification reveals an issue.

- [ ] **Step 1: Run the full test suite**

Run:

```bash
bun test
```

Expected: PASS.

- [ ] **Step 2: Confirm the normal build still works**

Run:

```bash
bun run build
```

Expected: PASS. The command may recreate `dist/` with separate production assets; this is acceptable because the existing build behavior is intentionally unchanged.

- [ ] **Step 3: Re-run the single HTML build after the normal build**

Run:

```bash
bun run build:single
```

Expected: PASS and `dist/index.html` is recreated as the single runtime artifact.

- [ ] **Step 4: Re-run the no-external-assets check**

Run:

```bash
test -f dist/index.html
! rg -n '<script\\b[^>]*\\bsrc\\s*=' dist/index.html
! rg -n '<link\\b[^>]*\\brel\\s*=\\s*["'\\''"]?stylesheet["'\\''"]?[^>]*\\bhref\\s*=' dist/index.html
```

Expected: all commands exit with status 0 and print no matching external asset references.

- [ ] **Step 5: Inspect the final git state**

Run:

```bash
git status --short
```

Expected: no unexpected changes outside the planned source, test, README, and package files. `dist/` is ignored by this repository, so generated build output should not be staged.
