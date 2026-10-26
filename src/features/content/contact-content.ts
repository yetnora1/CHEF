import type { Localized } from "@/lib/localization/translations";

/*
 * CONTACT DETAILS — business facts, filled in only once Chef Harena confirms them
 * ---------------------------------------------------------------------------
 * Never invent a number, address or email here. Each detail appears on
 * /contact as soon as it is set; until then the page offers the inquiry form,
 * which is the working way to reach Chef Harena.
 */
export type ContactDetails = {
  /** In international format, e.g. "+251 …". */
  phone: string | null;
  email: string | null;
  /** The city or area served, per language. */
  location: Localized | null;
};

export const contactDetails: ContactDetails = {
  phone: null,
  email: null,
  location: null,
};
