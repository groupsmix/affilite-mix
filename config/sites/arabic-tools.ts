import { defineSite } from "../define-site";

export const arabicToolsSite = defineSite({
  id: "arabic-tools",
  name: "Arabic Tools",
  domain: "arabictools.wristnerd.site",
  aliases: ["arabic.localhost"],
  niche: "Arabic Product Reviews",
  description: "مراجعات وأدوات عربية لمقارنة المنتجات والخدمات التقنية",
  language: "ar",

  colors: { primary: "#1E293B", accent: "#10B981" },

  contentTypes: [
    { value: "article", label: "مقال", commercial: false, layout: "standard" },
    { value: "review", label: "مراجعة", commercial: true, layout: "sidebar" },
    { value: "comparison", label: "مقارنة", commercial: true, layout: "sidebar", minProducts: 2 },
    { value: "guide", label: "دليل", commercial: false, layout: "standard" },
  ],

  productLabel: "منتج",
  productLabelPlural: "منتجات",

  features: ["blog", "newsletter", "rssFeed", "search", "scheduling", "comparisons"],

  nav: [
    { title: "الرئيسية", href: "/" },
    { title: "المقالات", href: "/article" },
    { title: "المراجعات", href: "/review" },
    { title: "الأدلة", href: "/guide" },
  ],

  footerNav: {
    quickLinks: [
      { title: "الرئيسية", href: "/" },
      { title: "المقالات", href: "/article" },
    ],
    legal: [
      { title: "عن الموقع", href: "/about" },
      { title: "سياسة الخصوصية", href: "/privacy" },
      { title: "الشروط والأحكام", href: "/terms" },
    ],
  },

  pages: {
    about: {
      title: "عن الموقع",
      description: "تعرف على منصة الأدوات العربية",
    },
    privacy: {
      title: "سياسة الخصوصية",
      description: "كيف نتعامل مع بياناتك",
    },
    terms: {
      title: "الشروط والأحكام",
      description: "شروط وأحكام الاستخدام",
    },
  },

  contactPage: false,
  affiliateDisclosurePage: false,
});
