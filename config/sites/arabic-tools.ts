import type { SiteDefinition } from "../site-definition";

export const arabicToolsSite: SiteDefinition = {
  id: "arabic-tools",
  name: "Arabic Tools",
  domain: "arabic.wristnerd.site",
  language: "ar",
  direction: "rtl",
  locale: "ar_SA",

  brand: {
    description:
      "مراجعات وأدوات عربية لمقارنة المنتجات والخدمات التقنية",
    contactEmail: "contact@arabic.wristnerd.site",
    niche: "Arabic Product Reviews",
  },

  theme: {
    primaryColor: "#1E293B",
    accentColor: "#10B981",
    fontHeading: "IBM Plex Sans Arabic",
    fontBody: "IBM Plex Sans Arabic",
  },

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

  contentTypes: [
    {
      value: "article",
      label: "مقال",
      commercial: false,
      layout: "standard",
    },
    {
      value: "review",
      label: "مراجعة",
      commercial: true,
      layout: "sidebar",
    },
    {
      value: "comparison",
      label: "مقارنة",
      commercial: true,
      layout: "sidebar",
      minProducts: 2,
    },
    {
      value: "guide",
      label: "دليل",
      commercial: false,
      layout: "standard",
    },
  ],

  productLabel: "منتج",
  productLabelPlural: "منتجات",

  affiliateDisclosure:
    "قد نحصل على عمولة من الروابط التابعة دون أي تكلفة إضافية عليك.",
  contentDisclosure:
    "تحتوي هذه الصفحة على روابط تابعة. قد نحصل على عمولة إذا قمت بالتسجيل.",

  features: {
    blog: { source: "database" },
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

  seo: {
    robotsDisallow: ["/admin/", "/api/"],
    sitemapStaticPages: [
      { path: "/", priority: 1, changeFrequency: "daily" },
    ],
  },
};
