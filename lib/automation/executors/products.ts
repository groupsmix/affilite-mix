import { isDeepStrictEqual } from "node:util";
import { validateAffiliateDomain } from "@/lib/affiliate-domain-allowlist";
import { validateOverrideDestination } from "@/lib/affiliate/override-url-guard";
import { getProductById, updateProduct } from "@/lib/dal/products";
import { getAutomationDbClient } from "@/lib/automation/db";
import type { AutomationActionRow } from "@/lib/dal/automation-actions";
import type { ProductRow } from "@/types/database";
import type {
  ProductAffiliateUrlInput,
  ProductLifecycleInput,
  ProductMetadataUpdate,
  ProductUpdateInput,
} from "@/lib/automation/schemas";
import {
  parseProductAffiliateUrlInput,
  parseProductLifecycleInput,
  parseProductUpdateInput,
} from "@/lib/automation/schemas";

export interface ProductExecutorContext {
  siteId: string;
}

function snapshot(product: ProductRow): Record<string, unknown> {
  return { ...product };
}

type ProductUpdateField = keyof ProductMetadataUpdate;

export function validateProductAffiliateDestination(url: string): string | null {
  const domain = validateAffiliateDomain(url);
  if (!domain.allowed) return domain.reason ?? "Affiliate destination is not allowed";
  const override = validateOverrideDestination(url);
  if (!override.allowed) return `Affiliate destination is not allowed: ${override.reason}`;
  return null;
}

async function productForAction(siteId: string, productId: string): Promise<ProductRow> {
  const product = await getProductById(siteId, productId, getAutomationDbClient);
  if (!product) {
    const error = new Error("Product not found") as Error & { status?: number };
    error.status = 404;
    throw error;
  }
  return product;
}

export async function assertProductTarget(siteId: string, productId: string): Promise<void> {
  await productForAction(siteId, productId);
}

export async function executeProductUpdate(
  action: AutomationActionRow,
  context: ProductExecutorContext,
) {
  const parsed = parseProductUpdateInput(action.payload);
  if (!parsed.ok) throw validationError(parsed.errors.join("; "));
  const input: ProductUpdateInput = parsed.value;
  const before = await productForAction(context.siteId, input.product_id);
  const after = await updateProduct(
    context.siteId,
    input.product_id,
    input.updates,
    getAutomationDbClient,
    before.version,
  );
  return {
    result: { product_id: after.id, status: after.status },
    beforeSnapshot: snapshot(before),
    afterSnapshot: snapshot(after),
  };
}

export async function executeProductAffiliateUrl(
  action: AutomationActionRow,
  context: ProductExecutorContext,
) {
  const parsed = parseProductAffiliateUrlInput(action.payload);
  if (!parsed.ok) throw validationError(parsed.errors.join("; "));
  const input: ProductAffiliateUrlInput = parsed.value;
  const destinationError = validateProductAffiliateDestination(input.affiliate_url);
  if (destinationError) {
    const error = new Error(destinationError) as Error & {
      status?: number;
    };
    error.status = 422;
    throw error;
  }
  const before = await productForAction(context.siteId, input.product_id);
  const after = await updateProduct(
    context.siteId,
    input.product_id,
    { affiliate_url: input.affiliate_url },
    getAutomationDbClient,
    before.version,
  );
  return {
    result: { product_id: after.id, affiliate_url: after.affiliate_url },
    beforeSnapshot: snapshot(before),
    afterSnapshot: snapshot(after),
  };
}

async function executeLifecycle(
  action: AutomationActionRow,
  context: ProductExecutorContext,
  status: ProductRow["status"],
) {
  const parsed = parseProductLifecycleInput(action.payload);
  if (!parsed.ok) throw validationError(parsed.errors.join("; "));
  const input: ProductLifecycleInput = parsed.value;
  const before = await productForAction(context.siteId, input.product_id);
  const after = await updateProduct(
    context.siteId,
    input.product_id,
    { status },
    getAutomationDbClient,
    before.version,
  );
  return {
    result: { product_id: after.id, status: after.status },
    beforeSnapshot: snapshot(before),
    afterSnapshot: snapshot(after),
  };
}

export const executeProductActivate = (
  action: AutomationActionRow,
  context: ProductExecutorContext,
) => executeLifecycle(action, context, "active");

export const executeProductArchive = (
  action: AutomationActionRow,
  context: ProductExecutorContext,
) => executeLifecycle(action, context, "archived");

function snapshotField(snapshotValue: Record<string, unknown> | null, field: string): unknown {
  if (!snapshotValue || !(field in snapshotValue)) {
    throw validationError(`Missing ${field} in action snapshot`);
  }
  return snapshotValue[field];
}

function assertCurrentMatchesAfter(
  current: ProductRow,
  after: Record<string, unknown> | null,
  fields: readonly string[],
): void {
  for (const field of fields) {
    if (!isDeepStrictEqual(snapshotField(after, field), current[field as keyof ProductRow])) {
      throw conflictError(`Product changed since approval (${field})`);
    }
  }
}

async function rollbackProductFields(
  action: AutomationActionRow,
  context: ProductExecutorContext,
  fields: readonly ProductUpdateField[],
) {
  const parsed = parseProductUpdateInput(action.payload);
  if (!parsed.ok) throw validationError(parsed.errors.join("; "));
  const before = await productForAction(context.siteId, parsed.value.product_id);
  assertCurrentMatchesAfter(before, action.after_snapshot, fields);
  const updates: Record<string, unknown> = {};
  for (const field of fields) updates[field] = snapshotField(action.before_snapshot, field);
  const restored = await updateProduct(
    context.siteId,
    parsed.value.product_id,
    updates as Parameters<typeof updateProduct>[2],
    getAutomationDbClient,
    before.version,
  );
  return { product_id: restored.id, status: restored.status };
}

export async function rollbackProductUpdate(
  action: AutomationActionRow,
  context: ProductExecutorContext,
) {
  const parsed = parseProductUpdateInput(action.payload);
  if (!parsed.ok) throw validationError(parsed.errors.join("; "));
  const fields = Object.keys(parsed.value.updates) as ProductUpdateField[];
  return rollbackProductFields(action, context, fields);
}

export async function rollbackProductAffiliateUrl(
  action: AutomationActionRow,
  context: ProductExecutorContext,
) {
  const parsed = parseProductAffiliateUrlInput(action.payload);
  if (!parsed.ok) throw validationError(parsed.errors.join("; "));
  const beforeUrl = snapshotField(action.before_snapshot, "affiliate_url");
  if (typeof beforeUrl !== "string") throw validationError("Invalid affiliate URL snapshot");
  const validationErrorMessage = validateProductAffiliateDestination(beforeUrl);
  if (validationErrorMessage) throw validationError(validationErrorMessage);
  const current = await productForAction(context.siteId, parsed.value.product_id);
  assertCurrentMatchesAfter(current, action.after_snapshot, ["affiliate_url"]);
  const restored = await updateProduct(
    context.siteId,
    parsed.value.product_id,
    { affiliate_url: beforeUrl },
    getAutomationDbClient,
    current.version,
  );
  return { product_id: restored.id, affiliate_url: restored.affiliate_url };
}

export async function rollbackProductLifecycle(
  action: AutomationActionRow,
  context: ProductExecutorContext,
) {
  const parsed = parseProductLifecycleInput(action.payload);
  if (!parsed.ok) throw validationError(parsed.errors.join("; "));
  const before = await productForAction(context.siteId, parsed.value.product_id);
  assertCurrentMatchesAfter(before, action.after_snapshot, ["status"]);
  const priorStatus = snapshotField(action.before_snapshot, "status");
  if (priorStatus !== "draft" && priorStatus !== "active" && priorStatus !== "archived") {
    throw validationError("Invalid product status snapshot");
  }
  const restored = await updateProduct(
    context.siteId,
    parsed.value.product_id,
    { status: priorStatus },
    getAutomationDbClient,
    before.version,
  );
  return { product_id: restored.id, status: restored.status };
}

export function mapProductExecutorError(error: unknown) {
  const status = (error as Error & { status?: number }).status;
  const code =
    status === 404
      ? "AUTOMATION_NOT_FOUND"
      : status === 422
        ? "AUTOMATION_VALIDATION_ERROR"
        : (error as Error & { code?: string })?.code === "CONFLICT"
          ? "AUTOMATION_VALIDATION_ERROR"
          : "AUTOMATION_INTERNAL_ERROR";
  return {
    code,
    message: error instanceof Error ? error.message : "Product mutation failed",
  } as const;
}

function validationError(message: string): Error & { status: number } {
  return Object.assign(new Error(message), { status: 422 });
}

function conflictError(message: string): Error & { status: number; code: string } {
  return Object.assign(new Error(message), { status: 409, code: "CONFLICT" });
}
