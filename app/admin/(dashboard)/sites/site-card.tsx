"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { fetchWithCsrf } from "@/lib/fetch-csrf";

interface SiteCardProps {
  site: {
    id: string;
    name: string;
    domain: string;
    niche: string;
  };
}

export function SiteCard({ site }: SiteCardProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleSelect() {
    setLoading(true);
    const res = await fetchWithCsrf("/api/admin/sites/select", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId: site.id }),
    });

    if (res.ok) {
      router.push("/admin");
    }
    setLoading(false);
  }

  return (
    <button
      type="button"
      onClick={handleSelect}
      disabled={loading}
      className="rounded-lg border border-gray-200 bg-white p-6 text-left shadow-sm transition-all hover:border-gray-300 hover:shadow-md disabled:opacity-50"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-900 text-lg font-bold text-white">
          {site.name[0].toUpperCase()}
        </span>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-gray-900">{site.name}</h2>
          <p className="mt-1 text-sm text-gray-500">{site.domain}</p>
          <p className="mt-1 text-xs text-gray-500">{site.niche}</p>
        </div>
      </div>
      {loading && <p className="mt-3 text-xs text-gray-500">Loading...</p>}
    </button>
  );
}
