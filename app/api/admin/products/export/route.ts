import { NextResponse } from "next/server";
import { withAuthz } from "@/lib/authz";
import { listProducts } from "@/lib/dal/products";
import { getTenantClientForSite } from "@/lib/supabase-server";
import { MAX_LIMIT, MAX_OFFSET } from "@/lib/dal/pagination-guard";
import { captureException } from "@/lib/sentry";
import { logger } from "@/lib/logger";
import { enforceAdminRateLimit } from "@/lib/admin-rate-limit";
import type { ProductRow } from "@/types/database";

/** GET /api/admin/products/export — download all products as CSV */
export const GET = withAuthz(
  "products",
  "read",
  async (_request, { session, siteId, siteSlug }) => {
    const rlResponse = await enforceAdminRateLimit("products-export", session);
    if (rlResponse) return rlResponse;

    try {
      // Bug 7: `listProducts({ siteId })` with no `limit` is silently clamped
      // to DEFAULT_LIMIT (20) by clampPagination, so "export all" only ever
      // emitted the first 20 rows. Page through the entire catalogue using the
      // largest page size the DAL honours (MAX_LIMIT), accumulating until a
      // short page marks the end.
      //
      // The loop is bounded independently of page length: the DAL clamps
      // `offset` at MAX_OFFSET, so once we move past it we stop (rather than
      // re-reading the same clamped page forever) and log a warning. This caps
      // memory at ~MAX_OFFSET + MAX_LIMIT rows for pathologically large
      // catalogues instead of buffering an unbounded result set.
      const PAGE_SIZE = MAX_LIMIT;
      const products: ProductRow[] = [];
      let offset = 0;

      const getClient = () => getTenantClientForSite(siteId, session.userId);
      for (;;) {
        const page = await listProducts({ siteId, limit: PAGE_SIZE, offset }, getClient);
        products.push(...page);

        // A short (or empty) page means there are no more rows to fetch.
        if (page.length < PAGE_SIZE) break;

        offset += PAGE_SIZE;
        if (offset > MAX_OFFSET) {
          logger.warn("products export reached the row cap; output truncated", {
            ctx: "api/admin/products/export",
            siteId,
            cap: MAX_OFFSET + PAGE_SIZE,
          });
          break;
        }
      }

      const headers = [
        "name",
        "slug",
        "description",
        "affiliate_url",
        "image_url",
        "image_alt",
        "price",
        "merchant",
        "score",
        "featured",
        "status",
        "cta_text",
        "deal_text",
        "deal_expires_at",
      ];

      /** S3-002: Neutralize spreadsheet formula injection (CWE-1236). */
      function sanitizeCsvValue(val: string): string {
        if (/^[=+\-@\t\r]/.test(val)) {
          val = "'" + val;
        }
        return val;
      }

      function escapeCsv(val: string): string {
        const sanitized = sanitizeCsvValue(val);
        if (
          sanitized.includes(",") ||
          sanitized.includes('"') ||
          sanitized.includes("\n") ||
          sanitized.includes("\r")
        ) {
          return `"${sanitized.replace(/"/g, '""')}"`;
        }
        return sanitized;
      }

      const rows = products.map((p) =>
        [
          p.name,
          p.slug,
          p.description,
          p.affiliate_url,
          p.image_url,
          p.image_alt,
          p.price,
          p.merchant,
          p.score?.toString() ?? "",
          p.featured ? "true" : "false",
          p.status,
          p.cta_text,
          p.deal_text,
          p.deal_expires_at ?? "",
        ]
          .map(escapeCsv)
          .join(","),
      );

      const csv = [headers.join(","), ...rows].join("\n");

      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="products-${siteSlug}-${new Date().toISOString().split("T")[0]}.csv"`,
        },
      });
    } catch (err) {
      captureException(err, { context: "[api/admin/products/export] GET failed:" });
      return NextResponse.json({ error: "Failed to export products" }, { status: 500 });
    }
  },
);
