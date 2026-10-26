import { Manrope, Noto_Sans_Ethiopic } from "next/font/google";

/*
 * Both families are SIL Open Font License 1.1. next/font downloads them at
 * build time and serves them from this site, so visitors never contact Google.
 *
 * Latin:    Manrope, for headings and body text alike
 * Ethiopic: Noto Sans Ethiopic, covering the Ethiopic, Ethiopic Supplement and
 *           Ethiopic Extended blocks used by Amharic.
 *
 * Only the `ethiopic` subset of Noto Sans Ethiopic is requested; Latin text
 * keeps using Manrope through the font stacks in globals.css. It is preloaded
 * because the language switcher renders Ethiopic ("አማርኛ") on every page.
 */

export const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

export const notoSansEthiopic = Noto_Sans_Ethiopic({
  subsets: ["ethiopic"],
  variable: "--font-noto-sans-ethiopic",
  display: "swap",
});

export const fontVariables = [manrope.variable, notoSansEthiopic.variable].join(" ");
