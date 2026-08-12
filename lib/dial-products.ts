import { hasUsableAffiliateUrl } from "@/lib/affiliate-url";
import { resolveDialAffiliateUrl } from "@/lib/dial-affiliate";
import { defaultDalClientGetter, type DalClientGetter } from "@/lib/dal/dal-client";
import type { DialHomepageConfig, Watch } from "@/lib/dial-config";
import { productsTag } from "@/lib/cache-tags";
import { logger } from "@/lib/logger";
import { captureException } from "@/lib/sentry";
import { unstable_cache } from "next/cache";

const PRODUCT_COLUMNS =
  "id, site_id, slug, price_amount, price_currency, affiliate_url, status" as const;
const LINK_COLUMNS = "id, product_id, network, geo, url, weight, is_active" as const;

interface DialOperationalProduct {
  id: string;
  slug: string;
  price_amount: number | null;
  affiliate_url: string | null;
}

interface DialOperationalLink {
  id: string;
  product_id: string;
  network: string;
  geo: string;
  url: string;
  weight: number;
  is_active: boolean;
}

interface DialOperationalData {
  products: DialOperationalProduct[];
  links: DialOperationalLink[];
}

/**
 * Dial stores editorial ratings on a five-point scale while products use ten.
 */
export function dialRatingToProductScore(rating: number): number {
  return Number((rating * 2).toFixed(2));
}

function pickDialLink(links: DialOperationalLink[], productId: string): DialOperationalLink | null {
  const productLinks = links
    .filter((link) => link.product_id === productId && link.is_active)
    .sort((a, b) => b.weight - a.weight);
  return productLinks.find((link) => link.geo === "*") ?? productLinks[0] ?? null;
}

async function readDialOperationalData(
  siteId: string,
  slugs: string[],
  getClient: DalClientGetter,
): Promise<DialOperationalData | null> {
  try {
    const sb = await getClient();
    const { data: products, error: productsError } = await sb
      .from("products")
      .select(PRODUCT_COLUMNS)
      .eq("site_id", siteId)
      .eq("status", "active")
      .in("slug", slugs);
    if (productsError) throw productsError;

    const productRows = (products ?? []) as DialOperationalProduct[];
    const productIds = productRows.map((product) => product.id);
    const { data: links, error: linksError } =
      productIds.length > 0
        ? await sb
            .from("product_affiliate_links")
            .select(LINK_COLUMNS)
            .in("product_id", productIds)
            .eq("is_active", true)
        : { data: [], error: null };
    if (linksError) throw linksError;

    return {
      products: productRows,
      links: (links ?? []) as DialOperationalLink[],
    };
  } catch (error) {
    logger.warn("[dial-products] operational data unavailable; using config fallback", {
      site_id: siteId,
    });
    captureException(error, {
      context: "[dial-products] operational data lookup failed",
      extra: { site_id: siteId },
    });
    return null;
  }
}

const cachedOperationalBySite = new Map<
  string,
  (siteId: string, slugs: string[]) => Promise<DialOperationalData | null>
>();

function getCachedDialOperationalData(
  siteId: string,
  slugKey: string,
): (siteId: string, slugs: string[]) => Promise<DialOperationalData | null> {
  const cacheKey = `${siteId}:${slugKey}`;
  let reader = cachedOperationalBySite.get(cacheKey);
  if (!reader) {
    reader = unstable_cache(
      (cachedSiteId: string, cachedSlugs: string[]) =>
        readDialOperationalData(cachedSiteId, cachedSlugs, defaultDalClientGetter),
      ["dial-operational-products", siteId, slugKey],
      {
        revalidate: 30,
        tags: [productsTag(siteId)],
      },
    );
    cachedOperationalBySite.set(cacheKey, reader);
  }
  return reader;
}

/**
 * Layer operational product data onto Dial's editorial watch configuration.
 * Missing or unusable DB values deliberately fall back to the config value.
 */
export async function resolveDialWatches(
  siteId: string,
  config: DialHomepageConfig,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<DialHomepageConfig> {
  if (config.watches.length === 0) return config;

  const slugs = config.watches.map((watch) => watch.id);
  const slugKey = [...slugs].sort().join(",");
  const operationalData =
    getClient === defaultDalClientGetter
      ? await getCachedDialOperationalData(siteId, slugKey)(siteId, slugs)
      : await readDialOperationalData(siteId, slugs, getClient);
  if (!operationalData) return config;

  const productRows = operationalData.products;
  const productBySlug = new Map(productRows.map((product) => [product.slug, product]));
  const linksByProduct = operationalData.links;

  const watches = config.watches.map((watch: Watch) => {
    const product = productBySlug.get(watch.id);
    if (!product) return watch;

    const configUrl = resolveDialAffiliateUrl(watch);
    const dbLink = pickDialLink(linksByProduct, product.id);
    const dbUrl = dbLink?.url || product.affiliate_url || "";
    const resolvedDbUrl = resolveDialAffiliateUrl({
      ...watch,
      affiliateUrl: dbUrl,
    });
    const dbPrice = product.price_amount === null ? NaN : Number(product.price_amount);

    return {
      ...watch,
      price: Number.isFinite(dbPrice) ? dbPrice : watch.price,
      affiliateUrl: hasUsableAffiliateUrl(resolvedDbUrl) ? resolvedDbUrl : configUrl,
    };
  });

  return { ...config, watches };
}
