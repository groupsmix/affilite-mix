import { Calendar, CheckCircle, Droplets, Ruler } from "lucide-react";
import type { DialHomepageConfig, DialMethodologyStep } from "@/lib/dial-config";
import { Reveal } from "./reveal";

interface HowWeTestProps {
  config: DialHomepageConfig;
}

const iconMap: Record<DialMethodologyStep["icon"], typeof CheckCircle> = {
  checkCircle: CheckCircle,
  calendar: Calendar,
  ruler: Ruler,
  droplets: Droplets,
};

export function HowWeTest({ config }: HowWeTestProps) {
  const { howWeTest } = config;

  return (
    <section id="how-we-test" className="bg-background py-16 md:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl font-playfair">
            {howWeTest.title}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">{howWeTest.subtitle}</p>
        </Reveal>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {howWeTest.steps.map((step, i) => {
            const Icon = iconMap[step.icon];
            return (
              <Reveal key={step.title} delay={i * 100}>
                <div className="flex h-full flex-col rounded-2xl border border-border bg-card p-6 transition-all hover:border-primary/30">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="mt-5 text-lg font-semibold font-playfair">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {step.description}
                  </p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
