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

