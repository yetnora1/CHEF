"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

/*
 * Cloudflare Turnstile widget (explicit rendering). The token it produces is
 * verified on the server; this component only obtains it.
 * Remount it (change its React key) to get a fresh token: tokens are single-use.
 */

type TurnstileApi = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export const TURNSTILE_SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

export function TurnstileWidget({
  siteKey,
  action,
  onToken,
}: {
  siteKey: string;
  action: string;
  onToken: (token: string | null) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(() => typeof window !== "undefined" && Boolean(window.turnstile));
  const onTokenRef = useRef(onToken);

  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  useEffect(() => {
    if (!ready || !container.current || !window.turnstile) return;
    const widgetId = window.turnstile.render(container.current, {
      sitekey: siteKey,
      action,
      theme: "auto",
      appearance: "always",
      callback: (token: string) => onTokenRef.current(token),
      "expired-callback": () => onTokenRef.current(null),
      "error-callback": () => onTokenRef.current(null),
    });
    return () => window.turnstile?.remove(widgetId);
  }, [ready, siteKey, action]);

  return (
    <>
      <Script src={TURNSTILE_SCRIPT} strategy="afterInteractive" onReady={() => setReady(true)} />
      <div ref={container} className="min-h-[65px]" />
    </>
  );
}
