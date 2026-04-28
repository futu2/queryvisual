import type { GraphDefinition } from "../document/types";

export const PACKAGE_BUNDLE_MAX_DEPTH = 50;

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

export interface GraphPackageMetadata {
  name: string;
  description?: string;
}

export interface GraphPackageFile {
  formatVersion: 1;
  packageId: string;
  version: string;
  metadata: GraphPackageMetadata;
  exports: GraphPackageExport[];
  graphs: GraphDefinition[];
  // Bundled dependencies shipped inline for offline install.
  dependencies: GraphPackageFile[];
}

export interface GraphPackageDependencyRef {
  packageId: string;
  version: string;
}

export interface InstalledGraphPackage {
  packageId: string;
  version: string;
  metadata: GraphPackageMetadata;
  exports: GraphPackageExport[];
  graphs: GraphDefinition[];
  dependencyRefs: GraphPackageDependencyRef[];
}

export function isWorkspacePackageManifestValid(
  manifest: WorkspacePackageManifest,
  graphs: GraphDefinition[],
): boolean {
  const exportKeys = new Set(manifest.exports.map((entry) => entry.exportKey));
  if (exportKeys.size !== manifest.exports.length) {
    return false;
  }

  const graphIds = new Set(graphs.map((graph) => graph.id));
  return manifest.exports.every((entry) => graphIds.has(entry.graphId));
}
