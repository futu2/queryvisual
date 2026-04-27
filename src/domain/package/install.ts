import type { GraphWorkspace, SubgraphTarget } from "../document/types";
import type { GraphDefinition } from "../document/types";
import type { GraphPackageFile, InstalledGraphPackage } from "./types";

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
  const installedPackages = (workspace as { installedPackages?: InstalledGraphPackage[] })
    .installedPackages ?? [];

  let next = { ...workspace, installedPackages };

  for (const dep of pkg.dependencies) {
    next = installPackageBundle(next, dep);
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
  const pkg =
    workspace.installedPackages.find((candidate) => samePkg(candidate, target)) ??
    null;
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

