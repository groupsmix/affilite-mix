/**
 * Google Analytics 4 loader for Crypto Tax AU.
 *
 * Renders the gtag.js loader and the inline config block with a CSP nonce
 * so the strict `script-src` policy in middleware.ts allows execution.
 */
export function GoogleAnalytics({
  measurementId,
  nonce,
}: {
  measurementId: string;
  nonce?: string;
}) {
  const inlineScript = `
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', '${measurementId}');
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
