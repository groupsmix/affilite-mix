import { Clock, DollarSign, Gem, Users } from "lucide-react";
import type { DialHomepageConfig, DialTrustStat } from "@/lib/dial-config";

interface TrustBarProps {
  config: DialHomepageConfig;
}

const iconMap: Record<DialTrustStat["icon"], typeof Clock> = {
  clock: Clock,
  gem: Gem,
  users: Users,
  banknote: DollarSign,
};

export function TrustBar({ config }: TrustBarProps) {
  const { stats } = config.trustBar;

  return (
    <section className="border-y border-border bg-secondary/20">
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:grid-cols-2 lg:grid-cols-4 sm:px-6 lg:px-8">
        {stats.map((stat) => {
          const Icon = iconMap[stat.icon];
          return (
            <div key={stat.label} className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-lg font-semibold font-playfair">{stat.value}</p>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
