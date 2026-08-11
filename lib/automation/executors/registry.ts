import type { AutomationActionRow } from "@/lib/dal/automation-actions";
import type { ActionType } from "@/lib/automation/policy";
import {
  executeProductActivate,
  executeProductArchive,
  executeProductAffiliateUrl,
  executeProductUpdate,
  rollbackProductAffiliateUrl,
  rollbackProductLifecycle,
  rollbackProductUpdate,
} from "./products";

export interface ExecutorContext {
  siteId: string;
}

export interface Executor {
  execute: (
    action: AutomationActionRow,
    context: ExecutorContext,
  ) => Promise<{
    result: Record<string, unknown>;
    beforeSnapshot?: Record<string, unknown> | null;
    afterSnapshot?: Record<string, unknown> | null;
    targetId?: string | null;
  }>;
  rollback?: (
    action: AutomationActionRow,
    context: ExecutorContext,
  ) => Promise<Record<string, unknown>>;
}

export const executorRegistry = {
  "products.update": { execute: executeProductUpdate, rollback: rollbackProductUpdate },
  "products.update_affiliate_url": {
    execute: executeProductAffiliateUrl,
    rollback: rollbackProductAffiliateUrl,
  },
  "products.activate": { execute: executeProductActivate, rollback: rollbackProductLifecycle },
  "products.archive": { execute: executeProductArchive, rollback: rollbackProductLifecycle },
} satisfies Partial<Record<ActionType, Executor>>;

export function getExecutor(actionType: ActionType): Executor | null {
  return executorRegistry[actionType as keyof typeof executorRegistry] ?? null;
}
