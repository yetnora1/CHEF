/**
 * The licence page for a licence name as written in the credits: the Creative
 * Commons deed for names such as "CC BY-SA 4.0" or the ported "CC BY 3.0 PL", or
 * the Pexels License. Null for anything else, so an unknown name is shown without
 * a link rather than with a wrong one.
 */
export function licenseUrl(license: string): string | null {
  if (license === "Pexels License") return "https://www.pexels.com/license/";
  const match = /^CC (BY(?:-SA)?) (\d\.\d)(?: ([A-Z]{2}))?$/.exec(license);
  if (!match) return null;
  const [, terms, version, port] = match;
  return `https://creativecommons.org/licenses/${terms!.toLowerCase()}/${version}/${port ? `${port.toLowerCase()}/` : ""}`;
}
