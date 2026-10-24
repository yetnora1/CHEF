/*
 * Text normalisation shared by every form that stores user-entered text
 * (inquiries, CMS content): NFC, no control or invisible characters.
 */

// C0/C1 controls, zero-width space, BOM and bidirectional overrides (used in
// "Trojan Source"-style spoofing). ZWJ/ZWNJ are kept: some scripts need them.
const UNSAFE_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F​‎‏‪-‮⁦-⁩﻿]/g;

/** Single-line text: NFC-normalised, unsafe characters removed, whitespace collapsed. */
export function cleanLine(value: string): string {
  return value.normalize("NFC").replace(UNSAFE_CHARS, "").replace(/\s+/g, " ").trim();
}

/** Multi-line text: line breaks kept (at most one blank line), trailing spaces trimmed. */
export function cleanMultiline(value: string): string {
  return value
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(UNSAFE_CHARS, "")
    .replace(/[\t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
