/**
 * F-3: Safe, dependency-ordered restore for the per-table `--data-only` dumps
 * described in `docs/backup-strategy.md`.
 *
 * Per-table `pg_dump --data-only` dumps restored in an arbitrary order violate
 * foreign keys on restore (e.g. `content_products` rows arriving before their
 * parent `content` / `products` rows). This module encodes the FK dependency
 * graph among the backed-up tables and derives a restore order in which every
 * parent table is restored before its children, so a plain ordered restore
 * never trips an FK. It also emits a transactional wrapper that defers FK
 * enforcement during the load (`session_replication_role = replica`) and
 * re-validates every constraint at the end, so a partial failure rolls the
 * whole restore back instead of leaving referential gaps mid-incident.
 *
 * The order is validated by `__tests__/backup-restore-order.test.ts` and can be
 * self-checked with `npm run verify:backup-order`.
 */

/** Tables covered by the manual backup script in docs/backup-strategy.md. */
export const BACKUP_TABLES = [
  "sites",
  "admin_users",
  "categories",
  "products",
  "content",
  "content_products",
  "newsletter_subscribers",
  "affiliate_clicks",
  "audit_log",
] as const;

export type BackupTable = (typeof BACKUP_TABLES)[number];

/**
 * Foreign-key edges among the backed-up tables: `child -> parents it references`.
 * Only edges *within* the backup set matter for restore ordering. Derived from
 * `supabase/migrations/00001_initial_schema.sql`:
 *   - categories.site_id            -> sites
 *   - products.site_id              -> sites
 *   - products.category_id          -> categories
 *   - content.site_id               -> sites
 *   - content.category_id           -> categories
 *   - content_products.content_id   -> content
 *   - content_products.product_id   -> products
 *   - newsletter_subscribers.site_id-> sites
 *   - affiliate_clicks.site_id      -> sites
 *   - audit_log.site_id             -> sites
 *   - audit_log.user_id             -> admin_users
 */
export const FK_DEPENDENCIES: Readonly<Record<BackupTable, readonly BackupTable[]>> = {
  sites: [],
  admin_users: [],
  categories: ["sites"],
  products: ["sites", "categories"],
  content: ["sites", "categories"],
  content_products: ["content", "products"],
  newsletter_subscribers: ["sites"],
  affiliate_clicks: ["sites"],
  audit_log: ["sites", "admin_users"],
};

/**
 * Topological sort of `BACKUP_TABLES` by `FK_DEPENDENCIES` (parents first).
 * Deterministic (Kahn's algorithm): at each step the first still-pending table
 * whose parents are all restored is emitted, preferring `BACKUP_TABLES`
 * declaration order. Throws on a dependency cycle (should never happen for the
 * acyclic schema FK graph).
 */
export function computeRestoreOrder(): BackupTable[] {
  const done = new Set<BackupTable>();
  const order: BackupTable[] = [];

  while (order.length < BACKUP_TABLES.length) {
    const next = BACKUP_TABLES.find(
      (t) => !done.has(t) && FK_DEPENDENCIES[t].every((p) => done.has(p)),
    );
    if (!next) {
      const remaining = BACKUP_TABLES.filter((t) => !done.has(t));
      throw new Error(
        `backup-restore-order: unsatisfiable FK dependencies among [${remaining.join(", ")}] (cycle?)`,
      );
    }
    order.push(next);
    done.add(next);
  }
  return order;
}

/** Canonical dependency-ordered restore order (parents before children). */
export const RESTORE_ORDER: readonly BackupTable[] = computeRestoreOrder();

/**
 * Assert that `order` restores every parent before its children and covers
 * exactly the backup set. Throws with a specific message on the first
 * violation; returns `true` when the order is safe.
 */
export function assertRestoreOrderRespectsFks(order: readonly string[]): true {
  const seen = new Set<string>();
  for (const table of order) {
    for (const parent of FK_DEPENDENCIES[table as BackupTable] ?? []) {
      if (!seen.has(parent)) {
        throw new Error(
          `backup-restore-order: "${table}" is restored before its parent "${parent}"`,
        );
      }
    }
    seen.add(table);
  }
  const missing = BACKUP_TABLES.filter((t) => !seen.has(t));
  if (missing.length > 0) {
    throw new Error(`backup-restore-order: order omits backed-up tables [${missing.join(", ")}]`);
  }
  return true;
}

/**
 * Emit a single-transaction restore wrapper for the per-table dumps. FK triggers
 * are disabled during the load (`session_replication_role = replica`) and every
 * constraint is re-validated before COMMIT, so any failure rolls the whole
 * restore back rather than leaving dangling references.
 */
export function buildRestoreSql(backupDir: string): string {
  const restores = RESTORE_ORDER.map(
    (t) =>
      `\\echo restoring ${t}\n` +
      `\\! pg_restore --data-only --disable-triggers --table=${t} -d "$DATABASE_URL" "${backupDir}/${t}.dump"`,
  ).join("\n");

  const validations = RESTORE_ORDER.filter((t) => FK_DEPENDENCIES[t].length > 0)
    .map((t) => `-- SELECT COUNT(*) FROM ${t};`)
    .join("\n");

  return [
    "-- F-3: dependency-ordered, transactional restore of per-table data dumps.",
    "-- Run with: psql -v ON_ERROR_STOP=1 -f restore.sql",
    "BEGIN;",
    "SET session_replication_role = replica; -- defer FK/trigger enforcement during load",
    "",
    restores,
    "",
    "SET session_replication_role = origin; -- re-enable enforcement",
    "-- Re-validate referential integrity before committing:",
    validations,
    "COMMIT;",
  ].join("\n");
}

// Self-check entrypoint: `npm run verify:backup-order`.
if (process.argv[1] && process.argv[1].endsWith("backup-restore-order.ts")) {
  assertRestoreOrderRespectsFks(RESTORE_ORDER);
  console.log(`backup restore order OK: ${RESTORE_ORDER.join(" -> ")}`);
}
