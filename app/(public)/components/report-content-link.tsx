/**
 * A159-01: Public content reporting link.
 *
 * Renders a small "Report this content" link on public-facing pages
 * (articles, product pages, community posts). Clicking opens the user's
 * email client with a prefilled abuse report template.
 *
 * The link is deliberately minimal and only renders when the tenant has a
 * configured abuse-contact address.
 */

interface ReportContentLinkProps {
  /** The public URL of the content being reported */
  contentUrl: string;
  /** Human-readable title/slug for the email subject */
  contentTitle?: string;
  /** Tenant abuse-contact email */
  abuseEmail?: string;
  /** Additional CSS classes */
  className?: string;
}

export function ReportContentLink({
  contentUrl,
  contentTitle,
  abuseEmail,
  className,
}: ReportContentLinkProps) {
  if (!abuseEmail) return null;

  const to = abuseEmail;
  const subject = encodeURIComponent(`Content Report: ${contentTitle ?? contentUrl}`);
  const body = encodeURIComponent(
    [
      `I would like to report the following content:`,
      ``,
      `URL: ${contentUrl}`,
      `Title: ${contentTitle ?? "(not specified)"}`,
      ``,
      `Reason for reporting:`,
      `(Please describe the issue — e.g. inaccurate information, spam, offensive content, copyright violation)`,
      ``,
      `---`,
      `This report was generated from the content page.`,
    ].join("\n"),
  );

  return (
    <a
      href={`mailto:${to}?subject=${subject}&body=${body}`}
      className={`inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors ${className ?? ""}`}
      rel="nofollow"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 16 16"
        fill="currentColor"
        className="h-3 w-3"
        aria-hidden="true"
      >
        <path d="M3.75 2a.75.75 0 0 1 .75.75v11.5a.75.75 0 0 1-1.5 0V2.75A.75.75 0 0 1 3.75 2Zm3.5 1a.75.75 0 0 0-.75.75v4.5c0 .414.336.75.75.75h5.5a.75.75 0 0 0 .75-.75v-4.5a.75.75 0 0 0-.75-.75h-5.5Z" />
      </svg>
      Report this content
    </a>
  );
}
