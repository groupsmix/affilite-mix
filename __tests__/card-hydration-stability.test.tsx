/**
 * @vitest-environment jsdom
 *
 * SSR/CSR markup comparison tests for the public cards (Requirement 16).
 *
 * Subjects:
 *   - app/(public)/components/product-card.tsx  → ProductCard
 *   - app/(public)/components/content-card.tsx   → ContentCard
 *
 * Strategy (per design "SSR/CSR markup comparison"): render each card's server
 * markup with `renderToString`, then `hydrateRoot` the SAME element onto that
 * markup under jsdom. React's hydration step IS the byte-for-byte comparison of
 * the server markup against the client's INITIAL render (before passive effects
 * run) — any divergence in the time-dependent output is reported as a hydration
 * mismatch on `console.error`. We spy on `console.error` and assert no such
 * warning is emitted, which is the authoritative guarantee of byte-identical
 * time-dependent output (16.3). We additionally assert the SSR markup directly
 * (deal badge absent pre-mount) and the post-effect DOM (badge shown/hidden).
 *
 * Covers Requirements:
 *   - 16.1 product-card `mounted` guard hides the deal badge during SSR and the
 *          initial client render (before effects)
 *   - 16.3 server and initial-client markup are byte-identical → no hydration
 *          mismatch warning for either card
 *   - 16.4 mounted + active/unexpired deal → badge rendered (within 1s; the mount
 *          effect resolves synchronously inside `act`)
 *   - 16.5 expired deal → no badge and no remaining-time indicator after mount
 *   - 16.6 content-card with no `publish_at ?? created_at` → no <time> element
 *
 * next/image and next/link are mocked to inert DOM passthroughs so the cards
 * render under jsdom without the Next.js image/router runtime. The same mock is
 * used for both the server (`renderToString`) and client (`hydrateRoot`) passes,
 * so the comparison remains faithful. The logic under test — the `mounted`
 * guard, the deal-active/expiry branches, and the `<time>` guard — is real and
 * unmocked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot, type Root } from "react-dom/client";

// React 19 requires this flag so `act()` flushes effects/microtasks in tests.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Inert next/image: render a plain <img>, dropping Next-only props that are not
// valid DOM attributes so jsdom doesn't warn about unknown attributes.
vi.mock("next/image", () => ({
  __esModule: true,
  default: ({ src, alt }: { src?: unknown; alt?: string }) => {
    const url = typeof src === "string" ? src : "";
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={alt ?? ""} />;
  },
}));

// Inert next/link: render a plain <a>.
vi.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children }: { href?: unknown; children?: React.ReactNode }) => (
    <a href={typeof href === "string" ? href : "#"}>{children}</a>
  ),
}));

import { ProductCard } from "@/app/(public)/components/product-card";
import { ContentCard } from "@/app/(public)/components/content-card";
import type { ProductRow, ContentRow } from "@/types/database";

// ── Fixtures ───────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;
// A distinctive deal label so its presence/absence in markup is unambiguous.
const DEAL_TEXT = "FLASH-50-OFF-UNIQUE";

function makeProduct(overrides: Partial<ProductRow> = {}): ProductRow {
  return {
    id: "prod-1",
    site_id: "site-1",
    name: "Aurora Desk Lamp",
    slug: "aurora-desk-lamp",
    description: "A warm, dimmable desk lamp.",
    affiliate_url: "https://example.com/go/aurora",
    // Empty image_url so the (mocked) next/image branch is skipped entirely,
    // keeping the markup focused on the time-dependent deal badge.
    image_url: "",
    image_alt: "",
    price: "$49",
    price_amount: 49,
    price_currency: "USD",
    merchant: "ExampleMart",
    score: null,
    featured: false,
    status: "active",
    category_id: null,
    cta_text: "View Deal",
    deal_text: DEAL_TEXT,
    deal_expires_at: null,
    pros: "",
    cons: "",
    version: 1,
    created_at: "2024-01-01T00:00:00.000Z",
    updated_at: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeContent(overrides: Partial<ContentRow> = {}): ContentRow {
  return {
    id: "content-1",
    site_id: "site-1",
    title: "How To Pick A Desk Lamp",
    slug: "how-to-pick-a-desk-lamp",
    body: "<p>body</p>",
    excerpt: "Short and sweet buying advice.",
    featured_image: "",
    type: "guide",
    status: "published",
    category_id: null,
    tags: [],
    author: null,
    publish_at: null,
    meta_title: null,
    meta_description: null,
    og_image: null,
    body_previous: null,
    review_state: "published",
    created_at: "2024-03-15T12:00:00.000Z",
    updated_at: "2024-03-15T12:00:00.000Z",
    ...overrides,
  };
}

// ── Hydration harness ────────────────────────────────────────────────────

const HYDRATION_WARNING_RE =
  /hydrat|did not match|server (rendered|html)|server-rendered|text content|mismatch/i;

interface HydrationResult {
  /** Server (`renderToString`) markup — also the client's initial pre-effect render. */
  ssr: string;
  /** Container DOM AFTER passive effects (mount) have flushed. */
  container: HTMLDivElement;
  root: Root;
  /** All console.error messages captured during hydration. */
  errors: string[];
  /** Subset of `errors` that look like React hydration-mismatch warnings. */
  hydrationWarnings: string[];
}

let active: { root: Root; container: HTMLDivElement } | null = null;
let consoleErrorSpy: ReturnType<typeof vi.spyOn> | null = null;

/**
 * Render `element` to a server string, hydrate the same element onto it, and
 * report any hydration-mismatch warnings. After this returns, the mount effect
 * has run (so `container` reflects the post-effect DOM).
 */
function renderAndHydrate(element: React.ReactElement): HydrationResult {
  const ssr = renderToString(element);

  const container = document.createElement("div");
  container.innerHTML = ssr;
  document.body.appendChild(container);

  const errors: string[] = [];
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    errors.push(args.map((a) => (a instanceof Error ? a.message : String(a))).join(" "));
  });

  let root!: Root;
  act(() => {
    root = hydrateRoot(container, element);
  });

  active = { root, container };
  const hydrationWarnings = errors.filter((e) => HYDRATION_WARNING_RE.test(e));
  return { ssr, container, root, errors, hydrationWarnings };
}

beforeEach(() => {
  active = null;
  consoleErrorSpy = null;
});

afterEach(() => {
  if (active) {
    act(() => active!.root.unmount());
    active.container.remove();
    active = null;
  }
  consoleErrorSpy?.mockRestore();
  vi.restoreAllMocks();
});

// ── Tests ────────────────────────────────────────────────────────────────

describe("ProductCard hydration stability (R16.1, R16.3, R16.4, R16.5)", () => {
  it("16.1/16.3: mounted guard hides the deal badge during SSR and the initial client render", () => {
    // Active, unexpired deal — but the mounted guard must defer it until after mount.
    const product = makeProduct({
      deal_expires_at: new Date(Date.now() + 7 * DAY_MS).toISOString(),
    });

    const { ssr, hydrationWarnings } = renderAndHydrate(<ProductCard product={product} />);

    // 16.1: server markup (== initial client render, pre-effect) has no deal badge.
    expect(ssr).not.toContain(DEAL_TEXT);
    expect(ssr).not.toContain("bg-red-500");
    // 16.3: server and initial-client markup are byte-identical → no mismatch.
    expect(hydrationWarnings).toEqual([]);
  });

  it("16.4: after mount, an active/unexpired deal renders the badge", () => {
    const product = makeProduct({
      deal_expires_at: new Date(Date.now() + 7 * DAY_MS).toISOString(),
    });

    const { container, hydrationWarnings } = renderAndHydrate(<ProductCard product={product} />);

    // The mount effect (setMounted(true)) flushed inside act → badge now present.
    const html = container.innerHTML;
    expect(html).toContain(DEAL_TEXT);
    expect(html).toContain("bg-red-500");
    // A future-dated deal shows a remaining-time indicator ("Xd left").
    expect(html).toMatch(/\d+d left/);
    // Still no hydration mismatch from the pre-mount → mounted transition.
    expect(hydrationWarnings).toEqual([]);
  });

  it("16.4: after mount, a deal with no expiry is treated as active and renders the badge", () => {
    const product = makeProduct({ deal_expires_at: null });

    const { container, hydrationWarnings } = renderAndHydrate(<ProductCard product={product} />);

    const html = container.innerHTML;
    expect(html).toContain(DEAL_TEXT);
    expect(html).toContain("bg-red-500");
    // No expiry → no remaining-time indicator.
    expect(html).not.toMatch(/\d+[dh] left/);
    expect(hydrationWarnings).toEqual([]);
  });

  it("16.5: after mount, an expired deal renders no badge and no remaining-time indicator", () => {
    const product = makeProduct({
      deal_expires_at: new Date(Date.now() - DAY_MS).toISOString(),
    });

    const { ssr, container, hydrationWarnings } = renderAndHydrate(
      <ProductCard product={product} />,
    );

    // Absent during SSR (mounted guard)…
    expect(ssr).not.toContain(DEAL_TEXT);
    // …and STILL absent after mount because the deal is expired.
    const html = container.innerHTML;
    expect(html).not.toContain(DEAL_TEXT);
    expect(html).not.toContain("bg-red-500");
    expect(html).not.toMatch(/\d+[dh] left/);
    expect(hydrationWarnings).toEqual([]);
  });
});

describe("ContentCard hydration stability (R16.3, R16.6)", () => {
  it("16.6: with no publish_at and no created_at, renders no <time> element", () => {
    // publish_at null and created_at "" → `publish_at ?? created_at` is falsy.
    const content = makeContent({ publish_at: null, created_at: "" });

    const { ssr, container, hydrationWarnings } = renderAndHydrate(
      <ContentCard content={content} />,
    );

    expect(ssr).not.toContain("<time");
    expect(container.querySelector("time")).toBeNull();
    // No mounted guard on the content-card, so SSR == initial CSR; still verify.
    expect(hydrationWarnings).toEqual([]);
  });

  it("16.3: with a date present, renders a hydration-stable <time> element", () => {
    const content = makeContent({ publish_at: "2024-03-15T12:00:00.000Z" });

    const { ssr, container, hydrationWarnings } = renderAndHydrate(
      <ContentCard content={content} />,
    );

    // The <time> is present in the server markup with the raw ISO dateTime.
    expect(ssr).toContain("<time");
    const timeEl = container.querySelector("time");
    expect(timeEl).not.toBeNull();
    expect(timeEl?.getAttribute("dateTime")).toBe("2024-03-15T12:00:00.000Z");
    // UTC/en-US formatted output is identical on server and client → no mismatch.
    expect(timeEl?.textContent).toBe("3/15/2024");
    expect(hydrationWarnings).toEqual([]);
  });

  it("16.6: falls back to created_at for the <time> when publish_at is null", () => {
    const content = makeContent({
      publish_at: null,
      created_at: "2024-03-15T12:00:00.000Z",
    });

    const { container, hydrationWarnings } = renderAndHydrate(<ContentCard content={content} />);

    const timeEl = container.querySelector("time");
    expect(timeEl).not.toBeNull();
    expect(timeEl?.getAttribute("dateTime")).toBe("2024-03-15T12:00:00.000Z");
    expect(hydrationWarnings).toEqual([]);
  });
});
