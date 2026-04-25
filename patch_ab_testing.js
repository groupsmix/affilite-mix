const fs = require('fs');

let ab = fs.readFileSync('/data/user/work/affilite-mix/lib/ab-testing.ts', 'utf8');

ab = ab.replace(
  'export async function getVariantAssignment(\n  experimentId: string,\n  visitorId: string,\n  variants: Variant[],\n): Promise<string> {',
  'export async function getVariantAssignment(\n  experimentId: string,\n  visitorId: string,\n  variants: Variant[],\n  siteId: string,\n): Promise<string> {'
);

ab = ab.replace(
  '    .eq("visitor_id", visitorId)\n    .maybeSingle();',
  '    .eq("visitor_id", visitorId)\n    .eq("site_id", siteId)\n    .maybeSingle();'
);

ab = ab.replace(
  '      experiment_id: experimentId,\n      visitor_id: visitorId,\n      variant_id: variantId,\n    })',
  '      experiment_id: experimentId,\n      visitor_id: visitorId,\n      variant_id: variantId,\n      site_id: siteId,\n    })'
);

ab = ab.replace(
  'export async function logExperimentEvent(input: {\n  experiment_id: string;\n  visitor_id: string;\n  variant_id: string;\n  event_type: "view" | "click" | "conversion";\n  metadata?: Record<string, unknown>;\n}): Promise<void> {',
  'export async function logExperimentEvent(input: {\n  experiment_id: string;\n  visitor_id: string;\n  variant_id: string;\n  site_id: string;\n  event_type: "view" | "click" | "conversion";\n  metadata?: Record<string, unknown>;\n}): Promise<void> {'
);

fs.writeFileSync('/data/user/work/affilite-mix/lib/ab-testing.ts', ab);

