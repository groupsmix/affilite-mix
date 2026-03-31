/**
 * Format a numeric price amount using Intl.NumberFormat.
 *
 * Falls back to the raw `price` string when `price_amount` is not available,
 * which preserves backward-compatibility with products that only store the
 * pre-formatted string (e.g. "$299").
 */
export function formatPrice(
  amount: number | null,
  currency: string = "USD",
): string {
  if (amount === null) return "";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(amount);
  } catch {
    // If the currency code is invalid, fall back to a simple dollar format
    return `$${amount.toFixed(2)}`;
  }
}
