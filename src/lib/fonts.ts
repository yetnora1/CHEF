import { Fraunces, Manrope, Noto_Sans_Ethiopic, Noto_Serif_Ethiopic } from "next/font/google";

/*
 * All four families are SIL Open Font License 1.1. next/font downloads them at
 * build time and serves them from this site, so visitors never contact Google.
 *
 * Latin:    Fraunces (editorial display serif), Manrope (interface sans)
 * Ethiopic: Noto Serif Ethiopic and Noto Sans Ethiopic, covering the Ethiopic,
 *           Ethiopic Supplement and Ethiopic Extended blocks used by Amharic.
 *
 * Only the `ethiopic` subset of the Noto faces is requested; Latin text keeps
 * using Fraunces/Manrope through the font stacks in globals.css. Noto Sans
 * Ethiopic is preloaded because the language switcher renders Ethiopic
 * ("አማርኛ") on every page.
 */

export const fraunces = Fraunces({
  subsets: ["latin"],
  axes: ["SOFT", "opsz"],
  variable: "--font-fraunces",
  display: "swap",
});

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

export const notoSerifEthiopic = Noto_Serif_Ethiopic({
  subsets: ["ethiopic"],
  variable: "--font-noto-serif-ethiopic",
  display: "swap",
  preload: false,
});

export const fontVariables = [
  fraunces.variable,
  manrope.variable,
  notoSansEthiopic.variable,
  notoSerifEthiopic.variable,
].join(" ");
