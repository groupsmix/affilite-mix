import { Timer, PackageCheck, Users, Banknote } from "lucide-react";
import type { DialHomepageConfig, DialTrustStat } from "@/lib/dial-config";

interface TrustBarProps {
  config: DialHomepageConfig;
}

const iconMap: Record<DialTrustStat["icon"], typeof Timer> = {
  clock: Timer,
  gem: PackageCheck,
  users: Users,
  banknote: Banknote,
};

export function TrustBar({ config }: TrustBarProps) {
  const { stats } = config.trustBar;

  return (
    <section className="border-y border-border bg-secondary/30">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-px px-4 md:grid-cols-4 md:px-6">
        {stats.map(({ icon, value, label }) => {
          const Icon = iconMap[icon];
          return (
            <div key={label} className="flex items-center gap-3 py-6 md:justify-center">
              <Icon className="h-5 w-5 shrink-0 text-primary" />
              <div>
                <div className="font-serif text-xl font-semibold leading-none">{value}</div>
                <div className="mt-1 text-xs text-muted-foreground">{label}</div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
