import type { OutputListenerConfig } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function createDefaultOutputListenerConfig(outputName: string): OutputListenerConfig {
  return {
    copyToClipboard: false,
    logToConsole: false,
    saveToLocalStorage: {
      enabled: false,
      key: `queryvisual.output.${outputName}`,
    },
  };
}

export function isOutputListenerConfig(value: unknown): value is OutputListenerConfig {
  return (
    isRecord(value) &&
    typeof value.copyToClipboard === "boolean" &&
    typeof value.logToConsole === "boolean" &&
    isRecord(value.saveToLocalStorage) &&
    typeof value.saveToLocalStorage.enabled === "boolean" &&
    typeof value.saveToLocalStorage.key === "string"
  );
}

export function normalizeOutputListenerConfig(
  outputName: string,
  value: unknown,
): OutputListenerConfig {
  const defaults = createDefaultOutputListenerConfig(outputName);

  if (!isRecord(value)) {
    return defaults;
  }

  const saveToLocalStorage = isRecord(value.saveToLocalStorage)
    ? value.saveToLocalStorage
    : null;

  return {
    copyToClipboard:
      typeof value.copyToClipboard === "boolean"
        ? value.copyToClipboard
        : defaults.copyToClipboard,
    logToConsole:
      typeof value.logToConsole === "boolean"
        ? value.logToConsole
        : defaults.logToConsole,
    saveToLocalStorage: {
      enabled:
        saveToLocalStorage && typeof saveToLocalStorage.enabled === "boolean"
          ? saveToLocalStorage.enabled
          : defaults.saveToLocalStorage.enabled,
      key:
        saveToLocalStorage && typeof saveToLocalStorage.key === "string"
          ? saveToLocalStorage.key
          : defaults.saveToLocalStorage.key,
    },
  };
}
