"use client";

import type { ComponentProps } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { navCurrent } from "@/lib/nav-current";

/**
 * A navigation link that marks the current page (aria-current="page") or the
 * current section ("true"). Style the state with `aria-[current]:` variants.
 */
export function NavLink({ href, ...props }: ComponentProps<typeof Link>) {
  const pathname = usePathname();
  return <Link href={href} aria-current={navCurrent(pathname, href)} {...props} />;
}
