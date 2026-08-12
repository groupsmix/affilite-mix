import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const migration = readFileSync(
  path.join(process.cwd(), "supabase/migrations/2026081401_seed_dial_products.sql"),
  "utf8",
);
const downMigration = readFileSync(
  path.join(process.cwd(), "supabase/migrations-down/2026081401_seed_dial_products-down.sql"),
  "utf8",
);

describe("Dial product backfill migration", () => {
  it("contains all stable Dial watch slugs and guarded inserts", () => {
    for (const slug of [
      "navigator-automatic",
      "heritage-field",
      "sterling-dress",
      "retro-digital",
      "circuit-chrono",
      "aria-minimalist",
      "casio-duro-walmart",
    ]) {
      expect(migration).toContain(`'${slug}'`);
    }
    expect(migration).toContain("watch-tools");
    expect(migration).toContain("WHERE NOT EXISTS");
    expect(migration).toContain("ON CONFLICT (site_id, slug) DO NOTHING");
    expect(migration).toContain("'sovrn'");
    expect(migration).not.toContain("has no Sovrn catalog entry");
    expect(migration).toContain("dial_rating_to_product_score");
  });

  it("has a reversible down migration for migration-owned IDs", () => {
    expect(downMigration).toContain("DROP FUNCTION IF EXISTS dial_rating_to_product_score");
    expect(downMigration).toContain("DELETE FROM product_affiliate_links");
    expect(downMigration).toContain("DELETE FROM products");
  });
});
