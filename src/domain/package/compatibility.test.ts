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

  test("blocks upgrades when a used input schema becomes incompatible", () => {
    expect(
      isPackageUpgradeCompatible({
        currentInputs: ["in:orders"],
        currentOutputs: ["out:daily_orders"],
        nextInputs: ["in:orders"],
        nextOutputs: ["out:daily_orders"],
        currentInputSchemas: {
          "in:orders": { order_id: "int", total: "float" },
        },
        nextInputSchemas: {
          "in:orders": { order_id: "int", total: "string" },
        },
      }).ok,
    ).toBe(false);
  });
});
