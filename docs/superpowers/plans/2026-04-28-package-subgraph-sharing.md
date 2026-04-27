# Package-Based Subgraph Sharing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add file-based package sharing for reusable subgraphs so users can export versioned read-only packages with bundled dependencies, install multiple versions side by side into a workspace, use package exports through the existing `subgraph` node kind, and explicitly upgrade pinned uses only when interfaces remain compatible.

**Architecture:** First extend the workspace and node data model to represent installed packages, explicit package authoring manifests, and a widened `subgraph` target union. Then add domain helpers for package import/export, deduped installation, export resolution, and compatibility checks. After that, wire package authoring/import UI into the existing toolbar and workspace shell, update the `subgraph` editor to browse both local graphs and installed package exports, and finally teach interface inference, validation, schema inference, and compilation to resolve package-targeted subgraphs the same way they already resolve local graph-targeted subgraphs.

**Tech Stack:** Bun 1.3, React 19, TypeScript, Bun test, Testing Library, existing workspace JSON persistence, existing `subgraph` composition model

---

## File Structure

- Create: `src/domain/package/types.ts`
  Package-file, installed-package, export-manifest, and package-target helper types.
- Create: `src/domain/package/install.ts`
  Parse/install helpers for bundled package files, dedupe by `packageId + version`, and export resolution.
- Create: `src/domain/package/install.test.ts`
  Coverage for bundled dependency installation, dedupe, and export lookup.
- Create: `src/domain/package/export.ts`
  Build a package file from a workspace manifest and reachable local graph closure.
- Create: `src/domain/package/export.test.ts`
  Coverage for explicit exports, internal helper closure, and bundled dependencies.
- Create: `src/domain/package/compatibility.ts`
  Interface-compatibility checks for explicit upgrades between package versions.
- Create: `src/domain/package/compatibility.test.ts`
  Coverage for blocked/allowed upgrades based on handle and schema compatibility.
- Create: `src/features/packages/PackageManifestModal.tsx`
  Workspace-level package authoring modal for package id, version, metadata, and explicit exports.
- Create: `src/features/packages/PackageManifestModal.test.tsx`
  Focused tests for manifest editing and export manifest persistence.
- Create: `src/features/packages/InstalledPackageList.tsx`
  Lightweight workspace inventory of installed package ids, versions, and export counts.
- Create: `src/features/packages/InstalledPackageList.test.tsx`
  Coverage for installed package inventory rendering.
- Modify: `src/domain/document/types.ts`
  Add installed-package inventory to `GraphWorkspace`, optional package manifest, widened `subgraph` target data, and legacy-safe type support.
- Modify: `src/domain/workspace/sample.ts`
  Seed empty installed-package inventory and no package manifest in the default sample workspace.
- Modify: `src/features/document-storage/fileIO.ts`
  Parse/serialize package-aware workspaces, migrate legacy `subgraph.graphId` payloads, and parse package files separately from workspace files.
- Modify: `src/features/document-storage/fileIO.test.ts`
  Add workspace round-trip, legacy migration, and package-file parse/install coverage.
- Modify: `src/app/state/documentReducer.ts`
  Add actions for installing packages and updating workspace package manifest metadata.
- Modify: `src/app/state/documentReducer.test.ts`
  Cover package installation dedupe and package manifest updates.
- Modify: `src/features/document-storage/DocumentToolbar.tsx`
  Add `Install Package` and `Export Package` flows alongside existing workspace save/load.
- Modify: `src/App.tsx`
  Mount package manifest modal state and installed package inventory in the app shell.
- Modify: `src/App.test.tsx`
  Cover toolbar/package shell behavior.
- Modify: `src/features/workspace/GraphCatalog.tsx`
  Keep local editable graphs separate from installed packages while coexisting in the sidebar layout.
- Modify: `src/features/workspace/GraphCatalog.test.tsx`
  Verify installed packages do not appear as editable local graphs.
- Modify: `src/features/graph-editor/nodeEditors.tsx`
  Replace the `subgraph` graph-only selector with a unified local/package export picker and explicit upgrade controls.
- Modify: `src/features/graph-editor/NodeEditorModal.test.tsx`
  Cover package-targeted subgraph selection, pinned version display, and blocked/allowed upgrades.
- Modify: `src/domain/workspace/interfaces.ts`
  Resolve interfaces from either local graph targets or installed package export targets.
- Modify: `src/domain/graph/expressionScope.ts`
  Preserve scope/autocomplete behavior across package-targeted subgraphs.
- Modify: `src/domain/graph/expressionScope.test.ts`
  Cover package export output schema visibility in downstream scopes.
- Modify: `src/domain/graph/inferSchemas.ts`
  Infer package export output schemas through installed package resolution.
- Modify: `src/domain/graph/inferSchemas.test.ts`
  Cover package-targeted schema inference and safe failure on missing package exports.
- Modify: `src/domain/graph/validate.ts`
  Validate package-targeted subgraphs, missing package/export references, and upgrade compatibility assumptions.
- Modify: `src/domain/graph/validate.test.ts`
  Cover package-targeted subgraph validity and missing/incompatible references.
- Modify: `src/domain/compile/compileOutput.ts`
  Compile package-targeted subgraphs through resolved installed package graphs.
- Modify: `src/domain/compile/compileOutput.test.ts`
  Cover parent compilation through package exports and bundled package dependencies.
- Modify: `src/features/i18n/types.ts`
  Add package manifest, package inventory, install/export, subgraph-source, and upgrade message keys.
- Modify: `src/features/i18n/messages.ts`
  Add English and Simplified Chinese strings for package UI.
- Modify: `src/index.css`
  Style package manifest modal rows, installed package inventory, and richer subgraph picker chrome.

## Task 1: Extend The Workspace And File Formats For Packages

**Files:**
- Create: `src/domain/package/types.ts`
- Create: `src/domain/package/install.ts`
- Create: `src/domain/package/install.test.ts`
- Modify: `src/domain/document/types.ts`
- Modify: `src/domain/workspace/sample.ts`
- Modify: `src/features/document-storage/fileIO.ts`
- Modify: `src/features/document-storage/fileIO.test.ts`
- Modify: `src/app/state/documentReducer.ts`
- Modify: `src/app/state/documentReducer.test.ts`
- Test: `src/domain/package/install.test.ts`
- Test: `src/features/document-storage/fileIO.test.ts`
- Test: `src/app/state/documentReducer.test.ts`

- [ ] **Step 1: Write the failing package-model and persistence tests**

```ts
// src/domain/package/install.test.ts
import { describe, expect, test } from "bun:test";
import { installPackageBundle, resolveInstalledPackageExport } from "./install";
import type { GraphPackageFile } from "./types";
import type { GraphWorkspace } from "../document/types";

function createEmptyWorkspace(): GraphWorkspace {
  return {
    version: 2,
    metadata: { name: "Workspace" },
    entryGraphId: "graph-main",
    graphs: [
      {
        id: "graph-main",
        metadata: { name: "Main" },
        viewport: { x: 0, y: 0, zoom: 1 },
        nodes: [],
        edges: [],
      },
    ],
    installedPackages: [],
    packageManifest: null,
  };
}

describe("installPackageBundle", () => {
  test("installs bundled dependencies once and dedupes by packageId + version", () => {
    const dependency: GraphPackageFile = {
      formatVersion: 1,
      packageId: "team/base-lib",
      version: "1.0.0",
      metadata: { name: "Base Lib" },
      exports: [
        { exportKey: "base_orders", graphId: "dep-graph", displayName: "Base Orders" },
      ],
      graphs: [
        {
          id: "dep-graph",
          metadata: { name: "Base Orders" },
          viewport: { x: 0, y: 0, zoom: 1 },
          nodes: [],
          edges: [],
        },
      ],
      dependencies: [],
    };

    const pkg: GraphPackageFile = {
      formatVersion: 1,
      packageId: "team/sales-lib",
      version: "1.2.0",
      metadata: { name: "Sales Lib" },
      exports: [
        { exportKey: "daily_orders", graphId: "pkg-graph", displayName: "Daily Orders" },
      ],
      graphs: [
        {
          id: "pkg-graph",
          metadata: { name: "Daily Orders" },
          viewport: { x: 0, y: 0, zoom: 1 },
          nodes: [],
          edges: [],
        },
      ],
      dependencies: [dependency],
    };

    const once = installPackageBundle(createEmptyWorkspace(), pkg);
    const twice = installPackageBundle(once, pkg);

    expect(once.installedPackages).toHaveLength(2);
    expect(twice.installedPackages).toHaveLength(2);
    expect(
      resolveInstalledPackageExport(twice, {
        kind: "package",
        packageId: "team/sales-lib",
        version: "1.2.0",
        exportKey: "daily_orders",
      })?.graph.metadata.name,
    ).toBe("Daily Orders");
  });
});
```

```ts
// src/features/document-storage/fileIO.test.ts
import { describe, expect, test } from "bun:test";
import { parseWorkspaceJson, parsePackageJson, serializeWorkspaceJson } from "./fileIO";

describe("package-aware workspace file IO", () => {
  test("parses legacy subgraph graphId payloads into local subgraph targets", () => {
    const parsed = parseWorkspaceJson(
      JSON.stringify({
        version: 2,
        metadata: { name: "Workspace" },
        entryGraphId: "graph-main",
        graphs: [
          {
            id: "graph-main",
            metadata: { name: "Main" },
            viewport: { x: 0, y: 0, zoom: 1 },
            nodes: [
              {
                id: "subgraph-1",
                kind: "subgraph",
                label: "Child",
                position: { x: 0, y: 0 },
                data: { graphId: "graph-child" },
              },
            ],
            edges: [],
          },
          {
            id: "graph-child",
            metadata: { name: "Child" },
            viewport: { x: 0, y: 0, zoom: 1 },
            nodes: [],
            edges: [],
          },
        ],
      }),
    );

    const subgraph = parsed.graphs[0]?.nodes[0];
    expect(subgraph?.kind).toBe("subgraph");
    expect(subgraph?.data).toEqual({
      target: { kind: "local", graphId: "graph-child" },
    });
  });

  test("round-trips workspace installed packages and package manifest", () => {
    const workspace = parseWorkspaceJson(
      JSON.stringify({
        version: 2,
        metadata: { name: "Workspace" },
        entryGraphId: "graph-main",
        graphs: [
          {
            id: "graph-main",
            metadata: { name: "Main" },
            viewport: { x: 0, y: 0, zoom: 1 },
            nodes: [],
            edges: [],
          },
        ],
        installedPackages: [
          {
            packageId: "team/sales-lib",
            version: "1.2.0",
            metadata: { name: "Sales Lib" },
            exports: [
              {
                exportKey: "daily_orders",
                graphId: "pkg-graph",
                displayName: "Daily Orders",
              },
            ],
            graphs: [
              {
                id: "pkg-graph",
                metadata: { name: "Daily Orders" },
                viewport: { x: 0, y: 0, zoom: 1 },
                nodes: [],
                edges: [],
              },
            ],
            dependencyRefs: [],
          },
        ],
        packageManifest: {
          packageId: "team/app-lib",
          version: "0.1.0",
          name: "App Lib",
          description: "Reusable internal graphs",
          exports: [
            { exportKey: "orders", graphId: "graph-main", displayName: "Orders" },
          ],
        },
      }),
    );

    const roundTripped = parseWorkspaceJson(serializeWorkspaceJson(workspace));
    expect(roundTripped.installedPackages).toHaveLength(1);
    expect(roundTripped.packageManifest?.packageId).toBe("team/app-lib");
  });

  test("parses a graph package file separately from workspace JSON", () => {
    const pkg = parsePackageJson(
      JSON.stringify({
        formatVersion: 1,
        packageId: "team/sales-lib",
        version: "1.2.0",
        metadata: { name: "Sales Lib" },
        exports: [
          { exportKey: "daily_orders", graphId: "pkg-graph", displayName: "Daily Orders" },
        ],
        graphs: [
          {
            id: "pkg-graph",
            metadata: { name: "Daily Orders" },
            viewport: { x: 0, y: 0, zoom: 1 },
            nodes: [],
            edges: [],
          },
        ],
        dependencies: [],
      }),
    );

    expect(pkg.packageId).toBe("team/sales-lib");
    expect(pkg.exports[0]?.exportKey).toBe("daily_orders");
  });
});
```

```ts
// src/app/state/documentReducer.test.ts
test("installs a package bundle into the workspace without duplicating the same version", () => {
  const initial = createInitialEditorState(createSampleWorkspace());
  const packageFile: GraphPackageFile = {
    formatVersion: 1,
    packageId: "team/sales-lib",
    version: "1.2.0",
    metadata: { name: "Sales Lib" },
    exports: [{ exportKey: "daily_orders", graphId: "pkg-graph", displayName: "Daily Orders" }],
    graphs: [
      {
        id: "pkg-graph",
        metadata: { name: "Daily Orders" },
        viewport: { x: 0, y: 0, zoom: 1 },
        nodes: [],
        edges: [],
      },
    ],
    dependencies: [],
  };

  const once = documentReducer(initial, { type: "install-package", packageFile });
  const twice = documentReducer(once, { type: "install-package", packageFile });

  expect(once.workspace.installedPackages).toHaveLength(1);
  expect(twice.workspace.installedPackages).toHaveLength(1);
});

test("updates workspace package manifest explicitly", () => {
  const initial = createInitialEditorState(createSampleWorkspace());
  const next = documentReducer(initial, {
    type: "set-package-manifest",
    packageManifest: {
      packageId: "team/app-lib",
      version: "0.1.0",
      name: "App Lib",
      description: "Reusable graphs",
      exports: [],
    },
  });

  expect(next.workspace.packageManifest?.packageId).toBe("team/app-lib");
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `bun test src/domain/package/install.test.ts src/features/document-storage/fileIO.test.ts src/app/state/documentReducer.test.ts`

Expected: FAIL because package types, package parsing/install helpers, installed package inventory, workspace package manifest, and widened subgraph targets do not exist yet.

- [ ] **Step 3: Implement the package types, install helpers, workspace persistence, and reducer actions**

```ts
// src/domain/package/types.ts
import type { GraphDefinition } from "../document/types";

export interface GraphPackageExport {
  exportKey: string;
  graphId: string;
  displayName: string;
}

export interface WorkspacePackageManifest {
  packageId: string;
  version: string;
  name: string;
  description?: string;
  exports: GraphPackageExport[];
}

export interface GraphPackageFile {
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

export interface InstalledGraphPackage {
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

```ts
// src/domain/document/types.ts
import type {
  InstalledGraphPackage,
  WorkspacePackageManifest,
} from "../package/types";

export type SubgraphTarget =
  | { kind: "local"; graphId: string }
  | { kind: "package"; packageId: string; version: string; exportKey: string };

export type GraphNode =
  | GraphNodeBase<"graphInput", { inputName: string; columns: ColumnMap }>
  | GraphNodeBase<"fromTable", { tableRef: TableRef; columns: ColumnMap }>
  | GraphNodeBase<"subgraph", { target: SubgraphTarget }>
  // existing node variants...

export interface GraphWorkspace {
  version: 2;
  metadata: {
    name: string;
  };
  entryGraphId: string;
  graphs: GraphDefinition[];
  installedPackages: InstalledGraphPackage[];
  packageManifest: WorkspacePackageManifest | null;
}
```

```ts
// src/domain/package/install.ts
import type { GraphWorkspace } from "../document/types";
import type { GraphPackageFile, InstalledGraphPackage } from "./types";

function packageKey(packageId: string, version: string) {
  return `${packageId}@${version}`;
}

function toInstalledPackage(pkg: GraphPackageFile): InstalledGraphPackage {
  return {
    packageId: pkg.packageId,
    version: pkg.version,
    metadata: pkg.metadata,
    exports: pkg.exports,
    graphs: pkg.graphs,
    dependencyRefs: pkg.dependencies.map((dependency) => ({
      packageId: dependency.packageId,
      version: dependency.version,
    })),
  };
}

export function installPackageBundle(
  workspace: GraphWorkspace,
  pkg: GraphPackageFile,
): GraphWorkspace {
  let nextWorkspace = workspace;

  for (const dependency of pkg.dependencies) {
    nextWorkspace = installPackageBundle(nextWorkspace, dependency);
  }

  const key = packageKey(pkg.packageId, pkg.version);
  const existingKeys = new Set(
    nextWorkspace.installedPackages.map((candidate) =>
      packageKey(candidate.packageId, candidate.version),
    ),
  );

  if (existingKeys.has(key)) {
    return nextWorkspace;
  }

  return {
    ...nextWorkspace,
    installedPackages: [...nextWorkspace.installedPackages, toInstalledPackage(pkg)],
  };
}

export function resolveInstalledPackageExport(
  workspace: GraphWorkspace,
  target: Extract<import("../document/types").SubgraphTarget, { kind: "package" }>,
): { pkg: InstalledGraphPackage; graph: import("../document/types").GraphDefinition } | null {
  const pkg =
    workspace.installedPackages.find(
      (candidate) =>
        candidate.packageId === target.packageId &&
        candidate.version === target.version,
    ) ?? null;
  if (!pkg) return null;

  const exportEntry =
    pkg.exports.find((candidate) => candidate.exportKey === target.exportKey) ?? null;
  if (!exportEntry) return null;

  const graph = pkg.graphs.find((candidate) => candidate.id === exportEntry.graphId) ?? null;
  return pkg && graph ? { pkg, graph } : null;
}
```

```ts
// src/app/state/documentReducer.ts
import { installPackageBundle } from "../../domain/package/install";
import type { GraphPackageFile, WorkspacePackageManifest } from "../../domain/package/types";

export type EditorAction =
  | { type: "install-package"; packageFile: GraphPackageFile }
  | { type: "set-package-manifest"; packageManifest: WorkspacePackageManifest | null }
  // existing actions...

case "install-package":
  return {
    ...state,
    workspace: installPackageBundle(state.workspace, action.packageFile),
  };
case "set-package-manifest":
  return {
    ...state,
    workspace: {
      ...state.workspace,
      packageManifest: action.packageManifest,
    },
  };
```

```ts
// src/features/document-storage/fileIO.ts
import type { GraphPackageFile } from "../../domain/package/types";

export function parsePackageJson(raw: string): GraphPackageFile {
  const parsed = JSON.parse(raw);
  if (!isGraphPackageFile(parsed)) {
    throw new Error("Invalid package JSON");
  }
  return parsed;
}

function normalizeWorkspace(workspace: GraphWorkspace): GraphWorkspace {
  return {
    ...workspace,
    installedPackages: workspace.installedPackages ?? [],
    packageManifest: workspace.packageManifest ?? null,
    graphs: workspace.graphs.map((graph) => normalizeDocumentOutputs(graph)),
  };
}

function normalizeSubgraphNodeData(value: Record<string, unknown>) {
  if ("target" in value && isRecord(value.target)) {
    return value.target;
  }

  if (typeof value.graphId === "string") {
    return { kind: "local" as const, graphId: value.graphId };
  }

  return { kind: "local" as const, graphId: "" };
}
```

- [ ] **Step 4: Run the focused tests to verify they pass**

Run: `bun test src/domain/package/install.test.ts src/features/document-storage/fileIO.test.ts src/app/state/documentReducer.test.ts`

Expected: PASS with deduped installs, package-aware workspace round-trips, package-file parsing, and reducer support for package inventory and manifest updates.

- [ ] **Step 5: Commit the persistence and package model changes**

```bash
git add src/domain/package/types.ts \
  src/domain/package/install.ts \
  src/domain/package/install.test.ts \
  src/domain/document/types.ts \
  src/domain/workspace/sample.ts \
  src/features/document-storage/fileIO.ts \
  src/features/document-storage/fileIO.test.ts \
  src/app/state/documentReducer.ts \
  src/app/state/documentReducer.test.ts
git commit -m "feat: add package-aware workspace model"
```

## Task 2: Add Package Authoring, Export, Import, And Inventory UI

**Files:**
- Create: `src/domain/package/export.ts`
- Create: `src/domain/package/export.test.ts`
- Create: `src/features/packages/PackageManifestModal.tsx`
- Create: `src/features/packages/PackageManifestModal.test.tsx`
- Create: `src/features/packages/InstalledPackageList.tsx`
- Create: `src/features/packages/InstalledPackageList.test.tsx`
- Modify: `src/features/document-storage/DocumentToolbar.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/features/workspace/GraphCatalog.tsx`
- Modify: `src/features/workspace/GraphCatalog.test.tsx`
- Modify: `src/features/i18n/types.ts`
- Modify: `src/features/i18n/messages.ts`
- Modify: `src/index.css`
- Test: `src/domain/package/export.test.ts`
- Test: `src/features/packages/PackageManifestModal.test.tsx`
- Test: `src/features/packages/InstalledPackageList.test.tsx`
- Test: `src/App.test.tsx`
- Test: `src/features/workspace/GraphCatalog.test.tsx`

- [ ] **Step 1: Write the failing authoring and inventory tests**

```ts
// src/domain/package/export.test.ts
import { describe, expect, test } from "bun:test";
import { buildPackageFileFromWorkspace } from "./export";
import type { GraphWorkspace } from "../document/types";

describe("buildPackageFileFromWorkspace", () => {
  test("exports only explicit public graphs plus reachable internal helpers", () => {
    const workspace: GraphWorkspace = {
      version: 2,
      metadata: { name: "Workspace" },
      entryGraphId: "graph-public",
      graphs: [
        {
          id: "graph-public",
          metadata: { name: "Public" },
          viewport: { x: 0, y: 0, zoom: 1 },
          nodes: [
            {
              id: "subgraph-helper",
              kind: "subgraph",
              label: "Helper",
              position: { x: 0, y: 0 },
              data: { target: { kind: "local", graphId: "graph-helper" } },
            },
          ],
          edges: [],
        },
        {
          id: "graph-helper",
          metadata: { name: "Helper" },
          viewport: { x: 0, y: 0, zoom: 1 },
          nodes: [],
          edges: [],
        },
        {
          id: "graph-private-unused",
          metadata: { name: "Unused" },
          viewport: { x: 0, y: 0, zoom: 1 },
          nodes: [],
          edges: [],
        },
      ],
      installedPackages: [],
      packageManifest: {
        packageId: "team/app-lib",
        version: "0.1.0",
        name: "App Lib",
        exports: [
          { exportKey: "public_graph", graphId: "graph-public", displayName: "Public" },
        ],
      },
    };

    const pkg = buildPackageFileFromWorkspace(workspace);
    expect(pkg.packageId).toBe("team/app-lib");
    expect(pkg.graphs.map((graph) => graph.id).sort()).toEqual([
      "graph-helper",
      "graph-public",
    ]);
    expect(pkg.graphs.some((graph) => graph.id === "graph-private-unused")).toBe(false);
  });
});
```

```tsx
// src/features/packages/PackageManifestModal.test.tsx
import { describe, expect, mock, test } from "bun:test";
import userEvent from "@testing-library/user-event";
import { render, screen } from "@testing-library/react";
import { PackageManifestModal } from "./PackageManifestModal";

test("edits package manifest metadata and export rows", async () => {
  const user = userEvent.setup();
  const onSave = mock();

  render(
    <PackageManifestModal
      graphs={[
        { id: "graph-public", metadata: { name: "Public" } } as never,
        { id: "graph-helper", metadata: { name: "Helper" } } as never,
      ]}
      value={null}
      onClose={() => {}}
      onSave={onSave}
    />,
  );

  await user.type(screen.getByLabelText("Package ID"), "team/app-lib");
  await user.type(screen.getByLabelText("Version"), "0.1.0");
  await user.type(screen.getByLabelText("Package name"), "App Lib");
  await user.click(screen.getByRole("button", { name: "Add export" }));
  await user.type(screen.getByLabelText("Export key 1"), "public_graph");
  await user.selectOptions(screen.getByLabelText("Export graph 1"), "graph-public");
  await user.click(screen.getByRole("button", { name: "Save" }));

  expect(onSave).toHaveBeenCalledWith({
    packageId: "team/app-lib",
    version: "0.1.0",
    name: "App Lib",
    description: "",
    exports: [
      { exportKey: "public_graph", graphId: "graph-public", displayName: "Public" },
    ],
  });
});
```

```tsx
// src/features/packages/InstalledPackageList.test.tsx
import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { InstalledPackageList } from "./InstalledPackageList";

test("renders installed package ids versions and export counts", () => {
  render(
    <InstalledPackageList
      packages={[
        {
          packageId: "team/sales-lib",
          version: "1.2.0",
          metadata: { name: "Sales Lib" },
          exports: [
            { exportKey: "daily_orders", graphId: "pkg-graph", displayName: "Daily Orders" },
            { exportKey: "weekly_orders", graphId: "pkg-graph-2", displayName: "Weekly Orders" },
          ],
          graphs: [],
          dependencyRefs: [],
        },
      ]}
    />,
  );

  expect(screen.getByText("team/sales-lib")).toBeTruthy();
  expect(screen.getByText("1.2.0")).toBeTruthy();
  expect(screen.getByText("2 exports")).toBeTruthy();
});
```

```tsx
// src/App.test.tsx
test("installs a package from toolbar import and renders it in package inventory", async () => {
  const user = userEvent.setup();
  render(<App />);

  const packageFile = new File(
    [
      JSON.stringify({
        formatVersion: 1,
        packageId: "team/sales-lib",
        version: "1.2.0",
        metadata: { name: "Sales Lib" },
        exports: [{ exportKey: "daily_orders", graphId: "pkg-graph", displayName: "Daily Orders" }],
        graphs: [
          {
            id: "pkg-graph",
            metadata: { name: "Daily Orders" },
            viewport: { x: 0, y: 0, zoom: 1 },
            nodes: [],
            edges: [],
          },
        ],
        dependencies: [],
      }),
    ],
    "sales-lib.qvpkg.json",
    { type: "application/json" },
  );

  const input = screen.getByLabelText("Install package file");
  await user.upload(input, packageFile);

  expect(await screen.findByText("team/sales-lib")).toBeTruthy();
});
```

```tsx
// src/features/workspace/GraphCatalog.test.tsx
test("shows only local graphs in the graph catalog even when packages are installed", () => {
  render(
    <GraphCatalog
      workspace={
        {
          version: 2,
          metadata: { name: "Workspace" },
          entryGraphId: "graph-main",
          graphs: [
            { id: "graph-main", metadata: { name: "Main" }, viewport: { x: 0, y: 0, zoom: 1 }, nodes: [], edges: [] },
          ],
          installedPackages: [
            {
              packageId: "team/sales-lib",
              version: "1.2.0",
              metadata: { name: "Sales Lib" },
              exports: [{ exportKey: "daily_orders", graphId: "pkg-graph", displayName: "Daily Orders" }],
              graphs: [],
              dependencyRefs: [],
            },
          ],
          packageManifest: null,
        } as never
      }
      activeGraphId="graph-main"
      onOpenGraph={() => {}}
      onCreateGraph={() => {}}
      onRenameGraph={() => {}}
      onDeleteGraph={() => {}}
    />,
  );

  expect(screen.getByText("Main")).toBeTruthy();
  expect(screen.queryByText("Sales Lib")).toBeNull();
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `bun test src/domain/package/export.test.ts src/features/packages/PackageManifestModal.test.tsx src/features/packages/InstalledPackageList.test.tsx src/App.test.tsx src/features/workspace/GraphCatalog.test.tsx`

Expected: FAIL because package export authoring, package inventory UI, toolbar import/export flows, and installed package shell components do not exist yet.

- [ ] **Step 3: Implement package export helpers, manifest modal, toolbar/package inventory UI, and i18n**

```ts
// src/domain/package/export.ts
import type { GraphWorkspace } from "../document/types";
import type { GraphPackageFile } from "./types";

function collectReachableLocalGraphIds(workspace: GraphWorkspace, rootGraphId: string, seen = new Set<string>()) {
  if (seen.has(rootGraphId)) return seen;
  seen.add(rootGraphId);

  const graph = workspace.graphs.find((candidate) => candidate.id === rootGraphId);
  if (!graph) return seen;

  for (const node of graph.nodes) {
    if (node.kind !== "subgraph" || node.data.target.kind !== "local") {
      continue;
    }
    collectReachableLocalGraphIds(workspace, node.data.target.graphId, seen);
  }

  return seen;
}

export function buildPackageFileFromWorkspace(workspace: GraphWorkspace): GraphPackageFile {
  const manifest = workspace.packageManifest;
  if (!manifest) {
    throw new Error("Workspace package manifest is missing");
  }

  const graphIds = new Set<string>();
  for (const exportEntry of manifest.exports) {
    for (const graphId of collectReachableLocalGraphIds(workspace, exportEntry.graphId)) {
      graphIds.add(graphId);
    }
  }

  return {
    formatVersion: 1,
    packageId: manifest.packageId,
    version: manifest.version,
    metadata: {
      name: manifest.name,
      ...(manifest.description ? { description: manifest.description } : {}),
    },
    exports: manifest.exports,
    graphs: workspace.graphs.filter((graph) => graphIds.has(graph.id)),
    dependencies: workspace.installedPackages.map((pkg) => ({
      formatVersion: 1,
      packageId: pkg.packageId,
      version: pkg.version,
      metadata: pkg.metadata,
      exports: pkg.exports,
      graphs: pkg.graphs,
      dependencies: [],
    })),
  };
}
```

```tsx
// src/features/document-storage/DocumentToolbar.tsx
const packageInputRef = useRef<HTMLInputElement>(null);
const [showManifestModal, setShowManifestModal] = useState(false);

<button type="button" className="ghost-button" onClick={() => packageInputRef.current?.click()}>
  {t("toolbar.installPackage")}
</button>
<button type="button" className="ghost-button" onClick={() => setShowManifestModal(true)}>
  {t("toolbar.exportPackage")}
</button>
<input
  ref={packageInputRef}
  type="file"
  accept="application/json"
  hidden
  aria-label={t("toolbar.installPackageFile")}
  onChange={async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const raw = await file.text();
    dispatch({ type: "install-package", packageFile: parsePackageJson(raw) });
    event.target.value = "";
  }}
/>;
```

```tsx
// src/App.tsx
<aside className="sidebar">
  <DocumentToolbar />
  <GraphCatalog />
  <InstalledPackageList packages={state.workspace.installedPackages} />
</aside>
```

```ts
// src/features/i18n/types.ts
| "toolbar.installPackage"
| "toolbar.exportPackage"
| "toolbar.installPackageFile"
| "packages.title"
| "packages.exportsCount"
| "packageManifest.title"
| "packageManifest.packageId"
| "packageManifest.version"
| "packageManifest.name"
| "packageManifest.description"
| "packageManifest.addExport"
| "packageManifest.exportKey"
| "packageManifest.exportGraph"
```

- [ ] **Step 4: Run the focused tests to verify they pass**

Run: `bun test src/domain/package/export.test.ts src/features/packages/PackageManifestModal.test.tsx src/features/packages/InstalledPackageList.test.tsx src/App.test.tsx src/features/workspace/GraphCatalog.test.tsx`

Expected: PASS with explicit package authoring, toolbar package import/export actions, installed package inventory rendering, and local-graph catalog separation.

- [ ] **Step 5: Commit the package authoring and inventory UI**

```bash
git add src/domain/package/export.ts \
  src/domain/package/export.test.ts \
  src/features/packages/PackageManifestModal.tsx \
  src/features/packages/PackageManifestModal.test.tsx \
  src/features/packages/InstalledPackageList.tsx \
  src/features/packages/InstalledPackageList.test.tsx \
  src/features/document-storage/DocumentToolbar.tsx \
  src/App.tsx \
  src/App.test.tsx \
  src/features/workspace/GraphCatalog.tsx \
  src/features/workspace/GraphCatalog.test.tsx \
  src/features/i18n/types.ts \
  src/features/i18n/messages.ts \
  src/index.css
git commit -m "feat: add package authoring and install UI"
```

## Task 3: Let `subgraph` Nodes Target Local Graphs Or Installed Package Exports

**Files:**
- Modify: `src/domain/workspace/interfaces.ts`
- Modify: `src/features/graph-editor/nodeEditors.tsx`
- Modify: `src/features/graph-editor/NodeEditorModal.test.tsx`
- Modify: `src/domain/graph/expressionScope.ts`
- Modify: `src/domain/graph/expressionScope.test.ts`
- Modify: `src/domain/graph/inferSchemas.ts`
- Modify: `src/domain/graph/inferSchemas.test.ts`
- Modify: `src/domain/graph/validate.ts`
- Modify: `src/domain/graph/validate.test.ts`
- Modify: `src/domain/compile/compileOutput.ts`
- Modify: `src/domain/compile/compileOutput.test.ts`
- Test: `src/features/graph-editor/NodeEditorModal.test.tsx`
- Test: `src/domain/graph/expressionScope.test.ts`
- Test: `src/domain/graph/inferSchemas.test.ts`
- Test: `src/domain/graph/validate.test.ts`
- Test: `src/domain/compile/compileOutput.test.ts`

- [ ] **Step 1: Write the failing local/package target resolution tests**

```tsx
// src/features/graph-editor/NodeEditorModal.test.tsx
test("subgraph editor can target an installed package export", async () => {
  const user = userEvent.setup();
  const onSave = mock();
  const workspace: GraphWorkspace = {
    version: 2,
    metadata: { name: "Workspace" },
    entryGraphId: "graph-main",
    graphs: [
      {
        id: "graph-main",
        metadata: { name: "Main" },
        viewport: { x: 0, y: 0, zoom: 1 },
        nodes: [
          {
            id: "subgraph-1",
            kind: "subgraph",
            label: "Library Query",
            position: { x: 0, y: 0 },
            data: { target: { kind: "local", graphId: "" } },
          },
        ],
        edges: [],
      },
    ],
    installedPackages: [
      {
        packageId: "team/sales-lib",
        version: "1.2.0",
        metadata: { name: "Sales Lib" },
        exports: [
          { exportKey: "daily_orders", graphId: "pkg-graph", displayName: "Daily Orders" },
        ],
        graphs: [
          {
            id: "pkg-graph",
            metadata: { name: "Daily Orders" },
            viewport: { x: 0, y: 0, zoom: 1 },
            nodes: [],
            edges: [],
          },
        ],
        dependencyRefs: [],
      },
    ],
    packageManifest: null,
  };

  const node = workspace.graphs[0]!.nodes[0]!;
  renderModal({ node, workspace, onSave });

  await user.selectOptions(screen.getByLabelText("Subgraph source"), "package");
  await user.selectOptions(
    screen.getByLabelText("Package export"),
    "team/sales-lib@1.2.0#daily_orders",
  );
  await user.click(screen.getByRole("button", { name: "Save" }));

  expect(onSave.mock.calls[0][0].data.target).toEqual({
    kind: "package",
    packageId: "team/sales-lib",
    version: "1.2.0",
    exportKey: "daily_orders",
  });
});
```

```ts
// src/domain/graph/inferSchemas.test.ts
test("infers downstream schema through an installed package export target", () => {
  const workspace = createWorkspaceWithInstalledPackageParent();
  const schemas = inferWorkspaceGraphSchemas(workspace, "graph-parent");
  expect(schemas["subgraph-orders"]).toEqual({ total: "float" });
});
```

```ts
// src/domain/graph/validate.test.ts
test("reports a missing installed package export target", () => {
  const workspace = createWorkspaceWithMissingPackageExport();
  const semantic = validateOutput(workspace, "graph-parent", "output-parent");

  expect(
    semantic.diagnostics.some(
      (diagnostic) =>
        diagnostic.level === "error" &&
        diagnostic.code === "subgraph.missing-package-export",
    ),
  ).toBe(true);
});
```

```ts
// src/domain/compile/compileOutput.test.ts
test("compiles a parent output that references an installed package export", () => {
  const workspace = createWorkspaceWithInstalledPackageParent();
  const result = compileOutput(workspace, "graph-parent", "output-parent");
  expect(result.sql).toContain("SELECT");
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `bun test src/features/graph-editor/NodeEditorModal.test.tsx src/domain/graph/expressionScope.test.ts src/domain/graph/inferSchemas.test.ts src/domain/graph/validate.test.ts src/domain/compile/compileOutput.test.ts`

Expected: FAIL because `subgraph` nodes still assume only local `graphId` references and no domain layer resolves installed package export targets.

- [ ] **Step 3: Implement unified local/package subgraph target selection and domain resolution**

```ts
// src/domain/workspace/interfaces.ts
import type { SubgraphTarget, GraphDefinition, GraphWorkspace } from "../document/types";
import { resolveInstalledPackageExport } from "../package/install";

export function resolveSubgraphTarget(
  workspace: GraphWorkspace | null | undefined,
  target: SubgraphTarget,
): { graph: GraphDefinition | null; label: string | null } {
  if (!workspace) {
    return { graph: null, label: null };
  }

  if (target.kind === "local") {
    const graph = findGraphById(workspace, target.graphId);
    return { graph, label: graph?.metadata.name ?? null };
  }

  const resolved = resolveInstalledPackageExport(workspace, target);
  return {
    graph: resolved?.graph ?? null,
    label: resolved ? `${resolved.pkg.packageId}@${resolved.pkg.version}#${target.exportKey}` : null,
  };
}

export function inferChildGraphInterface(
  workspace: GraphWorkspace | null | undefined,
  target: SubgraphTarget,
): { graph: GraphDefinition | null; iface: InferredGraphInterface } {
  const resolved = resolveSubgraphTarget(workspace, target);
  return resolved.graph
    ? { graph: resolved.graph, iface: inferGraphInterface(resolved.graph) }
    : { graph: null, iface: { inputs: [], outputs: [] } };
}
```

```tsx
// src/features/graph-editor/nodeEditors.tsx
const packageExportOptions =
  options?.workspace?.installedPackages.flatMap((pkg) =>
    pkg.exports.map((exportEntry) => ({
      value: `${pkg.packageId}@${pkg.version}#${exportEntry.exportKey}`,
      label: `${pkg.packageId}@${pkg.version}#${exportEntry.exportKey}`,
      target: {
        kind: "package" as const,
        packageId: pkg.packageId,
        version: pkg.version,
        exportKey: exportEntry.exportKey,
      },
    })),
  ) ?? [];

<label>
  {t("editor.subgraphSource")}
  <select
    value={draft.data.target.kind}
    onChange={(event) =>
      setDraft({
        ...draft,
        data: {
          target:
            event.target.value === "package"
              ? { kind: "package", packageId: "", version: "", exportKey: "" }
              : { kind: "local", graphId: "" },
        },
      })
    }
  >
    <option value="local">{t("editor.subgraphSource.local")}</option>
    <option value="package">{t("editor.subgraphSource.package")}</option>
  </select>
</label>
```

```ts
// src/domain/compile/compileOutput.ts
if (sourceNode.kind !== "subgraph") {
  // existing path
}

const resolved = resolveSubgraphTarget(params.workspace, sourceNode.data.target);
if (!resolved.graph) {
  return null;
}

const childGraph = resolved.graph;
```

```ts
// src/domain/graph/validate.ts
if (node.kind === "subgraph") {
  const resolved = resolveSubgraphTarget(workspace, node.data.target);
  if (!resolved.graph) {
    diagnostics.push({
      level: "error",
      code: "subgraph.missing-package-export",
      message: "Subgraph target could not be resolved.",
      ref: { nodeId: node.id },
    });
    return invalid;
  }
}
```

- [ ] **Step 4: Run the focused tests to verify they pass**

Run: `bun test src/features/graph-editor/NodeEditorModal.test.tsx src/domain/graph/expressionScope.test.ts src/domain/graph/inferSchemas.test.ts src/domain/graph/validate.test.ts src/domain/compile/compileOutput.test.ts`

Expected: PASS with unified subgraph targeting, package export interface inference, package-aware validation, and package-targeted compilation.

- [ ] **Step 5: Commit package-targeted subgraph resolution**

```bash
git add src/domain/workspace/interfaces.ts \
  src/features/graph-editor/nodeEditors.tsx \
  src/features/graph-editor/NodeEditorModal.test.tsx \
  src/domain/graph/expressionScope.ts \
  src/domain/graph/expressionScope.test.ts \
  src/domain/graph/inferSchemas.ts \
  src/domain/graph/inferSchemas.test.ts \
  src/domain/graph/validate.ts \
  src/domain/graph/validate.test.ts \
  src/domain/compile/compileOutput.ts \
  src/domain/compile/compileOutput.test.ts
git commit -m "feat: support package-backed subgraph targets"
```

## Task 4: Add Explicit Upgrade Compatibility Checks And Pinned Package Upgrade UI

**Files:**
- Create: `src/domain/package/compatibility.ts`
- Create: `src/domain/package/compatibility.test.ts`
- Modify: `src/features/graph-editor/nodeEditors.tsx`
- Modify: `src/features/graph-editor/NodeEditorModal.test.tsx`
- Modify: `src/features/i18n/types.ts`
- Modify: `src/features/i18n/messages.ts`
- Test: `src/domain/package/compatibility.test.ts`
- Test: `src/features/graph-editor/NodeEditorModal.test.tsx`

- [ ] **Step 1: Write the failing compatibility and upgrade tests**

```ts
// src/domain/package/compatibility.test.ts
import { describe, expect, test } from "bun:test";
import { isPackageUpgradeCompatible } from "./compatibility";

describe("isPackageUpgradeCompatible", () => {
  test("blocks upgrades when an existing connected input handle disappears", () => {
    expect(
      isPackageUpgradeCompatible({
        currentInputs: ["in:orders"],
        currentOutputs: ["out:daily_orders"],
        nextInputs: [],
        nextOutputs: ["out:daily_orders"],
      }).ok,
    ).toBe(false);
  });

  test("allows upgrades when used handles and output exports still exist", () => {
    expect(
      isPackageUpgradeCompatible({
        currentInputs: ["in:orders"],
        currentOutputs: ["out:daily_orders"],
        nextInputs: ["in:orders", "in:extra"],
        nextOutputs: ["out:daily_orders", "out:weekly_orders"],
      }).ok,
    ).toBe(true);
  });
});
```

```tsx
// src/features/graph-editor/NodeEditorModal.test.tsx
test("blocks upgrading a package subgraph when the newer export is incompatible", async () => {
  const user = userEvent.setup();
  const workspace = createWorkspaceWithPinnedAndIncompatiblePackageUpgrade();
  const node = workspace.graphs[0]!.nodes.find((candidate) => candidate.id === "subgraph-1")!;

  renderModal({ node, workspace });

  expect(screen.getByRole("button", { name: "Upgrade to 2.0.0" })).toBeDisabled();
  expect(screen.getByText("Upgrade blocked: incompatible interface")).toBeTruthy();
});

test("allows upgrading a package subgraph when the newer export is compatible", async () => {
  const user = userEvent.setup();
  const onSave = mock();
  const workspace = createWorkspaceWithPinnedAndCompatiblePackageUpgrade();
  const node = workspace.graphs[0]!.nodes.find((candidate) => candidate.id === "subgraph-1")!;

  renderModal({ node, workspace, onSave });
  await user.click(screen.getByRole("button", { name: "Upgrade to 1.3.0" }));
  await user.click(screen.getByRole("button", { name: "Save" }));

  expect(onSave.mock.calls[0][0].data.target).toMatchObject({
    kind: "package",
    packageId: "team/sales-lib",
    version: "1.3.0",
    exportKey: "daily_orders",
  });
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `bun test src/domain/package/compatibility.test.ts src/features/graph-editor/NodeEditorModal.test.tsx`

Expected: FAIL because there is no compatibility helper and no pinned-version upgrade UI in the subgraph editor.

- [ ] **Step 3: Implement compatibility checks and explicit package upgrade controls**

```ts
// src/domain/package/compatibility.ts
export function isPackageUpgradeCompatible(params: {
  currentInputs: string[];
  currentOutputs: string[];
  nextInputs: string[];
  nextOutputs: string[];
}) {
  for (const input of params.currentInputs) {
    if (!params.nextInputs.includes(input)) {
      return { ok: false as const, reason: "missing-input-handle" };
    }
  }

  for (const output of params.currentOutputs) {
    if (!params.nextOutputs.includes(output)) {
      return { ok: false as const, reason: "missing-output-handle" };
    }
  }

  return { ok: true as const };
}
```

```tsx
// src/features/graph-editor/nodeEditors.tsx
const availableUpgrades =
  draft.data.target.kind === "package"
    ? (options?.workspace?.installedPackages ?? [])
        .filter(
          (pkg) =>
            pkg.packageId === draft.data.target.packageId &&
            pkg.version !== draft.data.target.version &&
            pkg.exports.some((entry) => entry.exportKey === draft.data.target.exportKey),
        )
    : [];

{availableUpgrades.map((pkg) => {
  const compatibility = isPackageUpgradeCompatible(/* derive used handles from current graph wiring */);
  return (
    <button
      key={pkg.version}
      type="button"
      disabled={!compatibility.ok}
      onClick={() =>
        setDraft({
          ...draft,
          data: {
            target: {
              kind: "package",
              packageId: draft.data.target.packageId,
              version: pkg.version,
              exportKey: draft.data.target.exportKey,
            },
          },
        })
      }
    >
      {t("editor.packageUpgradeTo", { version: pkg.version })}
    </button>
  );
})}
```

```ts
// src/features/i18n/types.ts
| "editor.subgraphSource"
| "editor.subgraphSource.local"
| "editor.subgraphSource.package"
| "editor.packageExport"
| "editor.packageUpgradeTo"
| "editor.packageUpgradeBlocked"
```

- [ ] **Step 4: Run the focused tests to verify they pass**

Run: `bun test src/domain/package/compatibility.test.ts src/features/graph-editor/NodeEditorModal.test.tsx`

Expected: PASS with blocked incompatible upgrades, allowed compatible upgrades, and explicit version-pinned subgraph upgrade controls.

- [ ] **Step 5: Commit the upgrade compatibility flow**

```bash
git add src/domain/package/compatibility.ts \
  src/domain/package/compatibility.test.ts \
  src/features/graph-editor/nodeEditors.tsx \
  src/features/graph-editor/NodeEditorModal.test.tsx \
  src/features/i18n/types.ts \
  src/features/i18n/messages.ts
git commit -m "feat: add pinned package upgrade checks"
```

## Task 5: Full Verification

**Files:**
- No additional source files
- Test: full repository checks

- [ ] **Step 1: Run the full test suite**

Run: `bun test`

Expected: PASS with package import/export, package-backed subgraph resolution, and upgrade compatibility coverage added to the existing suite.

- [ ] **Step 2: Run the production build**

Run: `bun run build`

Expected: PASS and emit the production bundle without type or build errors.

- [ ] **Step 3: Prepare branch completion**

Run:

```bash
git status --short
git log --oneline --decorate -6
```

Expected: clean working tree aside from the plan/spec docs if not yet committed, and a short history showing package-sharing implementation commits in order.
