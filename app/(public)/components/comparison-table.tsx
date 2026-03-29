import type { ProductRow } from "@/types/database";

interface ComparisonTableProps {
  products: ProductRow[];
}

export function ComparisonTable({ products }: ComparisonTableProps) {
  if (products.length < 2) return null;

  return (
    <div className="mb-8 overflow-x-auto">
      <table className="w-full border-collapse rounded-lg border border-gray-200 text-sm">
        <thead>
          <tr className="bg-gray-50">
            <th className="border-b border-gray-200 px-4 py-3 text-left font-medium text-gray-500">
              Feature
            </th>
            {products.map((p) => (
              <th
                key={p.id}
                className="border-b border-gray-200 px-4 py-3 text-center font-semibold text-gray-900"
              >
                {p.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border-b border-gray-100 px-4 py-3 font-medium text-gray-600">
              Price
            </td>
            {products.map((p) => (
              <td
                key={p.id}
                className="border-b border-gray-100 px-4 py-3 text-center font-semibold"
                style={{ color: "var(--color-accent, #10B981)" }}
              >
                {p.price || "—"}
              </td>
            ))}
          </tr>
          <tr>
            <td className="border-b border-gray-100 px-4 py-3 font-medium text-gray-600">
              Score
            </td>
            {products.map((p) => (
              <td key={p.id} className="border-b border-gray-100 px-4 py-3 text-center">
                {p.score !== null ? (
                  <span className="inline-block rounded bg-amber-100 px-2 py-0.5 font-medium text-amber-800">
                    {p.score}/10
                  </span>
                ) : (
                  "—"
                )}
              </td>
            ))}
          </tr>
          <tr>
            <td className="border-b border-gray-100 px-4 py-3 font-medium text-gray-600">
              Merchant
            </td>
            {products.map((p) => (
              <td
                key={p.id}
                className="border-b border-gray-100 px-4 py-3 text-center text-gray-700"
              >
                {p.merchant || "—"}
              </td>
            ))}
          </tr>
          <tr>
            <td className="px-4 py-3 font-medium text-gray-600">Description</td>
            {products.map((p) => (
              <td key={p.id} className="px-4 py-3 text-center text-gray-600">
                {p.description || "—"}
              </td>
            ))}
          </tr>
          <tr>
            <td className="border-t border-gray-200 px-4 py-3 font-medium text-gray-600" />
            {products.map((p) => (
              <td key={p.id} className="border-t border-gray-200 px-4 py-3 text-center">
                {p.affiliate_url && (
                  <a
                    href={`/api/track/click?p=${encodeURIComponent(p.slug)}&t=comparison`}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="inline-block rounded-md px-4 py-2 text-sm font-medium text-white transition-colors hover:opacity-90"
                    style={{ backgroundColor: "var(--color-accent, #10B981)" }}
                  >
                    {p.cta_text || "View Deal"}
                  </a>
                )}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
