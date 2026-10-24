import { describe, expect, it } from "vitest";
import { isSameOriginRequest } from "@/lib/http";

const request = (headers: Record<string, string>) =>
  new Request("https://chiefharena.example/api/admin/media", { method: "POST", headers });

describe("isSameOriginRequest (CSRF guard for route handlers)", () => {
  it("accepts a same-origin browser request", () => {
    expect(
      isSameOriginRequest(
        request({
          "sec-fetch-site": "same-origin",
          origin: "https://chiefharena.example",
          host: "chiefharena.example",
        }),
      ),
    ).toBe(true);
  });

  it("refuses cross-site and same-site requests even when the Origin looks right", () => {
    for (const site of ["cross-site", "same-site", "none"]) {
      expect(
        isSameOriginRequest(
          request({
            "sec-fetch-site": site,
            origin: "https://chiefharena.example",
            host: "chiefharena.example",
          }),
        ),
        site,
      ).toBe(false);
    }
  });

  it("falls back to comparing Origin with the host when Fetch Metadata is missing", () => {
    expect(
      isSameOriginRequest(request({ origin: "https://chiefharena.example", host: "chiefharena.example" })),
    ).toBe(true);
    expect(
      isSameOriginRequest(request({ origin: "https://evil.example", host: "chiefharena.example" })),
    ).toBe(false);
    expect(
      isSameOriginRequest(
        request({ origin: "https://chiefharena.example.evil.example", host: "chiefharena.example" }),
      ),
    ).toBe(false);
  });

  it("compares with the forwarded host behind a proxy", () => {
    const headers = { origin: "https://chiefharena.example", host: "internal:3000" };
    expect(isSameOriginRequest(request(headers))).toBe(false);
    expect(isSameOriginRequest(request({ ...headers, "x-forwarded-host": "chiefharena.example" }))).toBe(
      true,
    );
  });

  it("refuses requests without any origin signal, and opaque or malformed origins", () => {
    expect(isSameOriginRequest(request({ host: "chiefharena.example" }))).toBe(false);
    expect(isSameOriginRequest(request({ origin: "null", host: "chiefharena.example" }))).toBe(false);
    expect(isSameOriginRequest(request({ origin: "not a url", host: "chiefharena.example" }))).toBe(false);
    expect(isSameOriginRequest(request({ origin: "https://chiefharena.example" }))).toBe(false);
  });

  it("accepts same-origin Fetch Metadata without an Origin header", () => {
    expect(
      isSameOriginRequest(request({ "sec-fetch-site": "same-origin", host: "chiefharena.example" })),
    ).toBe(true);
  });
});
