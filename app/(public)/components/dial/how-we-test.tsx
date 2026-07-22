import { Calendar, CheckCircle, Droplets, Ruler } from "lucide-react";
import { Reveal } from "./reveal";

const steps = [
  {
    icon: CheckCircle,
    title: "We buy or borrow every watch",
    description:
      "No loaner units from marketing teams. If a watch is reviewed, it spent real time on a real wrist.",
  },
  {
    icon: Calendar,
    title: "Two weeks minimum on wrist",
    description:
      "First impressions lie. We wear each pick for desk work, weekend errands, and nights out before scoring.",
  },
  {
    icon: Ruler,
    title: "Accuracy timed against real time",
    description:
      "We measure deviation over 24–48 hours against an NTP reference. A pretty dial is nice; a correct one matters.",
  },
  {
    icon: Droplets,
    title: "Build quality graded in hand",
    description:
      "Case finishing, bracelet feel, crown action, and lume are all rated. Spec sheets only tell half the story.",
  },
];

export function HowWeTest() {
  return (
    <section id="how-we-test" className="bg-background py-16 md:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl font-playfair">
            How we test
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
            Our methodology is designed to remove hype and focus on what matters: accuracy, comfort,
            and value.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, i) => (
            <Reveal key={step.title} delay={i * 100}>
              <div className="flex h-full flex-col rounded-2xl border border-border bg-card p-6 transition-all hover:border-primary/30">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <step.icon className="h-6 w-6" />
                </div>
                <h3 className="mt-5 text-lg font-semibold font-playfair">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {step.description}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
