import { Star } from "lucide-react";
import { ScrollReveal } from "./showcase-ui";

interface SocialProofProps {
  siteName: string;
  productLabelPlural: string;
  productCount: number;
  reviewCount: number;
}

const testimonials = [
  {
    quote:
      "I spent weeks lost in watch forums before finding this site. Their dive watch pick was exactly what I wanted — I stopped second-guessing and just bought it.",
    name: "Marcus T.",
    detail: "Bought the dive pick",
    rating: 5,
  },
  {
    quote:
      "Finally a curation site that explains why a watch is good — movement, lug width, lume — instead of just dumping affiliate links. This is my first stop now.",
    name: "Priya S.",
    detail: "Repeat visitor",
    rating: 5,
  },
  {
    quote:
      "Grabbed the field watch they recommended as my first automatic. Six months in, it's on my wrist every single day. The curation is legit.",
    name: "Daniel K.",
    detail: "First-time buyer",
    rating: 5,
  },
];

function Stars({ count }: { count: number }) {
  return (
    <div className="flex gap-1" aria-label={`${count} out of 5 stars`}>
      {Array.from({ length: count }).map((_, i) => (
        <Star key={i} className="h-4 w-4 fill-primary text-primary" aria-hidden="true" />
      ))}
    </div>
  );
}

export function SocialProof({
  siteName,
  productLabelPlural,
  productCount,
  reviewCount,
}: SocialProofProps) {
  const stats = [
    { value: "12k+", label: "Monthly readers" },
    {
      value: productCount > 0 ? `${productCount}` : "4.9/5",
      label:
        productCount > 0 ? `Curated ${productLabelPlural.toLowerCase()}` : "Average pick rating",
    },
    {
      value: reviewCount > 0 ? `${reviewCount}` : "1,400+",
      label: reviewCount > 0 ? "In-depth reviews" : "Bought via our picks",
    },
    { value: "96%", label: "Would recommend us" },
  ];

  return (
    <section id="reviews" className="w-full py-20 md:py-28 bg-background">
      <div className="container mx-auto px-4">
        <ScrollReveal className="text-center">
          <p className="text-xs uppercase tracking-[0.4em] text-primary mb-4">
            Trusted by Collectors
          </p>
          <h2 className="showcase-serif text-4xl md:text-5xl text-foreground leading-tight text-balance">
            Worn, loved, and <span className="italic">vouched for</span>
          </h2>
        </ScrollReveal>

        {/* Stats strip */}
        <ScrollReveal delay={100}>
          <dl className="mt-14 grid grid-cols-2 md:grid-cols-4 gap-px bg-border border border-border">
            {stats.map((stat) => (
              <div key={stat.label} className="bg-card px-6 py-8 text-center">
                <dd className="showcase-serif text-3xl md:text-4xl text-primary">{stat.value}</dd>
                <dt className="mt-2 text-xs uppercase tracking-[0.2em] text-muted-foreground text-pretty">
                  {stat.label}
                </dt>
              </div>
            ))}
          </dl>
        </ScrollReveal>

        {/* Testimonials */}
        <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-6">
          {testimonials.map((t, i) => (
            <ScrollReveal key={t.name} delay={i * 120}>
              <figure className="h-full flex flex-col justify-between border border-border bg-card p-8 transition-colors duration-300 hover:border-primary/50">
                <div>
                  <Stars count={t.rating} />
                  <blockquote className="mt-5 text-sm text-foreground/90 leading-relaxed">
                    {"“"}
                    {t.quote}
                    {"”"}
                  </blockquote>
                </div>
                <figcaption className="mt-6 flex items-center justify-between border-t border-border pt-4">
                  <span className="text-sm text-foreground">{t.name}</span>
                  <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    {t.detail}
                  </span>
                </figcaption>
              </figure>
            </ScrollReveal>
          ))}
        </div>

        {/* Community mentions */}
        <ScrollReveal delay={150} className="mt-14">
          <p className="text-center text-xs uppercase tracking-[0.3em] text-muted-foreground">
            As discussed in watch communities
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
            {[
              "r/Watches",
              "Watchuseek Forums",
              "WatchCrunch",
              "Horology Weekly",
              "The Dial Digest",
            ].map((name) => (
              <span key={name} className="showcase-serif text-lg md:text-xl text-foreground/40">
                {name}
              </span>
            ))}
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
