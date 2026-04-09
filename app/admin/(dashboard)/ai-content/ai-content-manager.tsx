"use client";

import { useState } from "react";
import { fetchWithCsrf } from "@/lib/fetch-csrf";
import type { AIDraft } from "./page";

interface Props {
  drafts: AIDraft[];
  loading: boolean;
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;
  onRefresh: () => void;
}

const STATUS_TABS = [
  { value: "pending", label: "Pending Approval" },
  { value: "approved", label: "Approved" },
  { value: "published", label: "Published" },
  { value: "rejected", label: "Rejected" },
  { value: "", label: "All" },
];

const CONTENT_TYPES = [
  { value: "article", label: "Article" },
  { value: "review", label: "Review" },
  { value: "comparison", label: "Comparison" },
  { value: "guide", label: "Guide" },
];

export function AIContentManager({
  drafts,
  loading,
  statusFilter,
  onStatusFilterChange,
  onRefresh,
}: Props) {
  const [generating, setGenerating] = useState(false);
  const [showGenerator, setShowGenerator] = useState(false);
  const [topic, setTopic] = useState("");
  const [contentType, setContentType] = useState("article");
  const [keywords, setKeywords] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [previewDraft, setPreviewDraft] = useState<AIDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  async function handleGenerate() {
    if (!topic.trim()) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetchWithCsrf("/api/admin/ai-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: topic.trim(),
          content_type: contentType,
          keywords: keywords
            .split(",")
            .map((k) => k.trim())
            .filter(Boolean),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to generate content");
        return;
      }

      setTopic("");
      setKeywords("");
      setShowGenerator(false);
      setSuccessMsg("Content generated! Check the Pending tab.");
      onRefresh();
    } catch {
      setError("Failed to generate content");
    } finally {
      setGenerating(false);
    }
  }

  async function handleAction(id: string, action: "approve" | "publish" | "reject") {
    setActionLoading(id);
    setError(null);
    try {
      const res = await fetchWithCsrf("/api/admin/ai-content", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || `Failed to ${action}`);
        return;
      }

      setSuccessMsg(
        action === "publish"
          ? "Published! Content is now live."
          : action === "approve"
            ? "Approved!"
            : "Rejected.",
      );
      onRefresh();
    } catch {
      setError(`Failed to ${action}`);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this AI draft?")) return;
    setActionLoading(id);
    try {
      await fetchWithCsrf("/api/admin/ai-content", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      onRefresh();
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Messages */}
      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}
          <button onClick={() => setError(null)} className="ml-2 font-medium underline">
            Dismiss
          </button>
        </div>
      )}
      {successMsg && (
        <div className="rounded-md bg-green-50 p-3 text-sm text-green-700">
          {successMsg}
          <button onClick={() => setSuccessMsg(null)} className="ml-2 font-medium underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Generate button + form */}
      <div className="flex gap-3">
        <button
          onClick={() => setShowGenerator(!showGenerator)}
          className="rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
        >
          {showGenerator ? "Cancel" : "Generate Article"}
        </button>
        <button
          onClick={onRefresh}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Refresh
        </button>
      </div>

      {showGenerator && (
        <div className="rounded-lg border border-purple-200 bg-purple-50 p-4 space-y-3">
          <h3 className="font-semibold text-purple-900">Generate New Content</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700">Topic *</label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. Best Luxury Watches Under $500"
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Content Type</label>
              <select
                value={contentType}
                onChange={(e) => setContentType(e.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                {CONTENT_TYPES.map((ct) => (
                  <option key={ct.value} value={ct.value}>
                    {ct.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Keywords (comma-separated, optional)
            </label>
            <input
              type="text"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="e.g. luxury watch, affordable, gift"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            onClick={handleGenerate}
            disabled={generating || !topic.trim()}
            className="rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
          >
            {generating ? "Generating..." : "Generate"}
          </button>
        </div>
      )}

      {/* Status tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => onStatusFilterChange(tab.value)}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
              statusFilter === tab.value
                ? "border-purple-600 text-purple-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Drafts list */}
      {loading ? (
        <div className="py-12 text-center text-gray-500">Loading...</div>
      ) : drafts.length === 0 ? (
        <div className="py-12 text-center text-gray-500">
          No {statusFilter || ""} AI drafts yet. Click &quot;Generate Article&quot; to create one.
        </div>
      ) : (
        <div className="space-y-3">
          {drafts.map((draft) => (
            <div key={draft.id} className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        draft.status === "pending"
                          ? "bg-yellow-100 text-yellow-800"
                          : draft.status === "approved"
                            ? "bg-blue-100 text-blue-800"
                            : draft.status === "published"
                              ? "bg-green-100 text-green-800"
                              : "bg-red-100 text-red-800"
                      }`}
                    >
                      {draft.status}
                    </span>
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
                      {draft.content_type}
                    </span>
                    <span className="text-xs text-gray-400">via {draft.ai_provider}</span>
                  </div>
                  <h3 className="mt-1 font-semibold text-gray-900 truncate">{draft.title}</h3>
                  <p className="mt-1 text-sm text-gray-500 line-clamp-2">{draft.excerpt}</p>
                  <p className="mt-1 text-xs text-gray-400">
                    Topic: {draft.topic} &middot;{" "}
                    {new Date(draft.generated_at).toLocaleDateString()}
                  </p>
                </div>

                <div className="flex flex-shrink-0 gap-2">
                  <button
                    onClick={() => setPreviewDraft(previewDraft?.id === draft.id ? null : draft)}
                    className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    {previewDraft?.id === draft.id ? "Close" : "Preview"}
                  </button>

                  {draft.status === "pending" && (
                    <>
                      <button
                        onClick={() => handleAction(draft.id, "publish")}
                        disabled={actionLoading === draft.id}
                        className="rounded bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        Approve & Publish
                      </button>
                      <button
                        onClick={() => handleAction(draft.id, "reject")}
                        disabled={actionLoading === draft.id}
                        className="rounded border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </>
                  )}

                  {draft.status === "approved" && (
                    <button
                      onClick={() => handleAction(draft.id, "publish")}
                      disabled={actionLoading === draft.id}
                      className="rounded bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      Publish
                    </button>
                  )}

                  <button
                    onClick={() => handleDelete(draft.id)}
                    disabled={actionLoading === draft.id}
                    className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50 hover:text-red-600 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </div>

              {/* Preview panel */}
              {previewDraft?.id === draft.id && (
                <div className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-4">
                  <h4 className="font-semibold text-gray-900">{draft.title}</h4>
                  <div className="mt-2 text-sm text-gray-500">
                    <strong>Meta title:</strong> {draft.meta_title}
                  </div>
                  <div className="text-sm text-gray-500">
                    <strong>Meta description:</strong> {draft.meta_description}
                  </div>
                  <div
                    className="prose prose-sm mt-3 max-h-96 overflow-y-auto"
                    dangerouslySetInnerHTML={{ __html: draft.body }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
