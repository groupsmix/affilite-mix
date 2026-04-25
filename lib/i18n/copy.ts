const en = {
  welcome: "Welcome to",
  readMore: "Read More",
  priceAlert: "Price Alert",
  disclaimer: "As an affiliate we earn from qualifying purchases."
};

const ar = {
  welcome: "مرحبا بك في",
  readMore: "اقرأ المزيد",
  priceAlert: "تنبيه السعر",
  disclaimer: "بصفتنا شركة تابعة ، نكسب من عمليات الشراء المؤهلة."
};

export function getPublicCopy(language: string = 'en') {
  return language === 'ar' ? ar : en;
}
