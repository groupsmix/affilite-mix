import type { DialHomepageConfig } from "@/lib/dial-config";

interface TrustBarProps {
  config: DialHomepageConfig;
}

export function TrustBar({ config }: TrustBarProps) {
  const { stats } = config.trustBar;

  return (
    <section className="border-t border-border">
      <p className="border-b border-border px-4 py-4 text-center text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
        Independently tested &nbsp;&middot;&nbsp; No paid placements &nbsp;&middot;&nbsp; Affiliate
        links disclosed on every page
      </p>
      <div className="mx-auto grid max-w-6xl grid-cols-3 gap-px px-4 py-10 md:px-6">
        {stats.map(({ value, label }) => (
          <div
            key={label}
            className="flex flex-col border-l border-border/60 pl-4 first:border-l-0 md:items-center md:pl-0 md:text-center"
          >
            <div className="font-serif text-3xl font-semibold leading-none text-foreground md:text-4xl">
              {value}
            </div>
            <div className="mt-2 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              {label}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
