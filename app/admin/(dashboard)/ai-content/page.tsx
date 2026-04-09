"use client";

import { useState, useEffect, useCallback } from "react";
import { AIContentManager } from "./ai-content-manager";

export interface AIDraft {
  id: string;
  site_id: string;
  title: string;
  slug: string;
  body: string;
  excerpt: string;
  content_type: string;
  topic: string;
  keywords: string[];
  ai_provider: string;
  status: "pending" | "approved" | "rejected" | "published";
  generated_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  meta_title: string | null;
  meta_description: string | null;
  created_at: string;
  updated_at: string;
}

export default function AIContentPage() {
  const [drafts, setDrafts] = useState<AIDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("pending");

  const fetchDrafts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`/api/admin/ai-content?${params}`);
      if (res.ok) {
        const data = await res.json();
        setDrafts(data);
      }
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchDrafts();
  }, [fetchDrafts]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">AI Content Engine</h1>
          <p className="text-sm text-gray-500 mt-1">
            Generate, review, and publish AI-written content
          </p>
        </div>
      </div>

      <AIContentManager
        drafts={drafts}
        loading={loading}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        onRefresh={fetchDrafts}
      />
    </div>
  );
}
