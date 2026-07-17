import type { SiteDefinition } from "@/config/site-definition";
import Link from "next/link";
import { ContactForm } from "./contact-form";

export function isCryptoTaxAu(site: SiteDefinition): boolean {
  return (
    site.name === "Crypto Tax AU" ||
    site.domain === "cryptoranked.xyz" ||
    site.id === "crypto-tools" ||
    site.id === "863772b4-00ad-4912-9813-3c1372ce7c28"
  );
}

export function CryptoTaxAUAbout({ site }: { site: SiteDefinition }) {
  return (
    <>
      <p className="text-lg leading-relaxed">
        {site.name} is an independent Australian crypto-tax education site. We help DeFi, staking,
        airdrop and NFT investors understand how the ATO treats their activity and find the software
        or registered tax agent that fits their return.
      </p>

      <h2 className="mb-4 mt-8 text-2xl font-semibold" style={{ color: "var(--ink)" }}>
        Our mission
      </h2>
      <p className="mb-6 leading-relaxed">
        Crypto tax in Australia is confusing and the rules change quickly. Our mission is to
        translate ATO guidance and tax-office rulings into plain English, so you can lodge an
        accurate return on time and pay the right amount of tax — not more than you owe.
      </p>

      <h2 className="mb-4 mt-8 text-2xl font-semibold" style={{ color: "var(--ink)" }}>
        What we cover
      </h2>
      <ul className="mb-6 list-disc space-y-2 pl-6">
        <li>Side-by-side comparisons of crypto-tax software used in Australia.</li>
        <li>ATO-aligned guides for staking, DeFi, airdrops, NFTs, mining and margin.</li>
        <li>
          Reviews of tools including Koinly, Syla, Crypto Tax Calculator, CoinLedger, CoinTracking
          and Coinpanda.
        </li>
        <li>A tax-finder that points you to the right tool for your transaction mix.</li>
        <li>Deadline reminders and practical checklists for the 31 October due date.</li>
      </ul>

      <h2 className="mb-4 mt-8 text-2xl font-semibold" style={{ color: "var(--ink)" }}>
        Independent and transparent
      </h2>
      <p className="mb-6 leading-relaxed">
        {site.affiliateDisclosure} Ratings are based on publicly available information, hands-on
        testing and ATO-report compatibility — not on who pays us. If a tool is not right for your
        situation, we will say so.
      </p>

      <h2 className="mb-4 mt-8 text-2xl font-semibold" style={{ color: "var(--ink)" }}>
        Not tax advice
      </h2>
      <p className="mb-6 leading-relaxed">
        Everything on {site.name} is general information. It is not personal tax, legal or financial
        advice. For advice tailored to your circumstances, speak to an Australian registered tax
        agent or qualified accountant.
      </p>

      <h2 className="mb-4 mt-8 text-2xl font-semibold" style={{ color: "var(--ink)" }}>
        Contact us
      </h2>
      <p className="mb-6 leading-relaxed">
        Questions, corrections or partnership enquiries? Email us at{" "}
        <a
          href={`mailto:${site.brand.contactEmail}`}
          className="font-medium hover:underline"
          style={{ color: "var(--oltigo-green)" }}
        >
          {site.brand.contactEmail}
        </a>
        . We usually reply within 1–2 Australian business days.
      </p>
    </>
  );
}

export function CryptoTaxAUContact({ site }: { site: SiteDefinition }) {
  return (
    <>
      <p>
        Have a question about Australian crypto tax, a correction to one of our guides, or a
        partnership idea? We are based in Australia and aim to respond within 1–2 business days
        (AEST/AEDT).
      </p>

      <h2>Send us a message</h2>
      <div className="mb-8">
        <ContactForm siteName={site.name} />
      </div>

      <h2>What we can help with</h2>
      <ul>
        <li>Questions about our crypto-tax guides, reviews or comparisons.</li>
        <li>Correction requests or feedback on our content.</li>
        <li>Partnership enquiries from Australian crypto-tax software or accounting firms.</li>
        <li>Technical issues with the site or a broken affiliate link.</li>
      </ul>

      <h2>What we cannot help with</h2>
      <p>
        We do not provide personal tax advice by email. If you need advice for your specific tax
        situation — for example, how to treat a complex DeFi position or an ATO review — please
        contact an Australian registered tax agent or qualified accountant.
      </p>

      <h2>Response time</h2>
      <p>
        We aim to reply to all enquiries within 1–2 Australian business days. For time-sensitive
        tax-deadline questions close to 31 October, please write &quot;Tax deadline&quot; in the
        subject line.
      </p>
    </>
  );
}

export function CryptoTaxAUPrivacy({ site }: { site: SiteDefinition }) {
  const contactEmail = site.pages.contact?.email ?? site.brand.contactEmail;

  return (
    <>
      <p>
        This Privacy Policy explains how {site.name} ({site.domain}) collects, uses, stores and
        protects your personal information. It is written for Australian visitors and references the{" "}
        <em>Privacy Act 1988</em> (Cth) and the Australian Privacy Principles (APPs).
      </p>

      <h2>Who we are</h2>
      <p>
        {site.name} is operated as an Australian crypto-tax education website. For privacy
        questions, contact us at <a href={`mailto:${contactEmail}`}>{contactEmail}</a>.
      </p>

      <h2>What we collect</h2>
      <p>We collect only the information we need to run and improve the site:</p>
      <ul>
        <li>
          <strong>Browsing information:</strong> pages visited, device type and approximate location
          (country/state) via standard server logs and analytics cookies.
        </li>
        <li>
          <strong>Cookie preferences:</strong> your consent choice for analytics and affiliate
          tracking.
        </li>
        <li>
          <strong>Affiliate clicks:</strong> when you click an affiliate link and have consented to
          affiliate cookies, we record a click identifier for commission attribution. We do not
          receive your tax file number, exchange logins, wallet addresses or transaction history.
        </li>
        <li>
          <strong>Email:</strong> if you contact us or subscribe to a newsletter, we store your
          email address and the content of your message.
        </li>
      </ul>

      <h2>How we use your information</h2>
      <ul>
        <li>To keep the site secure and measure performance.</li>
        <li>To understand which guides and comparisons are most useful.</li>
        <li>To attribute affiliate commissions when you use an affiliate link.</li>
        <li>To reply to your questions or send newsletters you signed up for.</li>
      </ul>

      <h2>Cookies and tracking</h2>
      <p>
        We use essential cookies for security and consent management, and optional cookies for
        analytics and affiliate tracking. You can accept or reject non-essential cookies using the
        consent banner. Rejecting them does not stop you using the site.
      </p>

      <h2>Third-party services</h2>
      <p>
        We use trusted service providers to host and operate the site. These may process limited
        data on our behalf:
      </p>
      <ul>
        <li>
          <strong>Cloudflare:</strong> web hosting, CDN, security and analytics.
        </li>
        <li>
          <strong>Supabase:</strong> database hosting and authentication.
        </li>
        <li>
          <strong>Sentry:</strong> error monitoring and performance tracking.
        </li>
      </ul>

      <h2>Data retention</h2>
      <ul>
        <li>Analytics data: up to 90 days.</li>
        <li>Affiliate click data: up to 365 days for commission attribution.</li>
        <li>Email enquiries: until the matter is resolved, then deleted unless required by law.</li>
        <li>Newsletter subscriptions: until you unsubscribe or the service ends.</li>
      </ul>

      <h2>Your rights</h2>
      <p>
        Under the <em>Privacy Act 1988</em> (Cth), you can request access to or correction of your
        personal information, ask us to delete it, or lodge a complaint with the Office of the
        Australian Information Commissioner (OAIC). To exercise these rights, email{" "}
        <a href={`mailto:${contactEmail}`}>{contactEmail}</a>.
      </p>

      <h2>Not tax advice</h2>
      <p>
        Our content is general information only and is not personal tax advice. We do not collect or
        store tax-file numbers, exchange credentials or transaction histories.
      </p>

      <h2>Changes to this policy</h2>
      <p>
        We may update this Privacy Policy from time to time. The current version will always be
        available at <Link href="/privacy">/privacy</Link>.
      </p>

      <h2>Contact us</h2>
      <p>
        For privacy questions, contact <a href={`mailto:${contactEmail}`}>{contactEmail}</a>.
      </p>
    </>
  );
}

export function CryptoTaxAUTerms({ site }: { site: SiteDefinition }) {
  const contactEmail = site.pages.contact?.email ?? site.brand.contactEmail;

  return (
    <>
      <p>
        These Terms of Service govern your use of {site.name} ({site.domain}). By accessing or using
        the site, you agree to these terms. If you do not agree, please stop using the site.
      </p>

      <h2>General information only</h2>
      <p>
        All content on {site.name} is general information and is not personal tax, legal, financial
        or accounting advice. Crypto-tax outcomes depend on your individual circumstances. Always
        verify with the ATO, a registered tax agent or a qualified accountant before lodging your
        return or making decisions.
      </p>

      <h2>Affiliate links</h2>
      <p>
        {site.name} participates in affiliate programs for crypto-tax software and Australian
        crypto-tax accountant referrals. When you click an affiliate link and sign up or make a
        purchase, we may earn a commission at no extra cost to you. Affiliate partnerships do not
        influence our ratings or recommendations.
      </p>

      <h2>Use of content</h2>
      <p>
        You may read, share and print content for personal, non-commercial use. You may not
        republish, scrape, systematically copy or redistribute our content without written
        permission. All trademarks, logos and product names belong to their respective owners.
      </p>

      <h2>User conduct</h2>
      <p>When using the site you agree not to:</p>
      <ul>
        <li>Attempt to damage, disable or interfere with the site or its servers.</li>
        <li>Use automated scraping or harvesting tools without permission.</li>
        <li>Misrepresent your identity or submit false information.</li>
        <li>Upload malware, spam or unlawful content.</li>
      </ul>

      <h2>External links</h2>
      <p>
        The site contains links to third-party tools, exchanges, tax software and accountants. We
        are not responsible for the content, privacy practices or security of those sites. You
        should review their terms and privacy policies before providing personal information.
      </p>

      <h2>Accuracy of information</h2>
      <p>
        We try to keep content accurate and up to date, but crypto-tax laws, ATO rulings and product
        features change. We make no warranty that the information is complete, accurate or current.
        You use the site at your own risk.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        To the fullest extent permitted by Australian law, {site.name} and its operators are not
        liable for any loss, damage or claim arising from your use of the site, reliance on any
        content, or the use of any third-party tool or service recommended on the site.
      </p>

      <h2>Age requirement</h2>
      <p>
        The site is intended for users aged 18 years or older, or younger users with appropriate
        supervision. We do not knowingly collect personal information from children.
      </p>

      <h2>Governing law</h2>
      <p>
        These terms are governed by the laws of New South Wales, Australia. Any dispute will be
        resolved in the courts of New South Wales.
      </p>

      <h2>Changes to these terms</h2>
      <p>
        We may update these Terms of Service at any time. The current version will always be
        available at <Link href="/terms">/terms</Link>. Continued use of the site after changes
        means you accept the updated terms.
      </p>

      <h2>Contact us</h2>
      <p>
        For questions about these terms, contact{" "}
        <a href={`mailto:${contactEmail}`}>{contactEmail}</a>.
      </p>
    </>
  );
}

export function CryptoTaxAUAffiliateDisclosure({ site }: { site: SiteDefinition }) {
  const contactEmail = site.pages.contact?.email ?? site.brand.contactEmail;

  return (
    <>
      <p>
        {site.name} is reader-supported. This page explains how we earn revenue, how we choose the
        tools we recommend, and what it means for you.
      </p>

      <h2>How we earn revenue</h2>
      <p>
        We participate in affiliate and referral programs run by crypto-tax software companies and
        Australian crypto-tax accounting services. When you click a link on our site and sign up or
        make a purchase, we may receive a commission or referral fee. This is paid by the provider,
        not by you.
      </p>

      <h2>Partners we work with</h2>
      <p>Our affiliate and referral relationships currently include or have included:</p>
      <ul>
        <li>
          Crypto-tax software: Koinly, Syla, Crypto Tax Calculator, CoinLedger, CoinTracking and
          Coinpanda.
        </li>
        <li>Crypto-tax accountant and registered tax-agent referral services.</li>
      </ul>
      <p>The exact list may change as we test new tools and as partnerships start or end.</p>

      <h2>Editorial independence</h2>
      <p>
        Affiliate relationships do not influence our reviews, ratings or rankings. We evaluate each
        tool against the same criteria: ATO report accuracy, ease of use, DeFi and NFT support,
        value for Australian users, and customer support. We recommend the tool we believe is best
        for a given situation, regardless of whether we earn a commission.
      </p>

      <h2>No extra cost to you</h2>
      <p>
        You pay the same price whether you use our affiliate link or visit the provider directly. In
        some cases, our links may unlock a discount or extended trial.
      </p>

      <h2>Disclosure on every page</h2>
      <p>
        Pages that contain affiliate links display a short disclosure notice. You can also read our
        full disclosure here at any time.
      </p>
      <blockquote>
        <p>{site.affiliateDisclosure}</p>
      </blockquote>

      <h2>Not tax advice</h2>
      <p>
        Our comparisons and reviews are general information. They are not personal tax advice.
        Before choosing a tool or lodging a return, confirm the details with the provider and, if
        needed, an Australian registered tax agent.
      </p>

      <h2>Questions?</h2>
      <p>
        If you have any questions about our affiliate relationships or editorial policy, please{" "}
        {site.pages.contact ? (
          <Link
            href="/contact"
            className="font-medium"
            style={{ color: "var(--color-accent, #10B981)" }}
          >
            contact us
          </Link>
        ) : (
          <>
            email us at{" "}
            <a
              href={`mailto:${contactEmail}`}
              className="font-medium"
              style={{ color: "var(--color-accent, #10B981)" }}
            >
              {contactEmail}
            </a>
          </>
        )}
        .
      </p>
    </>
  );
}

export function CryptoTaxAUHowWeRank({ site }: { site: SiteDefinition }) {
  const contactEmail = site.pages.contact?.email ?? site.brand.contactEmail;

  return (
    <>
      <p>
        {site.name} rates and ranks crypto-tax software and services for Australian investors. Our
        goal is to help you find the right tool for your situation, not to sell you the most
        expensive one.
      </p>

      <h2>How we choose what to review</h2>
      <p>
        We focus on tools that Australian crypto investors actually use or ask about. We add new
        reviews when a tool has an Australian user base, ATO reporting capability, or a feature set
        that fills a gap (for example, strong DeFi support or SMSF reporting).
      </p>

      <h2>Our scoring criteria</h2>
      <p>Each tool is scored against the same set of criteria, weighted for Australian users:</p>
      <ul>
        <li>
          <strong>ATO report accuracy</strong> — does the tool produce a myTax-compatible or
          accountant-ready report under current ATO guidance?
        </li>
        <li>
          <strong>Ease of use</strong> — can a non-accountant import exchanges and wallets and
          generate a report without manual re-work?
        </li>
        <li>
          <strong>Australian pricing and value</strong> — AUD pricing, free tiers and whether the
          cost scales fairly for common transaction counts.
        </li>
        <li>
          <strong>DeFi, staking, airdrop and NFT coverage</strong> — can it handle the activities
          that trigger the most ATO questions?
        </li>
        <li>
          <strong>Customer support</strong> — responsiveness, local business hours and access to
          tax-specialist help.
        </li>
      </ul>

      <h2>How comparisons are ordered</h2>
      <p>
        Comparisons are ordered by the overall score, not by commission rate or partnership status.
        The &ldquo;best for&rdquo; badge on each card reflects the use case where the tool scores
        highest — for example, tax minimisation, DeFi depth or simplicity.
      </p>

      <h2>Affiliate relationships do not change ratings</h2>
      <p>
        {site.name} earns affiliate commissions from some of the tools we recommend, but those
        relationships do not influence scores, placement or editorial coverage. We link to tools we
        believe are worth using; if a tool is not right for you, we say so.
      </p>

      <h2>How often we update</h2>
      <p>
        We review pricing and feature tables at least quarterly and update guides when ATO guidance
        changes. Each guide shows a last-updated timestamp where the CMS supports it.
      </p>

      <h2>Not tax advice</h2>
      <p>
        Our ratings and guides are general information. They are not personal tax advice. Before you
        choose a tool or lodge a return, confirm the details with the provider and, if needed, an
        Australian registered tax agent.
      </p>

      <h2>Questions or corrections</h2>
      <p>
        If you think a rating is wrong, a tool has changed, or we have missed something, please{" "}
        <a
          href={`mailto:${contactEmail}`}
          className="font-medium"
          style={{ color: "var(--color-accent, #10B981)" }}
        >
          email us
        </a>{" "}
        and we will investigate.
      </p>
    </>
  );
}
