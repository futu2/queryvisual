import type { GraphWorkspace, SubgraphTarget } from "../document/types";
import type { GraphDefinition } from "../document/types";
import type { GraphPackageFile, InstalledGraphPackage } from "./types";

const MAX_BUNDLED_DEPENDENCY_DEPTH = 50;

function samePkg(
  a: { packageId: string; version: string },
  b: { packageId: string; version: string },
) {
  return a.packageId === b.packageId && a.version === b.version;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const entries = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`);
  return `{${entries.join(",")}}`;
}

function installedPackageFingerprint(pkg: InstalledGraphPackage): string {
  // Only include persisted content that affects actual behavior.
  return stableStringify({
    packageId: pkg.packageId,
    version: pkg.version,
    metadata: pkg.metadata,
    exports: pkg.exports,
    graphs: pkg.graphs,
    dependencyRefs: pkg.dependencyRefs,
  });
}

function toInstalled(pkg: GraphPackageFile): InstalledGraphPackage {
  const refs = pkg.dependencies.map((dep) => ({ packageId: dep.packageId, version: dep.version }));
  const uniqueRefs = refs.filter(
    (ref, index) =>
      refs.findIndex((candidate) => samePkg(candidate, ref)) === index,
  );

  return {
    packageId: pkg.packageId,
    version: pkg.version,
    metadata: pkg.metadata,
    exports: pkg.exports,
    graphs: pkg.graphs,
    dependencyRefs: uniqueRefs,
  };
}

export function installPackageBundle(
  workspace: GraphWorkspace,
  pkg: GraphPackageFile,
): GraphWorkspace {
  const inProgress = new Set<string>();
  return installPackageBundleInner(workspace, pkg, inProgress, 0);
}

function installPackageBundleInner(
  workspace: GraphWorkspace,
  pkg: GraphPackageFile,
  inProgress: Set<string>,
  depth: number,
): GraphWorkspace {
  if (depth > MAX_BUNDLED_DEPENDENCY_DEPTH) {
    throw new Error("Package bundle dependency depth exceeded");
  }

  const visitKey = `${pkg.packageId}@${pkg.version}`;
  if (inProgress.has(visitKey)) {
    return workspace;
  }

  let next = workspace;

  for (const dep of pkg.dependencies) {
    inProgress.add(visitKey);
    try {
      next = installPackageBundleInner(next, dep, inProgress, depth + 1);
    } finally {
      inProgress.delete(visitKey);
    }
  }

  const existing =
    next.installedPackages.find((installed) => samePkg(installed, pkg)) ?? null;
  if (existing) {
    const incoming = toInstalled(pkg);
    if (installedPackageFingerprint(existing) !== installedPackageFingerprint(incoming)) {
      throw new Error(`Conflicting package bundle: ${visitKey}`);
    }
    return next;
  }

  return {
    ...next,
    installedPackages: [...next.installedPackages, toInstalled(pkg)],
  };
}

export function resolveInstalledPackageExport(
  workspace: GraphWorkspace,
  target: Extract<SubgraphTarget, { kind: "package" }>,
): { pkg: InstalledGraphPackage; graph: GraphDefinition } | null {
  const pkg = workspace.installedPackages.find((candidate) => samePkg(candidate, target)) ?? null;
  if (!pkg) return null;

  const exportEntry =
    pkg.exports.find((candidate) => candidate.exportKey === target.exportKey) ??
    null;
  if (!exportEntry) return null;

  const graph =
    pkg.graphs.find((candidate) => candidate.id === exportEntry.graphId) ?? null;
  if (!graph) return null;

  return { pkg, graph };
}
