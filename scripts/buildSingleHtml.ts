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

  if (!css) {
    throw new Error("Bun build did not produce a CSS bundle");
  }

  return { css, js };
}

export function assertNoExternalAssets(html: string): void {
  if (/<script\b(?=[^>]*\bsrc\s*=)[^>]*>/i.test(html)) {
    throw new Error("single HTML output still references an external script");
  }

  for (const linkTag of html.matchAll(/<link\b[^>]*>/gi)) {
    if (isExternalStylesheetLink(linkTag[0])) {
      throw new Error("single HTML output still references an external stylesheet");
    }
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

function isExternalStylesheetLink(linkTag: string): boolean {
  const href = getHtmlAttribute(linkTag, "href");
  const rel = getHtmlAttribute(linkTag, "rel");

  return Boolean(
    href &&
      rel
        ?.split(/\s+/)
        .some((token) => token.toLowerCase() === "stylesheet"),
  );
}

function getHtmlAttribute(tag: string, name: string): string | undefined {
  const match = tag.match(
    new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i"),
  );

  return match?.[1] ?? match?.[2] ?? match?.[3];
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
