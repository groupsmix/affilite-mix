"use client";

import { useEffect, useState } from "react";
import { WatchScrollExperience } from "./watch-scroll-experience";

interface ShowcaseHeroProps {
  siteName: string;
  productLabelPlural: string;
}

export function ShowcaseHero({ siteName, productLabelPlural }: ShowcaseHeroProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="h-[300vh] bg-background" aria-hidden="true" />;
  }

  return <WatchScrollExperience siteName={siteName} productLabelPlural={productLabelPlural} />;
}
