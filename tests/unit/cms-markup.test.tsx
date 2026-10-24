import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Markup, markupToPlainText, parseInline, parseMarkup, safeHref } from "@/features/cms/markup";

const html = (text: string, headingBase: 2 | 3 = 2) =>
  renderToStaticMarkup(<Markup text={text} headingBase={headingBase} />);

describe("safe formatting", () => {
  it("renders paragraphs, line breaks, headings and lists", () => {
    const out = html(
      "## Our menus\n\nFirst line\nsecond line\n\n- Injera\n- Doro wat\n\n1. Book\n2. Taste\n\n### Small",
    );
    expect(out).toBe(
      '<div class="cms-prose"><h2>Our menus</h2><p>First line<br/>second line</p>' +
        "<ul><li>Injera</li><li>Doro wat</li></ul><ol><li>Book</li><li>Taste</li></ol><h3>Small</h3></div>",
    );
    expect(html("## Title", 3)).toContain("<h3>Title</h3>");
    expect(html("### Title", 3)).toContain("<h4>Title</h4>");
  });

  it("renders bold, italic and safe links", () => {
    expect(html("**Fresh** *spiced* _slow_ [book](/en/book) [site](https://example.com/x)")).toBe(
      '<div class="cms-prose"><p><strong>Fresh</strong> <em>spiced</em> <em>slow</em> <a href="/en/book">book</a> ' +
        '<a href="https://example.com/x" rel="noopener noreferrer">site</a></p></div>',
    );
  });

  it("does not treat underscores inside words or spaced asterisks as emphasis", () => {
    expect(parseInline("file_name_here and 2 * 3 * 4")).toEqual([
      { type: "text", text: "file_name_here and 2 * 3 * 4" },
    ]);
  });

  it.each([
    "<script>alert(1)</script>",
    '<img src=x onerror="alert(1)">',
    '<a href="javascript:alert(1)">x</a>',
    "<iframe srcdoc='<script>alert(1)</script>'>",
    "<svg onload=alert(1)>",
  ])("shows HTML as inert text: %s", (payload) => {
    const out = html(payload);
    expect(out).not.toMatch(/<(script|img|iframe|svg|a )/i);
    expect(out).toContain("&lt;");
  });

  it.each([
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "java&#115;cript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "//evil.example/path",
    "/\\evil.example",
    "file:///etc/passwd",
  ])("refuses unsafe link targets: %s", (target) => {
    expect(safeHref(target)).toBeNull();
    const out = html(`[click](${target})`);
    expect(out).not.toContain("<a ");
  });

  it("keeps Amharic text intact", () => {
    const text = "## የምግብ ዝርዝር\n\n**ዶሮ ወጥ** እና _ሽሮ_";
    expect(html(text)).toBe(
      '<div class="cms-prose"><h2>የምግብ ዝርዝር</h2><p><strong>ዶሮ ወጥ</strong> እና <em>ሽሮ</em></p></div>',
    );
  });

  it("ignores blank input and produces plain text for descriptions", () => {
    expect(parseMarkup("  \n\n  ")).toEqual([]);
    expect(markupToPlainText("## Title\n\nSome **bold** [link](/x)\n\n- one\n- two")).toBe(
      "Title Some bold link one two",
    );
  });
});
