import Link from "next/link";

export function CalmAffiliateDisclosurePage() {
  return (
    <>
      <h1 className="font-serif text-4xl text-text-primary text-balance">Affiliate disclosure</h1>
      <div className="mt-8 space-y-5 text-base leading-[1.7] text-text-primary/90">
        <p>
          Some of the links on calmroutine are affiliate links. That means if you click one and buy
          something, I may earn a small commission — at no extra cost to you.
        </p>
        <p>
          This never changes what I recommend. I only link to things I have tried myself and
          genuinely think are worth it. If a product didn&apos;t help me, it doesn&apos;t get a
          link, commission or not.
        </p>
        <p>
          Affiliate income helps keep the site free and ad-light so I can spend time researching and
          testing rather than chasing sponsors.
        </p>
        <p>
          If you ever have a question about a recommendation, please{" "}
          <Link href="/contact" className="text-accent-dark underline underline-offset-2">
            get in touch
          </Link>
          .
        </p>
      </div>
    </>
  );
}
