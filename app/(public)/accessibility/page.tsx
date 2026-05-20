import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Accessibility Statement",
  description:
    "Our commitment to web accessibility — WCAG 2.2 AA conformance, known limitations, and how to contact us.",
};

export default function AccessibilityPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-6 text-3xl font-bold">Accessibility Statement</h1>
      <div className="prose prose-gray max-w-none">
        <p>
          We are committed to ensuring digital accessibility for people with disabilities. We
          continually improve the user experience for everyone and apply relevant accessibility
          standards.
        </p>

        <h2>Conformance Status</h2>
        <p>
          We aim for <strong>WCAG 2.2 Level AA</strong> conformance across this website. Where we
          fall short, we are actively working to resolve the gaps identified in our accessibility
          audit log.
        </p>

        <h2>Technical Specifications</h2>
        <p>This website relies on the following technologies for conformance with WCAG 2.2:</p>
        <ul>
          <li>HTML5 semantic markup</li>
          <li>WAI-ARIA landmark roles and live regions</li>
          <li>CSS with sufficient colour contrast (minimum 4.5:1 for normal text)</li>
          <li>JavaScript (progressive enhancement — core content accessible without JS)</li>
        </ul>

        <h2>Known Limitations</h2>
        <ul>
          <li>
            <strong>Third-party ad slots:</strong> Sandboxed ad iframes may not fully conform to
            WCAG 2.2. We ask ad partners to follow accessibility guidelines and review new
            creatives.
          </li>
          <li>
            <strong>Cookie consent banner:</strong> The vanilla-cookieconsent library is
            keyboard-navigable but may not announce dynamic content changes to all screen readers. A
            full TCF-certified CMP upgrade is planned.
          </li>
          <li>
            <strong>Price history charts:</strong> Interactive SVG charts include aria-label
            attributes but may lack table alternatives on older browsers. Text summaries are
            available below each chart.
          </li>
        </ul>

        <h2>Feedback and Contact</h2>
        <p>
          We welcome feedback on the accessibility of this website. If you experience accessibility
          barriers, please contact us:
        </p>
        <ul>
          <li>
            <strong>Email:</strong>{" "}
            <a href="mailto:accessibility@groupsmix.com">accessibility@groupsmix.com</a>
          </li>
          <li>
            <strong>Response time:</strong> We aim to respond within 5 business days.
          </li>
        </ul>

        <h2>Formal Complaints</h2>
        <p>
          If you are not satisfied with our response, you may contact the relevant national
          accessibility enforcement body in your jurisdiction.
        </p>

        <h2>Assessment Approach</h2>
        <p>We assess the accessibility of this website through:</p>
        <ul>
          <li>Self-evaluation using Axe, Lighthouse, and WAVE automated tools</li>
          <li>Manual keyboard-navigation testing</li>
          <li>Screen-reader testing (NVDA on Windows, VoiceOver on macOS/iOS)</li>
          <li>
            Annual third-party accessibility audit (see <code>docs/a11y/</code>)
          </li>
        </ul>

        <p className="text-sm text-gray-500 mt-8">
          This statement was prepared on <time dateTime="2026-05-01">1 May 2026</time> and last
          reviewed on <time dateTime="2026-05-01">1 May 2026</time>.
        </p>
      </div>
    </div>
  );
}
