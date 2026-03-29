import { defineSite } from "../define-site";

export const arabicToolsSite = defineSite({
  id: "arabic-tools",
  name: "Arabic Tools",
  domain: "arabic.wristnerd.site",
  niche: "Arabic Product Reviews",
  language: "ar",

  colors: { primary: "#1E293B", accent: "#10B981" },
  homepage: "standard",

  contentTypes: [
    { value: "article", label: "مقال", commercial: false, layout: "standard" },
    { value: "review", label: "مراجعة", commercial: true, layout: "sidebar" },
    { value: "comparison", label: "مقارنة", commercial: true, layout: "sidebar", minProducts: 2 },
    { value: "guide", label: "دليل", commercial: false, layout: "standard" },
  ],

  productLabel: "منتج",
  productLabelPlural: "منتجات",

  features: [
    "blog",
    "comparisons",
    "newsletter",
    "rssFeed",
    "search",
    "scheduling",
  ],

  contactPage: false,
  affiliateDisclosurePage: false,
});
