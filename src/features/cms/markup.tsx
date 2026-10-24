import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/*
 * Safe formatting for staff-written body text: a small Markdown-like subset
 * parsed into React elements. No HTML is ever produced from content or passed
 * to dangerouslySetInnerHTML, so markup typed into a field shows as text.
 *
 *   ## Heading / ### Smaller heading      (on its own line)
 *   - item  or  1. item                   (every line of the block)
 *   **bold**  *italic*  _italic_          (within a line)
 *   [label](https://…)                     (https, http, mailto, tel, /path, #anchor)
 *
 * Blocks are separated by a blank line; a single line break stays a line break.
 * Unsafe or malformed links are shown as plain text.
 */

export type Inline =
  | { type: "text"; text: string }
  | { type: "strong" | "em"; text: string }
  | { type: "link"; href: string; text: string };

export type Block =
  | { type: "heading"; level: 2 | 3; content: Inline[] }
  | { type: "paragraph"; lines: Inline[][] }
  | { type: "list"; ordered: boolean; items: Inline[][] };

const INLINE =
  /\[([^\]\n]{1,300})\]\(([^()\s]{1,2000})\)|\*\*(?!\s)([^*\n]+?)(?<!\s)\*\*|\*(?!\s)([^*\n]+?)(?<!\s)\*|(?<![\p{L}\p{N}_])_(?!\s)([^_\n]+?)(?<!\s)_(?![\p{L}\p{N}_])/gu;

const ALLOWED_PROTOCOLS = new Set(["https:", "http:", "mailto:", "tel:"]);

/** A link target that is safe to render, or null. */
export function safeHref(raw: string): string | null {
  const value = raw.trim();
  if (/^#[\w-]{1,100}$/.test(value)) return value;
  // Site-relative paths, but not protocol-relative ("//host") or backslash tricks.
  if (/^\/(?![/\\])[^\s\\]*$/.test(value)) return value;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) return null;
  try {
    const url = new URL(value);
    if (!ALLOWED_PROTOCOLS.has(url.protocol)) return null;
    if ((url.protocol === "https:" || url.protocol === "http:") && !url.hostname) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function parseInline(line: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const match of line.matchAll(INLINE)) {
    const index = match.index ?? 0;
    if (index > last) out.push({ type: "text", text: line.slice(last, index) });
    const [whole, label, href, strong, em, emUnderscore] = match;
    if (label !== undefined && href !== undefined) {
      const safe = safeHref(href);
      out.push(safe ? { type: "link", href: safe, text: label } : { type: "text", text: whole });
    } else if (strong !== undefined) {
      out.push({ type: "strong", text: strong });
    } else {
      out.push({ type: "em", text: (em ?? emUnderscore)! });
    }
    last = index + whole.length;
  }
  if (last < line.length) out.push({ type: "text", text: line.slice(last) });
  return out;
}

export function parseMarkup(source: string): Block[] {
  const blocks: Block[] = [];
  const chunks = source
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((chunk) =>
      chunk
        .split("\n")
        .map((line) => line.trimEnd())
        .filter((line) => line.trim() !== ""),
    )
    .filter((lines) => lines.length > 0);

  for (const lines of chunks) {
    let rest = lines;
    const heading = /^(#{1,3})\s+(.+)$/.exec(rest[0]!.trim());
    if (heading) {
      blocks.push({
        type: "heading",
        level: heading[1]!.length === 3 ? 3 : 2,
        content: parseInline(heading[2]!),
      });
      rest = rest.slice(1);
      if (rest.length === 0) continue;
    }
    if (rest.every((line) => /^\s*[-*]\s+\S/.test(line))) {
      blocks.push({
        type: "list",
        ordered: false,
        items: rest.map((line) => parseInline(line.replace(/^\s*[-*]\s+/, ""))),
      });
    } else if (rest.every((line) => /^\s*\d{1,3}[.)]\s+\S/.test(line))) {
      blocks.push({
        type: "list",
        ordered: true,
        items: rest.map((line) => parseInline(line.replace(/^\s*\d{1,3}[.)]\s+/, ""))),
      });
    } else {
      blocks.push({ type: "paragraph", lines: rest.map((line) => parseInline(line.trim())) });
    }
  }
  return blocks;
}

function renderInline(nodes: Inline[]): ReactNode {
  return nodes.map((node, index) => {
    switch (node.type) {
      case "text":
        return <Fragment key={index}>{node.text}</Fragment>;
      case "strong":
        return <strong key={index}>{node.text}</strong>;
      case "em":
        return <em key={index}>{node.text}</em>;
      case "link": {
        const external = /^(https?:)?\/\//i.test(node.href);
        return (
          <a key={index} href={node.href} rel={external ? "noopener noreferrer" : undefined}>
            {node.text}
          </a>
        );
      }
    }
  });
}

/** Staff-written body text, rendered safely. `headingBase` sets the top heading level. */
export function Markup({
  text,
  className,
  headingBase = 2,
  lang,
}: {
  text: string;
  className?: string;
  headingBase?: 2 | 3;
  lang?: string;
}) {
  const blocks = parseMarkup(text);
  return (
    <div className={cn("cms-prose", className)} lang={lang}>
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          const Heading = `h${block.level + headingBase - 2}` as "h2" | "h3" | "h4";
          return <Heading key={index}>{renderInline(block.content)}</Heading>;
        }
        if (block.type === "list") {
          const List = block.ordered ? "ol" : "ul";
          return (
            <List key={index}>
              {block.items.map((item, i) => (
                <li key={i}>{renderInline(item)}</li>
              ))}
            </List>
          );
        }
        return (
          <p key={index}>
            {block.lines.map((line, i) => (
              <Fragment key={i}>
                {i > 0 && <br />}
                {renderInline(line)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

/** The text without formatting syntax (for descriptions and excerpts). */
export function markupToPlainText(text: string): string {
  return parseMarkup(text)
    .flatMap((block) =>
      block.type === "paragraph" ? block.lines : block.type === "list" ? block.items : [block.content],
    )
    .map((nodes) => nodes.map((node) => node.text).join(""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
