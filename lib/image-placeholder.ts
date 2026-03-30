/**
 * Generates a lightweight shimmer placeholder as a base64-encoded SVG data URI.
 * Used as `blurDataURL` for next/image with `placeholder="blur"` to prevent
 * layout shift (CLS) while external product/content images load.
 *
 * The shimmer is a subtle animated gradient that indicates loading state.
 */

function toBase64(str: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(str).toString("base64");
  }
  // Edge runtime fallback
  return btoa(str);
}

/**
 * Returns a tiny SVG shimmer placeholder encoded as a data URI.
 * Suitable for next/image's `blurDataURL` prop.
 *
 * @param w - width of the placeholder (matches the image aspect ratio)
 * @param h - height of the placeholder
 */
export function shimmerPlaceholder(w: number, h: number): string {
  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g">
      <stop stop-color="#e2e8f0" offset="20%" />
      <stop stop-color="#f1f5f9" offset="50%" />
      <stop stop-color="#e2e8f0" offset="80%" />
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="#e2e8f0" />
  <rect width="${w}" height="${h}" fill="url(#g)">
    <animate attributeName="x" from="-${w}" to="${w}" dur="1.5s" repeatCount="indefinite" />
  </rect>
</svg>`;

  return `data:image/svg+xml;base64,${toBase64(svg)}`;
}
