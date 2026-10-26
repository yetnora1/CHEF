import { describe, expect, it } from "vitest";
import { THEME_INIT_SCRIPT, THEME_STORAGE_KEY } from "@/lib/theme";

/** Runs the inline <head> script against a minimal fake document. */
function runInitScript(stored: string | null, { storageThrows = false } = {}) {
  const attributes = new Map<string, string>();
  const document = {
    documentElement: { setAttribute: (name: string, value: string) => attributes.set(name, value) },
  };
  const localStorage = {
    getItem: (key: string) => {
      if (storageThrows) throw new Error("SecurityError");
      return key === THEME_STORAGE_KEY ? stored : null;
    },
  };
  new Function("document", "localStorage", THEME_INIT_SCRIPT)(document, localStorage);
  return attributes.get("data-theme");
}

describe("theme init script", () => {
  it("applies an explicit stored choice before paint", () => {
    expect(runInitScript("dark")).toBe("dark");
    expect(runInitScript("light")).toBe("light");
  });

  it("leaves the attribute unset without a stored choice, so CSS renders light", () => {
    expect(runInitScript(null)).toBeUndefined();
    expect(runInitScript("system")).toBeUndefined();
  });

  it("ignores tampered values and unavailable storage", () => {
    expect(runInitScript('"><img src=x onerror=alert(1)>')).toBeUndefined();
    expect(runInitScript("dark", { storageThrows: true })).toBeUndefined();
  });
});
