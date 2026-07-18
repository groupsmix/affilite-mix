"use client";

import dynamic from "next/dynamic";

/**
 * Client wrapper for the three.js scroll hero. `ssr: false` keeps the
 * WebGL canvas (three + gsap, all client-only) out of the server render
 * and out of the initial page bundle — the chunk only loads in the browser.
 * The 300vh placeholder reserves the hero's full scroll height so the
 * sections below don't shift when the chunk resolves (CLS guard).
 */
const WatchScrollExperience = dynamic(
  () =>
    import(
      /* webpackChunkName: "showcase-hero" */
      "./watch-scroll-experience"
    ).then((m) => m.WatchScrollExperience),
  {
    ssr: false,
    loading: () => <div className="h-[300vh] bg-background" aria-hidden="true" />,
  },
);

interface ShowcaseHeroProps {
  siteName: string;
  productLabelPlural: string;
}

export function ShowcaseHero({ siteName, productLabelPlural }: ShowcaseHeroProps) {
  return <WatchScrollExperience siteName={siteName} productLabelPlural={productLabelPlural} />;
}
