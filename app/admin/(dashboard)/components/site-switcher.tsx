"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { fetchWithCsrf } from "@/lib/fetch-csrf";

interface SiteInfo {
  id: string;
  name: string;
  domain: string;
}

export function SiteSwitcher() {
  const [sites, setSites] = useState<SiteInfo[]>([]);
  const [activeSiteId, setActiveSiteId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    async function loadSites() {
      const res = await fetch("/api/admin/sites");
      if (res.ok) {
        const data = await res.json();
        setSites(data.sites);
      }
    }
    loadSites();

    // Read active site from httpOnly cookie via API
    async function loadActiveSite() {
      try {
        const activeRes = await fetch("/api/admin/sites/active");
        if (activeRes.ok) {
          const activeData = await activeRes.json();
          if (activeData.activeSiteId) {
            setActiveSiteId(activeData.activeSiteId);
          }
        }
      } catch {
        // Ignore — will show "Select a site" fallback
      }
    }
    loadActiveSite();
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleSelectSite(siteId: string) {
    if (siteId === activeSiteId || switching) return;
    setSwitching(true);

    const res = await fetchWithCsrf("/api/admin/sites/select", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId }),
    });

    if (res.ok) {
      setActiveSiteId(siteId);
      setOpen(false);
      router.refresh();
    }
    setSwitching(false);
  }

  const activeSite = sites.find((s) => s.id === activeSiteId);

  if (sites.length === 0) {
    return (
      <div className="flex w-full items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
        <span className="h-6 w-6 animate-pulse rounded bg-gray-200" />
        <span className="h-4 flex-1 animate-pulse rounded bg-gray-200" />
      </div>
    );
  }

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-left text-sm transition-colors hover:bg-gray-100"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded bg-gray-900 text-xs font-bold text-white">
          {(activeSite?.name ?? "?")[0].toUpperCase()}
        </span>
        <span className="flex-1 truncate font-medium text-gray-900">
          {activeSite?.name ?? "Select a site"}
        </span>
        <svg
          className={`h-4 w-4 text-gray-500 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-50 mt-1 overflow-hidden rounded-md border border-gray-200 bg-white shadow-lg">
          <div className="px-3 py-2 text-xs font-medium uppercase tracking-wider text-gray-500">
            Your Sites
          </div>
          {sites.map((site) => (
            <button
              key={site.id}
              type="button"
              onClick={() => handleSelectSite(site.id)}
              disabled={switching}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                site.id === activeSiteId
                  ? "bg-gray-100 font-medium text-gray-900"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              } disabled:opacity-50`}
            >
              <span className="flex h-6 w-6 items-center justify-center rounded bg-gray-200 text-xs font-bold text-gray-700">
                {site.name[0].toUpperCase()}
              </span>
              <div className="flex-1 truncate">
                <div className="truncate">{site.name}</div>
                <div className="truncate text-xs text-gray-500">{site.domain}</div>
              </div>
              {site.id === activeSiteId && (
                <svg
                  className="h-4 w-4 text-green-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
