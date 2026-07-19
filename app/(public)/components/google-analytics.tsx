/**
 * Google Analytics 4 loader with cross-domain linker support.
 *
 * Renders the gtag.js loader and the inline config block with a CSP nonce
 * so the strict `script-src` policy in middleware.ts allows execution.
 */
export function GoogleAnalytics({
  measurementId,
  domains,
  nonce,
}: {
  measurementId: string;
  domains?: string[];
  nonce?: string;
}) {
  const linkerConfig =
    domains && domains.length > 0
      ? `, { linker: { domains: ${JSON.stringify(domains)} }, cookie_flags: 'SameSite=None;Secure' }`
      : "";

  const inlineScript = `
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', '${measurementId}'${linkerConfig});
  `;

  return (
    <>
      <script
        async
        nonce={nonce}
        src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
      />
      {/* eslint-disable-next-line no-restricted-syntax -- hand-controlled, nonced inline GA bootstrap */}
      <script nonce={nonce} dangerouslySetInnerHTML={{ __html: inlineScript }} />
    </>
  );
}
