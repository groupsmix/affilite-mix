import { Reveal } from "./reveal";
import type { GuideSection } from "@/lib/dial-guides";

export function BuyingGuide({
  title,
  lede,
  sections,
}: {
  title: string;
  lede: string;
  sections: GuideSection[];
}) {
  return (
    <section id="buying-guide" className="scroll-mt-24">
      <Reveal>
        <h2 className="font-serif text-2xl font-semibold md:text-3xl">{title}</h2>
        <p className="mt-3 max-w-2xl text-pretty leading-relaxed text-muted-foreground">{lede}</p>
      </Reveal>

      <div className="mt-8 grid gap-5 sm:grid-cols-2">
        {sections.map((s, i) => (
          <Reveal
            key={s.heading}
            delay={i * 60}
            className="rounded-xl border border-border bg-card p-6"
          >
            <h3 className="font-serif text-lg font-semibold">{s.heading}</h3>
            <p className="mt-2 text-pretty text-sm leading-relaxed text-muted-foreground">
              {s.body}
            </p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
