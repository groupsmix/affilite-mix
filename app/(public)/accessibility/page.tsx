import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Accessibility Statement",
  description: "Our commitment to web accessibility (WCAG 2.2 AA).",
};

/**
 * OF-16: Public accessibility statement page.
 * WCAG 2.2 / EN 301 549 compliance documentation.
 */
export default function AccessibilityPage() {
  return (
    <main className="container mx-auto max-w-3xl px-4 py-12 prose">
      <h1>Accessibility Statement</h1>
      <p>
        <strong>Affilite Mix</strong> is committed to ensuring digital
        accessibility for people with disabilities. We continually improve the
        user experience for everyone and apply the relevant accessibility
        standards.
      </p>

      <h2>Conformance Status</h2>
      <p>
        We target <strong>WCAG 2.2 Level AA</strong> conformance for all public
        pages. Automated accessibility tests (axe-core) run on every pull
        request and block merges on critical or serious violations.
      </p>

      <h2>Technical Specifications</h2>
      <ul>
        <li>HTML5 semantic markup</li>
        <li>ARIA roles and landmarks where native HTML is insufficient</li>
        <li>Keyboard-navigable interactive elements</li>
        <li>Sufficient colour contrast (minimum 4.5:1 for normal text)</li>
        <li>Visible focus indicators on all interactive elements</li>
        <li>Alternative text for informative images</li>
      </ul>

      <h2>Known Limitations</h2>
      <p>
        Third-party widgets (e.g. Cloudflare Turnstile CAPTCHA, advertising
        iframes) may not fully meet our accessibility standards. We are working
        with our vendors to address these gaps.
      </p>

      <h2>Feedback and Contact</h2>
      <p>
        If you experience accessibility barriers, please contact us:
      </p>
      <ul>
        <li>Email: <a href="mailto:accessibility@groupsmix.com">accessibility@groupsmix.com</a></li>
        <li>Response time: within 2 business days</li>
      </ul>

      <h2>Enforcement Procedure</h2>
      <p>
        If you are not satisfied with our response, you may contact the
        relevant national authority responsible for enforcing web accessibility
        legislation in your country.
      </p>

      <p>
        <em>Last reviewed: {new Date(2026, 4, 1).toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" })}</em>
      </p>
    </main>
  );
}
