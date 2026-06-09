import { requireAdminSession } from "../../components/admin-guard";
import { FeatureFlagsManager } from "./feature-flags-manager";

export default async function FeatureFlagsPage() {
  await requireAdminSession();

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Feature Flags</h1>
        <p className="mt-1 text-sm text-gray-500">
          Per-site feature flags with kill-switch capability. Toggle features without code deploy.
        </p>
      </div>
      <FeatureFlagsManager />
    </div>
  );
}
