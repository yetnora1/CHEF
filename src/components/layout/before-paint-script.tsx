"use client";

/**
 * Runs a small inline script before first paint (see the Next.js guide
 * "Preventing flash before hydration"), such as one that applies a stored
 * theme. Render inside <head> of a root layout, and put
 * suppressHydrationWarning on <html> because the script sets attributes there
 * before React hydrates.
 *
 * The server sends an executable script, which the browser runs while parsing
 * the HTML. When React renders it again in the browser (for example a
 * not-found page rendered on the client), it is an inert `text/plain` block:
 * the script has already run, and React does not warn about rendering a
 * script it would never execute. suppressHydrationWarning covers the type
 * difference.
 */
export function BeforePaintScript({ code }: { code: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: code }}
    />
  );
}
