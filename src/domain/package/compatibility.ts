import type { ColumnMap, ColumnType } from "../schema/types";

function isTypeCompatible(
  currentType: ColumnType | undefined,
  nextType: ColumnType | undefined,
) {
  if (!currentType || !nextType) {
    return false;
  }

  if (currentType === "unknown" || nextType === "unknown") {
    return true;
  }

  return currentType === nextType;
}

export function isPackageUpgradeCompatible(params: {
  currentInputs: string[];
  currentOutputs: string[];
  nextInputs: string[];
  nextOutputs: string[];
  currentInputSchemas?: Record<string, ColumnMap>;
  nextInputSchemas?: Record<string, ColumnMap>;
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

  if (params.currentInputSchemas && params.nextInputSchemas) {
    for (const input of params.currentInputs) {
      const currentSchema = params.currentInputSchemas[input] ?? {};
      const nextSchema = params.nextInputSchemas[input] ?? {};

      for (const [columnName, currentType] of Object.entries(currentSchema)) {
        const nextType = nextSchema[columnName];
        if (!isTypeCompatible(currentType, nextType)) {
          return { ok: false as const, reason: "incompatible-input-schema" };
        }
      }
    }
  }

  return { ok: true as const };
}
