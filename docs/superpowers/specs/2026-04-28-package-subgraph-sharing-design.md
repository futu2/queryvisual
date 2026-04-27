# Package-Based Subgraph Sharing Design

## Goal

Let multiple users share reusable subgraphs as versioned package files, while
keeping the current local-workspace editing model intact.

The first package-sharing version should behave like normal programming-language
libraries:

- users export reusable graph packages as files
- other users import those packages into their workspace
- imported packages are read-only
- subgraph uses are pinned to exact package versions
- upgrades are explicit and compatibility-checked

## Scope

This design adds:

- file-based graph packages
- installed package inventory inside a workspace
- package exports that can be used through the existing `subgraph` node kind
- multi-export packages
- package dependencies bundled into one self-contained package file
- side-by-side installed versions of the same package id
- explicit, compatibility-checked upgrades

This design does not add:

- remote package registries
- live shared references across users
- collaborative editing of the same package source
- automatic package upgrades
- editable imported packages

## Approved Decisions

- Sharing uses installed package snapshots, not live remote references.
- Distribution is file-based first.
- One package may expose multiple public exported graphs.
- Imported packages are read-only.
- Packages may depend on other packages.
- Exported package files are self-contained and bundle transitive dependencies.
- Workspaces may install multiple versions of the same package id side by side.
- Imported exports use the same `subgraph` node kind as local reusable graphs.
- Existing uses stay pinned until the user explicitly upgrades them.
- Public exports are defined by an explicit export manifest.
- The `subgraph` picker should show local graphs and installed package exports in
  the same flow.
- Package identity uses a stable package id separate from display name.
- Export identity uses a stable export key separate from graph display name.
- Installed packages are deduped by `packageId + version`.
- Upgrades are blocked unless the new export interface is compatible.

## Current Context

The current app already supports reusable local composition inside one
workspace:

- a workspace contains many local graphs
- `subgraph` nodes reference other local graphs
- the workspace is saved and loaded as one JSON file

That model is already documented in
[`2026-04-26-graph-composition-workspace-design.md`](./2026-04-26-graph-composition-workspace-design.md).

The missing piece is cross-user reuse. Users can exchange whole workspace JSON
today, but there is no notion of:

- package identity
- package version
- read-only library content
- dependency packaging
- explicit upgrades

## Chosen Model

The first package-sharing implementation should use installed package snapshots.

Conceptually:

1. an author exports a package file
2. another user imports that package file into a workspace
3. the workspace records the installed package by `packageId + version`
4. a `subgraph` node may target either:
   - a local graph
   - or a package export
5. the package export remains read-only and pinned

This keeps the current editor model understandable:

- local graphs are editable project code
- installed packages are read-only libraries

## Data Model

### Package File Root

Add a package file format, conceptually:

```ts
interface GraphPackageFile {
  formatVersion: 1;
  packageId: string;
  version: string;
  metadata: {
    name: string;
    description?: string;
  };
  exports: GraphPackageExport[];
  graphs: GraphDefinition[];
  dependencies: GraphPackageFile[];
}
```

### Package Identity

`packageId` is the stable logical identity, for example:

- `team/sales-lib`
- `acme/customer-analytics`

It is not the display name.

`version` should be a version string suitable for package comparison and
display. Semver-style strings are the intended default for v1.

### Public Exports

Each public exported graph needs a stable key distinct from graph display name:

```ts
interface GraphPackageExport {
  exportKey: string;
  graphId: string;
  displayName: string;
}
```

A subgraph use should conceptually target:

```ts
team/sales-lib@1.2.0#daily_orders
```

`exportKey` stays stable across display-name changes.

### Bundled Dependencies

Dependencies are exported self-contained:

- the package file contains the direct dependencies it needs
- each dependency package contains its own dependencies recursively
- importing one file is enough to install the full dependency closure

This avoids broken imports in a file-only distribution model.

## Workspace Model

### Installed Packages

Extend the workspace model with installed package inventory separate from local
editable graphs.

Conceptually:

```ts
interface InstalledGraphPackage {
  packageId: string;
  version: string;
  metadata: {
    name: string;
    description?: string;
  };
  exports: GraphPackageExport[];
  graphs: GraphDefinition[];
  dependencyRefs: Array<{
    packageId: string;
    version: string;
  }>;
}
```

The workspace then contains:

- local editable graphs
- installed read-only packages

Installed packages must not be merged into `workspace.graphs` as if they were
ordinary editable graphs.

### Deduplication

If a workspace imports the same `packageId + version` more than once, it should
reuse the existing installed copy rather than duplicate it.

That applies whether the package arrives:

- directly from an imported file
- or transitively through another imported package

## Subgraph Target Model

Keep one `subgraph` node kind, but widen its target from only local `graphId`
to a target union.

Conceptually:

```ts
type SubgraphTarget =
  | {
      kind: "local";
      graphId: string;
    }
  | {
      kind: "package";
      packageId: string;
      version: string;
      exportKey: string;
    };
```

Then:

```ts
GraphNodeBase<"subgraph", { target: SubgraphTarget }>
```

This preserves one user-facing node concept while still distinguishing:

- editable local reuse
- read-only package reuse

## Package Authoring

### Explicit Export Manifest

Package creation should be driven by an explicit export manifest, not by
implicitly exporting all graphs.

The manifest should define:

- `packageId`
- `version`
- package display metadata
- public exports by `exportKey -> graphId`

When exporting a package:

- only manifest-declared public exports are public
- the package file also includes all internal helper graphs reachable from those
  exports
- non-exported helper graphs remain internal implementation detail

### Internal Helper Graphs

One package may contain:

- many public exported graphs
- many non-public helper graphs

This allows package-internal composition without exposing every helper graph to
consumers.

## Import Behavior

When importing a package file:

1. validate the package file structure
2. recursively read bundled dependency packages
3. install each dependency by `packageId + version`
4. install the top-level package
5. dedupe already-installed identical versions

Imports should not mutate existing uses of older versions.

If the workspace already has:

- `team/sales-lib@1.2.0`

and imports:

- `team/sales-lib@1.3.0`

then both versions may coexist side by side.

## Upgrade Behavior

Package uses remain pinned until explicitly upgraded.

That means:

- importing a newer version does not rewrite existing nodes
- users must choose which subgraph use to upgrade
- upgrade is a deliberate operation, not an import side effect

### Compatibility Gate

Upgrading from one package export version to another should be blocked unless
the interface is compatible.

For v1, compatibility should require at least:

- the target export still exists
- every currently wired input handle still exists
- every currently used output handle still exists
- required input schemas are compatible with the old version for existing
  connections

If compatibility fails, the app should refuse the upgrade instead of leaving the
node broken.

## Read-Only Package Semantics

Installed package graphs are library code, not project code.

Users may:

- inspect package export metadata
- use package exports in subgraph nodes
- upgrade pinned uses to other installed versions

Users may not:

- edit installed package graphs in place
- rename package exports locally
- mutate package graph contents through the normal graph editor

If a user wants to customize library logic, the intended path is:

- create or fork a local editable graph
- or later add an explicit package-fork flow

## UI Model

### Subgraph Picker

Keep the current subgraph-selection flow, but expand it so the picker can show:

- local graphs
- installed package exports

In one list, users should be able to distinguish:

- local reusable graphs
- package exports with `packageId`, `version`, and `exportKey`

### Package Inventory

Installed packages should be visible somewhere in the workspace UI, but they do
not need a completely separate creation model in v1.

At minimum, the UI should support:

- import package file
- inspect installed package versions
- choose package exports in the subgraph picker
- upgrade a pinned package subgraph when a compatible newer version is already
  installed

## Compilation And Validation

Compilation should treat package exports like read-only external graph sources.

For a package-targeted subgraph node:

1. resolve installed package by `packageId + version`
2. resolve export by `exportKey`
3. find the underlying package graph
4. infer that graph's public `graphInput` and `output` interface
5. validate parent connections against that interface
6. compile through the package graph using the same subgraph semantics already
   used for local graph composition

Because package graphs are installed snapshots, compilation remains
reproducible:

- same workspace
- same installed package versions
- same SQL result

## Dependency Semantics

Package graphs may depend on exports from other bundled packages.

After import:

- those dependency packages become ordinary installed packages in the workspace
- top-level packages reference them by `packageId + version`
- the workspace dedupes matching versions globally

This keeps dependency resolution consistent and avoids hidden private duplicate
copies of the same package version.

## File Export Format Stability

The package format should be usable later by a registry-backed install source.

That means the file format should already carry:

- stable package id
- version
- explicit export keys
- bundled dependencies

Then a future registry can reuse the same logical identity and install model
without changing how workspaces reference package exports.

## Testing Strategy

Representative coverage should include:

- package file parse/validation
- self-contained import of a package with transitive dependencies
- dedupe of already-installed identical versions
- side-by-side installs of different versions of the same package id
- subgraph target resolution for local vs package targets
- compile/validate through package exports
- pinned behavior when importing newer versions
- blocked upgrade when export interface is incompatible
- allowed upgrade when interface is compatible
- read-only behavior for installed package graphs

## Future Extensions

This design intentionally leaves room for later additions:

- remote registry install source
- package publishing workflow
- package search
- package fork/copy-to-local flow
- richer compatibility reporting
- dependency graph visualization

Those should build on the same package identity and pinned snapshot model rather
than replacing it.
