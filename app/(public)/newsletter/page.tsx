import type { Metadata } from "next";
import { getCurrentSite } from "@/lib/site-context";
import { staticPageMetadata } from "@/lib/seo";
import { notFound } from "next/navigation";
import { CalmShell } from "../components/calmroutine/shell";
import { CalmNewsletterPage } from "../components/calmroutine/newsletter-view";

export async function generateMetadata(): Promise<Metadata> {
  const site = await getCurrentSite();
  if (site.slug !== "calm-routine") {
    return { title: "Not Found" };
  }
  return staticPageMetadata({
    site,
    title: "Free somatic exercises PDF · calmroutine newsletter",
    description:
      "A calm, printable guide to five body-based practices for anxious moments. Join the list and get it right away.",
    path: "/newsletter",
  });
}

export default async function NewsletterPage() {
  const site = await getCurrentSite();
  if (site.slug !== "calm-routine") {
    notFound();
  }

  return (
    <CalmShell site={site}>
      <div className="mx-auto max-w-2xl px-6 py-14">
        <CalmNewsletterPage />
      </div>
    </CalmShell>
  );
}
