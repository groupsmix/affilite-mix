import { Check } from "lucide-react";
import { CalmNewsletterStrip } from "./newsletter-strip";

const points = [
  "A one-page printable of five somatic exercises you can do anywhere",
  "One short, practical email a week — never more",
  "Tested routines only, no fluff and no diagnosing",
];

export function CalmNewsletterPage() {
  return (
    <>
      <div className="text-center">
        <p className="text-xs font-medium tracking-wide text-accent-mid">Free download</p>
        <h1 className="mt-2 font-serif text-4xl leading-tight text-text-primary text-balance sm:text-5xl">
          The somatic exercises PDF
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-text-secondary text-pretty">
          A calm, printable guide to five body-based practices for anxious moments. Join the list
          and it lands in your inbox right away.
        </p>
      </div>

      <ul className="mx-auto mt-10 max-w-md space-y-3">
        {points.map((point) => (
          <li
            key={point}
            className="flex items-start gap-3 text-sm leading-relaxed text-text-primary/90"
          >
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-tint">
              <Check className="h-3 w-3 text-accent-dark" aria-hidden="true" />
            </span>
            {point}
          </li>
        ))}
      </ul>

      <div className="mt-12">
        <CalmNewsletterStrip
          heading="Get the free PDF"
          description="Enter your email and I'll send the printable guide plus one calm email a week."
        />
      </div>
    </>
  );
}
