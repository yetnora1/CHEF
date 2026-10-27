import { Noto_Sans_Ethiopic } from "next/font/google";

/*
 * Latin text uses the visitor's own system font (Segoe UI on Windows, San
 * Francisco on Apple devices, Roboto on Android), through the font stacks in
 * globals.css. Nothing is downloaded for it.
 *
 * Ethiopic: Noto Sans Ethiopic (SIL Open Font License 1.1), because system
 * Ethiopic coverage varies by device. next/font downloads it at build time and
 * serves it from this site, so visitors never contact Google. Only the
 * `ethiopic` subset is requested (Ethiopic, Ethiopic Supplement and Ethiopic
 * Extended blocks).
 *
 * Not preloaded: the file is ~200 KB, and a preload would fetch it first on
 * every page (English and admin included), ahead of the hero image and the
 * scripts. The @font-face unicode-range makes browsers download it as soon as
 * Ethiopic text is laid out, and `swap` shows the system Ethiopic font meanwhile.
 */

export const notoSansEthiopic = Noto_Sans_Ethiopic({
  subsets: ["ethiopic"],
  variable: "--font-noto-sans-ethiopic",
  display: "swap",
  preload: false,
});

export const fontVariables = notoSansEthiopic.variable;
