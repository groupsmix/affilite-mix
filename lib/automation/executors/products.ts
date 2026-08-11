import { validateAffiliateDomain } from "@/lib/affiliate-domain-allowlist";
import { validateOverrideDestination } from "@/lib/affiliate/override-url-guard";
import { getProductById, updateProduct } from "@/lib/dal/products";
import { getAutomationDbClient } from "@/lib/automation/db";
import type { AutomationActionRow } from "@/lib/dal/automation-actions";
import type { ProductRow } from "@/types/database";
import type {
  ProductAffiliateUrlInput,
  ProductLifecycleInput,
  ProductUpdateInput,
} from "@/lib/automation/schemas";

export interface ProductExecutorContext {
  siteId: string;
}

function snapshot(product: ProductRow): Record<string, unknown> {
  return { ...product };
}

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
  const input = action.payload as unknown as ProductUpdateInput;
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
  const input = action.payload as unknown as ProductAffiliateUrlInput;
  const validationError = validateProductAffiliateDestination(input.affiliate_url);
  if (validationError) {
    const error = new Error(validationError) as Error & {
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
  const input = action.payload as unknown as ProductLifecycleInput;
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
