import { describe, expect, test } from "bun:test";
import type { GraphWorkspace } from "../document/types";
import type { GraphPackageFile } from "./types";
import { installPackageBundle, resolveInstalledPackageExport } from "./install";

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

function createPackageFile(
  partial: Partial<GraphPackageFile> & Pick<GraphPackageFile, "packageId" | "version">,
): GraphPackageFile {
  return {
    formatVersion: 1,
    packageId: partial.packageId,
    version: partial.version,
    metadata: partial.metadata ?? { name: partial.packageId },
    exports: partial.exports ?? [],
    graphs: partial.graphs ?? [],
    dependencies: partial.dependencies ?? [],
  };
}

describe("installPackageBundle", () => {
  test("installs bundled dependencies once and dedupes by packageId + version", () => {
    const workspace = createEmptyWorkspace();

    const sharedDep = createPackageFile({
      packageId: "com.acme/shared",
      version: "1.0.0",
    });

    const pkg = createPackageFile({
      packageId: "com.acme/orders",
      version: "2.0.0",
      dependencies: [sharedDep, sharedDep],
    });

    const next = installPackageBundle(workspace, pkg);

    expect(next.installedPackages.map((p) => `${p.packageId}@${p.version}`)).toEqual([
      "com.acme/shared@1.0.0",
      "com.acme/orders@2.0.0",
    ]);

    const nextAgain = installPackageBundle(next, pkg);
    expect(nextAgain.installedPackages).toHaveLength(2);
  });

  test("guards against cyclic bundled dependencies", () => {
    const workspace = createEmptyWorkspace();

    const pkg: GraphPackageFile = {
      formatVersion: 1,
      packageId: "com.acme/cycle",
      version: "1.0.0",
      metadata: { name: "Cycle" },
      exports: [],
      graphs: [],
      dependencies: [],
    };
    pkg.dependencies = [pkg];

    const next = installPackageBundle(workspace, pkg);
    expect(next.installedPackages.map((p) => `${p.packageId}@${p.version}`)).toEqual([
      "com.acme/cycle@1.0.0",
    ]);
  });

  test("fails clearly for excessively deep bundled dependencies", () => {
    const workspace = createEmptyWorkspace();

    let pkg: GraphPackageFile = {
      formatVersion: 1,
      packageId: "com.acme/root",
      version: "1.0.0",
      metadata: { name: "Root" },
      exports: [],
      graphs: [],
      dependencies: [],
    };

    let cursor = pkg;
    for (let i = 0; i < 200; i++) {
      const next: GraphPackageFile = {
        formatVersion: 1,
        packageId: `com.acme/dep-${i}`,
        version: "1.0.0",
        metadata: { name: `Dep ${i}` },
        exports: [],
        graphs: [],
        dependencies: [],
      };
      cursor.dependencies = [next];
      cursor = next;
    }

    expect(() => installPackageBundle(workspace, pkg)).toThrow();
  });

  test("throws when encountering a conflicting duplicate packageId@version", () => {
    const workspace = createEmptyWorkspace();

    const pkgA: GraphPackageFile = {
      formatVersion: 1,
      packageId: "com.acme/orders",
      version: "1.0.0",
      metadata: { name: "Orders A" },
      exports: [],
      graphs: [],
      dependencies: [],
    };

    const pkgB: GraphPackageFile = {
      formatVersion: 1,
      packageId: "com.acme/orders",
      version: "1.0.0",
      metadata: { name: "Orders B" },
      exports: [],
      graphs: [],
      dependencies: [],
    };

    const root: GraphPackageFile = {
      formatVersion: 1,
      packageId: "com.acme/root",
      version: "1.0.0",
      metadata: { name: "Root" },
      exports: [],
      graphs: [],
      dependencies: [pkgA, pkgB],
    };

    expect(() => installPackageBundle(workspace, root)).toThrow("Conflicting package bundle");
  });

  test("does not treat omitted vs undefined optional fields as conflicting", () => {
    const workspace = createEmptyWorkspace();

    const pkgWithOmitted: GraphPackageFile = {
      formatVersion: 1,
      packageId: "com.acme/orders",
      version: "1.0.0",
      metadata: { name: "Orders" },
      exports: [],
      graphs: [],
      dependencies: [],
    };

    const pkgWithUndefined: GraphPackageFile = {
      formatVersion: 1,
      packageId: "com.acme/orders",
      version: "1.0.0",
      metadata: { name: "Orders", description: undefined },
      exports: [],
      graphs: [],
      dependencies: [],
    };

    const root: GraphPackageFile = {
      formatVersion: 1,
      packageId: "com.acme/root",
      version: "1.0.0",
      metadata: { name: "Root" },
      exports: [],
      graphs: [],
      dependencies: [pkgWithOmitted, pkgWithUndefined],
    };

    const next = installPackageBundle(workspace, root);
    expect(next.installedPackages.filter((p) => p.packageId === "com.acme/orders")).toHaveLength(1);
  });
});

describe("resolveInstalledPackageExport", () => {
  test("resolves a package subgraph target to the exported graph", () => {
    const pkg = createPackageFile({
      packageId: "com.acme/orders",
      version: "2.0.0",
      exports: [
        {
          exportKey: "orders_report",
          graphId: "graph-orders",
          displayName: "Orders Report",
        },
      ],
      graphs: [
        {
          id: "graph-orders",
          metadata: { name: "Orders Graph" },
          viewport: { x: 0, y: 0, zoom: 1 },
          nodes: [],
          edges: [],
        },
      ],
    });

    const workspace = installPackageBundle(createEmptyWorkspace(), pkg);

    const resolved = resolveInstalledPackageExport(workspace, {
      kind: "package",
      packageId: "com.acme/orders",
      version: "2.0.0",
      exportKey: "orders_report",
    });

    expect(resolved?.pkg.packageId).toBe("com.acme/orders");
    expect(resolved?.graph.id).toBe("graph-orders");
  });
});
