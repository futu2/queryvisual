# Single HTML Build Design

## Goal

Add an opt-in build command that bundles the QueryVisual SPA into one self-contained HTML file. The output must not require separate JavaScript or CSS files at runtime.

## Scope

- Keep the existing `bun run build` command unchanged.
- Add a new `bun run build:single` command.
- Write the single-file output to `dist/index.html`.
- Inline the browser JavaScript bundle into a `<script type="module">` tag.
- Inline application CSS and dependency CSS into `<style>` tags.
- Preserve the current app entry point, React rendering behavior, and production `NODE_ENV` define.
- Do not change runtime app behavior.

## Architecture

Create a small build helper script under `scripts/`. The script will use Bun's build API to bundle `src/frontend.tsx` for the browser with production settings. It will inspect Bun's generated outputs, separate JavaScript and CSS artifacts by MIME type or file extension, and inject their text into an HTML shell based on the current `src/index.html` structure.

The script will clean and recreate `dist/`, then write exactly one runtime artifact: `dist/index.html`. Any intermediate generated assets will remain in memory or a temporary build path that is removed before completion.

## Data Flow

1. `bun run build:single` invokes the helper script.
2. The helper bundles `src/frontend.tsx`.
3. The helper reads generated JS and CSS bundle content.
4. The helper creates an HTML document with `#root`, inline styles, and inline module script.
5. The helper writes `dist/index.html`.
6. The helper validates that the HTML does not contain stylesheet links or external script sources.

## Error Handling

The helper exits non-zero if bundling fails, expected JS output is missing, output writing fails, or validation finds external JavaScript or CSS references. Failure messages should be direct enough to show which phase failed.

## Testing And Verification

Add focused tests only if the repo already has a natural test harness for the helper. Otherwise, verify through commands:

- `bun run build:single`
- a shell check that `dist/index.html` exists and does not contain `<script ... src=...>` or `<link ... rel="stylesheet" ... href=...>`
- `bun test`

The regular `bun run build` should remain available and unchanged.
