"use client";

import Link from "next/link";
import { useState, type ComponentProps } from "react";

/**
 * A link for repeated lists and the admin menu: it prefetches once the pointer, a
 * finger or the keyboard reaches it, not when it scrolls into view. Each prefetch
 * of an admin page is a server request, and a list would send dozens on every
 * visit for pages nobody opens.
 */
export function IntentLink({
  onMouseEnter,
  onTouchStart,
  onFocus,
  ...props
}: Omit<ComponentProps<typeof Link>, "prefetch">) {
  const [intent, setIntent] = useState(false);
  return (
    <Link
      {...props}
      prefetch={intent ? null : false}
      onMouseEnter={(event) => {
        setIntent(true);
        onMouseEnter?.(event);
      }}
      onTouchStart={(event) => {
        setIntent(true);
        onTouchStart?.(event);
      }}
      onFocus={(event) => {
        setIntent(true);
        onFocus?.(event);
      }}
    />
  );
}
