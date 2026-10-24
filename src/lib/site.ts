import { z } from "zod";

const siteUrl = z.url({ protocol: /^https?$/ }).safeParse(process.env.NEXT_PUBLIC_SITE_URL);

/** Absolute site origin used for canonical and alternate-language URLs. */
export const SITE_URL = new URL(siteUrl.success ? siteUrl.data : "http://localhost:3000");
