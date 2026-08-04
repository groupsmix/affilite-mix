import { Wallet, Hand, Gauge, Microscope } from "lucide-react";
import type { DialHomepageConfig, DialMethodologyStep } from "@/lib/dial-config";
import { Reveal } from "./reveal";

interface HowWeTestProps {
  config: DialHomepageConfig;
}

const iconMap: Record<DialMethodologyStep["icon"], typeof Wallet> = {
  checkCircle: Wallet,
  calendar: Hand,
  ruler: Gauge,
  droplets: Microscope,
  wallet: Wallet,
  hand: Hand,
  gauge: Gauge,
  microscope: Microscope,
};

export function HowWeTest({ config }: HowWeTestProps) {
  const { howWeTest } = config;

  return (
    <section id="how-we-test" className="scroll-mt-20 border-t border-border">
      <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-24">
        <div className="grid gap-12 md:grid-cols-[1fr_1.3fr] md:gap-16">
          <Reveal>
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
              Our methodology
            </p>
            <h2 className="mt-3 text-balance font-serif text-3xl font-semibold tracking-tight md:text-4xl">
              {howWeTest.title}
            </h2>
            <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
              {howWeTest.subtitle}
            </p>
          </Reveal>

          <div className="grid gap-6 sm:grid-cols-2">
            {howWeTest.steps.map(({ icon, title, description }, i) => {
              const Icon = iconMap[icon];
              return (
                <Reveal key={title} delay={(i % 2) * 90} className="border border-border p-6">
                  <Icon className="h-5 w-5 text-primary" />
                  <h3 className="mt-4 font-serif text-lg font-semibold">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {description}
                  </p>
                </Reveal>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
