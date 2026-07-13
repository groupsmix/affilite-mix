import type { SiteDefinition } from "@/config/site-definition";
import type { ContentRow } from "@/types/database";
import { ContentCard } from "../content-card";
import { ScrollReveal } from "./showcase-ui";

interface ShowcaseJournalProps {
  site: SiteDefinition;
  recentContent: ContentRow[];
}

export function ShowcaseJournal({ site, recentContent }: ShowcaseJournalProps) {
  if (recentContent.length === 0) return null;

  return (
    <section id="journal" className="w-full py-20 md:py-28">
      <div className="container mx-auto px-4">
        <ScrollReveal className="text-center">
          <p className="text-xs uppercase tracking-[0.4em] text-accent">The Journal</p>
          <h2 className="mt-4 font-heading text-4xl text-foreground text-balance md:text-5xl">
            Latest <span className="italic">reading</span>
          </h2>
        </ScrollReveal>

        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
          {recentContent.slice(0, 3).map((content, i) => (
            <ScrollReveal key={content.id} delay={i * 120}>
              <ContentCard content={content} locale={site.locale} priority={i === 0} />
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
