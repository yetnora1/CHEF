import { describe, expect, it } from "vitest";
import { navCurrent } from "@/lib/nav-current";

describe("current page in the public navigation", () => {
  it("marks the page itself and the pages inside its section", () => {
    expect(navCurrent("/services", "/services")).toBe("page");
    expect(navCurrent("/services/weddings", "/services")).toBe("true");
    expect(navCurrent("/journal/a-post", "/journal")).toBe("true");
  });

  it("never marks links to a homepage section", () => {
    expect(navCurrent("/", { pathname: "/", hash: "services" })).toBeUndefined();
    expect(navCurrent("/", "/#about")).toBeUndefined();
  });

  it("marks the homepage only on itself", () => {
    expect(navCurrent("/", "/")).toBe("page");
    expect(navCurrent("/services", "/")).toBeUndefined();
  });

  it("does not match sections that only share a prefix", () => {
    expect(navCurrent("/menu-archive", "/menu")).toBeUndefined();
    expect(navCurrent("/book", "/about")).toBeUndefined();
  });
});
