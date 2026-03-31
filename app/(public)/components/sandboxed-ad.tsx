"use client";

import { useRef, useEffect, useState } from "react";

interface SandboxedAdProps {
  /** Raw ad HTML/script code from the database */
  adCode: string;
  /** Ad provider — known providers get slightly relaxed sandbox permissions */
  provider: "adsense" | "carbon" | "ethicalads" | "custom";
  /** Optional CSS class name for the outer wrapper */
  className?: string;
}

/**
 * Renders third-party ad code inside a sandboxed <iframe> to isolate it
 * from the main page DOM. This prevents XSS even if the ad_code contains
 * malicious scripts — the sandbox restricts access to the parent page.
 *
 * Known ad providers (AdSense, Carbon, EthicalAds) get `allow-scripts`
 * and `allow-popups` so their legitimate scripts can execute and open
 * advertiser links. All providers are denied `allow-same-origin` to
 * prevent the iframe from accessing the parent page's cookies, storage,
 * or DOM.
 */
export function SandboxedAd({ adCode, provider, className }: SandboxedAdProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(0);

  // Known providers need script execution + popup ability for ad clicks.
  // Custom ads get the most restrictive sandbox.
  const sandbox =
    provider === "custom"
      ? "allow-popups allow-popups-to-escape-sandbox"
      : "allow-scripts allow-popups allow-popups-to-escape-sandbox";

  // Build a minimal HTML document that contains only the ad code.
  // The <base target="_blank"> ensures ad links open in a new tab
  // instead of navigating inside the tiny iframe.
  const srcdoc = `<!DOCTYPE html>
<html>
<head>
  <base target="_blank">
  <style>
    html, body {
      margin: 0;
      padding: 0;
      overflow: hidden;
      background: transparent;
    }
  </style>
</head>
<body>${adCode}
<script>
  // Post the content height to the parent so the iframe can resize.
  function postHeight() {
    var h = document.body.scrollHeight;
    if (h > 0) {
      window.parent.postMessage({ type: '__ad_resize', height: h }, '*');
    }
  }
  // Observe size changes (e.g. after ad scripts load creative assets).
  var ro = typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver(postHeight)
    : null;
  if (ro) ro.observe(document.body);
  window.addEventListener('load', postHeight);
  postHeight();
</script>
</body>
</html>`;

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (
        event.source === iframeRef.current?.contentWindow &&
        event.data?.type === "__ad_resize" &&
        typeof event.data.height === "number"
      ) {
        setHeight(event.data.height);
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return (
    <iframe
      ref={iframeRef}
      srcDoc={srcdoc}
      sandbox={sandbox}
      title="Advertisement"
      className={className}
      style={{
        display: "block",
        width: "100%",
        height: height > 0 ? height : undefined,
        border: "none",
        overflow: "hidden",
        colorScheme: "normal",
      }}
      loading="lazy"
    />
  );
}
