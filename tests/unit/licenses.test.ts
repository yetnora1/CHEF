import { describe, expect, it } from "vitest";
import { licenseUrl } from "@/features/content/licenses";

describe("licenseUrl", () => {
  it("links each licence used by the sample media to its deed", () => {
    expect(licenseUrl("CC BY-SA 2.0")).toBe("https://creativecommons.org/licenses/by-sa/2.0/");
    expect(licenseUrl("CC BY-SA 3.0")).toBe("https://creativecommons.org/licenses/by-sa/3.0/");
    expect(licenseUrl("CC BY-SA 4.0")).toBe("https://creativecommons.org/licenses/by-sa/4.0/");
    expect(licenseUrl("CC BY 4.0")).toBe("https://creativecommons.org/licenses/by/4.0/");
    expect(licenseUrl("CC BY 3.0 PL")).toBe("https://creativecommons.org/licenses/by/3.0/pl/");
    expect(licenseUrl("Pexels License")).toBe("https://www.pexels.com/license/");
  });

  it("returns null for anything it cannot map, rather than a wrong link", () => {
    for (const name of ["CC0", "CC BY-NC 4.0", "Public domain", "cc by 4.0", "CC BY-SA 4.0 extra"]) {
      expect(licenseUrl(name)).toBeNull();
    }
  });
});
