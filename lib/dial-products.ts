import { hasUsableAffiliateUrl } from "@/lib/affiliate-url";
import { resolveDialAffiliateUrl } from "@/lib/dial-affiliate";
import { type ProductAffiliateLinkRow } from "@/lib/dal/product-affiliate-links";
import { defaultDalClientGetter, type DalClientGetter } from "@/lib/dal/dal-client";
import type { DialHomepageConfig, Watch } from "@/lib/dial-config";

const PRODUCT_COLUMNS =
  "id, site_id, slug, price_amount, price_currency, affiliate_url, status" as const;
const LINK_COLUMNS = "id, product_id, network, geo, url, weight, is_active" as const;

/**
 * Dial stores editorial ratings on a five-point scale while products use ten.
 */
export function dialRatingToProductScore(rating: number): number {
  return Number((rating * 2).toFixed(2));
}

function pickDialLink(
  links: ProductAffiliateLinkRow[],
  productId: string,
): ProductAffiliateLinkRow | null {
  const productLinks = links
    .filter((link) => link.product_id === productId && link.is_active)
    .sort((a, b) => b.weight - a.weight);
  return productLinks.find((link) => link.geo === "*") ?? productLinks[0] ?? null;
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

  const sb = await getClient();
  const slugs = config.watches.map((watch) => watch.id);
  const { data: products, error: productsError } = await sb
    .from("products")
    .select(PRODUCT_COLUMNS)
    .eq("site_id", siteId)
    .eq("status", "active")
    .in("slug", slugs);
  if (productsError) throw productsError;

  const productRows = (products ?? []) as Array<{
    id: string;
    slug: string;
    price_amount: number | null;
    price_currency: string | null;
    affiliate_url: string | null;
  }>;
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

  const productBySlug = new Map(productRows.map((product) => [product.slug, product]));
  const linksByProduct = (links ?? []) as ProductAffiliateLinkRow[];

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
