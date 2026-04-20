# QueryVisual

QueryVisual is a Bun + React + XYFlow single-page app for building relational
query graphs and compiling them into ANSI SQL through a validation, IR, and
optimization pipeline.

## Commands

- `bun run dev` starts the Bun server with HMR
- `bun test` runs the test suite
- `bun run build` builds the browser assets into `dist/`
- `bun run start` serves the production build

## Current Scope

- structured node graph editing
- centered modal editors
- local JSON save/load
- semantic graph validation
- IR lowering and optimizer inspection
- ANSI SQL rendering
