/**
 * The Creative Commons deed for a licence name as written in the credits, such as
 * "CC BY-SA 4.0" or the ported "CC BY 3.0 PL". Null for anything else, so an
 * unknown name is shown without a link rather than with a wrong one.
 */
export function licenseUrl(license: string): string | null {
  const match = /^CC (BY(?:-SA)?) (\d\.\d)(?: ([A-Z]{2}))?$/.exec(license);
  if (!match) return null;
  const [, terms, version, port] = match;
  return `https://creativecommons.org/licenses/${terms!.toLowerCase()}/${version}/${port ? `${port.toLowerCase()}/` : ""}`;
}
