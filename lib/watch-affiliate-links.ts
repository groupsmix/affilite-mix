/**
 * Central affiliate-link config for wristnerd.xyz.
 *
 * Drop real affiliate URLs here once approved. When a value is null the
 * public CTA falls back to the official manufacturer/retailer page shown below.
 */

export const WATCH_AFFILIATE_LINKS: Record<string, string | null> = {
  seiko5: null,
  orientBambino: null,
  citizenPromaster: null,
  tissotPrx: null,
  hamiltonKhaki: null,
  casioA168: null,
  casioDuro: null,
  timexWeekender: null,
  skagen: null,
  mvmt: null,
  fossil: null,
  danielWellington: null,
  bartonStraps: null,
  hirschStraps: null,
  crownAndBuckle: null,
};

/**
 * Official fallback URLs. These are the URLs we show when no affiliate link
 * has been configured.
 */
export const WATCH_OFFICIAL_URLS: Record<string, string> = {
  seiko5: "https://www.seikowatches.com/us/en/products/5sports/index",
  orientBambino: "https://www.orientwatchusa.com/bambino/",
  citizenPromaster: "https://www.citizenwatch.com/us/en/mens-watches/promaster/",
  tissotPrx: "https://www.tissotwatches.com/en-us/t1374101105100.html",
  hamiltonKhaki: "https://www.hamiltonwatch.com/en-us/h69429931-khaki-field-mechanical.html",
  casioA168: "https://www.casio.com/us/watches/casio/product.A168WA-1/",
  casioDuro: "https://www.casio.com/us/watches/casio/product.MDV-106B-1A1V/",
  timexWeekender: "https://www.timex.com/weekender-40mm-fabric-strap-watch/TW2P72300.html",
  skagen: "https://www.skagen.com/",
  mvmt: "https://www.mvmt.com/",
  fossil: "https://www.fossil.com/us/en/watches.html",
  danielWellington: "https://www.danielwellington.com/",
  bartonStraps: "https://www.bartonwatchbands.com/",
  hirschStraps: "https://www.hirschstraps.com/",
  crownAndBuckle: "https://www.crownandbuckle.com/",
};

export function getWatchCtaUrl(key: string): string {
  return WATCH_AFFILIATE_LINKS[key] ?? WATCH_OFFICIAL_URLS[key] ?? "#";
}
