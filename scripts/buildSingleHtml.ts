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
  for (const tag of scanHtmlStartTags(html)) {
    if (tag.name === "script" && getHtmlAttribute(tag.source, "src")) {
      throw new Error("single HTML output still references an external script");
    }

    if (tag.name === "link" && isExternalStylesheetLink(tag.source)) {
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

type HtmlStartTag = {
  endIndex: number;
  name: string;
  source: string;
};

function* scanHtmlStartTags(html: string): Generator<HtmlStartTag> {
  let index = 0;

  while (index < html.length) {
    const tagStart = html.indexOf("<", index);

    if (tagStart === -1) {
      return;
    }

    const tag = readHtmlStartTagAt(html, tagStart);

    if (!tag) {
      index = tagStart + 1;
      continue;
    }

    yield tag;

    index =
      tag.name === "script" || tag.name === "style"
        ? findRawTextElementEnd(html, tag.name, tag.endIndex + 1)
        : tag.endIndex + 1;
  }
}

function readHtmlStartTagAt(html: string, startIndex: number): HtmlStartTag | undefined {
  const nameStart = startIndex + 1;

  if (!isAsciiLetter(html[nameStart])) {
    return undefined;
  }

  let nameEnd = nameStart + 1;

  while (isHtmlNameChar(html[nameEnd])) {
    nameEnd += 1;
  }

  const endIndex = findTagEnd(html, nameEnd);

  if (endIndex === -1) {
    return undefined;
  }

  return {
    endIndex,
    name: html.slice(nameStart, nameEnd).toLowerCase(),
    source: html.slice(startIndex, endIndex + 1),
  };
}

function findTagEnd(html: string, startIndex: number): number {
  let quote: string | undefined;

  for (let index = startIndex; index < html.length; index += 1) {
    const char = html[index];

    if (quote) {
      if (char === quote) {
        quote = undefined;
      }

      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (char === ">") {
      return index;
    }
  }

  return -1;
}

function findRawTextElementEnd(
  html: string,
  tagName: "script" | "style",
  startIndex: number,
): number {
  let index = startIndex;

  while (index < html.length) {
    const endTagStart = indexOfIgnoreCase(html, `</${tagName}`, index);

    if (endTagStart === -1) {
      return html.length;
    }

    const boundary = html[endTagStart + tagName.length + 2];

    if (isHtmlNameChar(boundary)) {
      index = endTagStart + 2;
      continue;
    }

    const endTagEnd = findTagEnd(html, endTagStart + tagName.length + 2);

    return endTagEnd === -1 ? html.length : endTagEnd + 1;
  }

  return html.length;
}

function indexOfIgnoreCase(source: string, search: string, fromIndex: number): number {
  return source.toLowerCase().indexOf(search, fromIndex);
}

function isAsciiLetter(char: string | undefined): boolean {
  return Boolean(char && /[a-z]/i.test(char));
}

function isHtmlNameChar(char: string | undefined): boolean {
  return Boolean(char && /[a-z0-9:-]/i.test(char));
}

function getHtmlAttribute(tag: string, name: string): string | undefined {
  const normalizedName = name.toLowerCase();
  let index = 1;

  while (isHtmlNameChar(tag[index])) {
    index += 1;
  }

  while (index < tag.length) {
    while (/\s/.test(tag[index] ?? "")) {
      index += 1;
    }

    if (tag[index] === ">" || tag[index] === undefined) {
      return undefined;
    }

    if (tag[index] === "/") {
      index += 1;
      continue;
    }

    const attributeNameStart = index;

    while (isHtmlAttributeNameChar(tag[index])) {
      index += 1;
    }

    if (attributeNameStart === index) {
      index += 1;
      continue;
    }

    const attributeName = tag.slice(attributeNameStart, index).toLowerCase();

    while (/\s/.test(tag[index] ?? "")) {
      index += 1;
    }

    if (tag[index] !== "=") {
      continue;
    }

    index += 1;

    while (/\s/.test(tag[index] ?? "")) {
      index += 1;
    }

    const value = readHtmlAttributeValue(tag, index);

    if (attributeName === normalizedName) {
      return value.value;
    }

    index = value.endIndex;
  }

  return undefined;
}

function readHtmlAttributeValue(
  tag: string,
  startIndex: number,
): { endIndex: number; value: string } {
  const quote = tag[startIndex];

  if (quote === '"' || quote === "'") {
    const valueStart = startIndex + 1;
    const valueEnd = tag.indexOf(quote, valueStart);

    if (valueEnd === -1) {
      return { endIndex: tag.length, value: tag.slice(valueStart) };
    }

    return { endIndex: valueEnd + 1, value: tag.slice(valueStart, valueEnd) };
  }

  let valueEnd = startIndex;

  while (!/[\s>]/.test(tag[valueEnd] ?? ">")) {
    valueEnd += 1;
  }

  return { endIndex: valueEnd, value: tag.slice(startIndex, valueEnd) };
}

function isHtmlAttributeNameChar(char: string | undefined): boolean {
  return Boolean(char && !/[\s/>=]/.test(char));
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
