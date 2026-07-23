import { Reveal } from "./reveal";
import type { GuideFaq } from "@/lib/dial-guides";

export function ArticleFaq({ faqs }: { faqs: GuideFaq[] }) {
  return (
    <section id="faq" className="scroll-mt-24">
      <Reveal>
        <h2 className="font-serif text-2xl font-semibold md:text-3xl">
          Frequently asked questions
        </h2>
      </Reveal>
      <div className="mt-6 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {faqs.map((f) => (
          <details key={f.q} className="group px-5 py-4 md:px-6">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
              {f.q}
              <span className="text-primary transition-transform duration-200 group-open:rotate-45">
                +
              </span>
            </summary>
            <p className="mt-3 text-pretty text-sm leading-relaxed text-muted-foreground">{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
