/**
 * Arabic plural categories (RFC 5491 / CLDR)
 *
 * zero:  0
 * one:   1
 * two:   2
 * few:   3-10
 * many:  11-99
 * other: 100+
 */
export type ArabicPluralCategory = "zero" | "one" | "two" | "few" | "many" | "other";

export function getArabicPluralCategory(n: number): ArabicPluralCategory {
  if (n === 0) return "zero";
  if (n === 1) return "one";
  if (n === 2) return "two";
  if (n >= 3 && n <= 10) return "few";
  if (n >= 11 && n <= 99) return "many";
  return "other";
}

export interface PluralStrings {
  zero: string;
  one: string;
  two: string;
  few: string;
  many: string;
  other: string;
}

export function formatArabicPlural(n: number, strings: PluralStrings): string {
  const category = getArabicPluralCategory(n);
  return strings[category].replace("{n}", n.toString());
}
