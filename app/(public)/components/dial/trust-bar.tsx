import { Clock, DollarSign, Gem, Users } from "lucide-react";

interface TrustBarProps {
  productCount: number;
  reviewCount: number;
}

export function TrustBar({ productCount, reviewCount }: TrustBarProps) {
  return (
    <section className="border-y border-border bg-secondary/20">
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:grid-cols-2 lg:grid-cols-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <p className="text-lg font-semibold font-playfair">600+</p>
            <p className="text-sm text-muted-foreground">Hours of testing</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Gem className="h-5 w-5" />
          </div>
          <div>
            <p className="text-lg font-semibold font-playfair">120+</p>
            <p className="text-sm text-muted-foreground">Watches on wrist</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <p className="text-lg font-semibold font-playfair">85k+</p>
            <p className="text-sm text-muted-foreground">Monthly readers</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <DollarSign className="h-5 w-5" />
          </div>
          <div>
            <p className="text-lg font-semibold font-playfair">$0</p>
            <p className="text-sm text-muted-foreground">Paid placements</p>
          </div>
        </div>
      </div>
    </section>
  );
}
