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
  const visited = new Set<string>();
  return installPackageBundleInner(workspace, pkg, visited, 0);
}

function installPackageBundleInner(
  workspace: GraphWorkspace,
  pkg: GraphPackageFile,
  visited: Set<string>,
  depth: number,
): GraphWorkspace {
  if (depth > MAX_BUNDLED_DEPENDENCY_DEPTH) {
    throw new Error("Package bundle dependency depth exceeded");
  }

  const visitKey = `${pkg.packageId}@${pkg.version}`;
  if (visited.has(visitKey)) {
    return workspace;
  }
  visited.add(visitKey);

  let next = workspace;

  for (const dep of pkg.dependencies) {
    next = installPackageBundleInner(next, dep, visited, depth + 1);
  }

  const alreadyInstalled = next.installedPackages.some((installed) =>
    samePkg(installed, pkg),
  );
  if (alreadyInstalled) {
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
