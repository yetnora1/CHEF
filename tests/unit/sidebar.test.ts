import { describe, expect, it } from "vitest";
import { SIDEBAR_INIT_SCRIPT, SIDEBAR_STORAGE_KEY } from "@/lib/sidebar";

/** Runs the inline <head> script against a minimal fake document. */
function runInitScript(stored: string | null, { storageThrows = false } = {}) {
  const attributes = new Map<string, string>();
  const document = {
    documentElement: { setAttribute: (name: string, value: string) => attributes.set(name, value) },
  };
  const localStorage = {
    getItem: (key: string) => {
      if (storageThrows) throw new Error("SecurityError");
      return key === SIDEBAR_STORAGE_KEY ? stored : null;
    },
  };
  new Function("document", "localStorage", SIDEBAR_INIT_SCRIPT)(document, localStorage);
  return attributes.get("data-sidebar");
}

describe("sidebar init script", () => {
  it("collapses the sidebar before paint when that was the stored choice", () => {
    expect(runInitScript("collapsed")).toBe("collapsed");
  });

  it("leaves the sidebar open without a stored choice", () => {
    expect(runInitScript(null)).toBeUndefined();
    expect(runInitScript("expanded")).toBeUndefined();
  });

  it("ignores tampered values and unavailable storage", () => {
    expect(runInitScript('"><img src=x onerror=alert(1)>')).toBeUndefined();
    expect(runInitScript("collapsed", { storageThrows: true })).toBeUndefined();
  });
});
