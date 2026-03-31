"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ContentBulkActions } from "./bulk-actions";
import { ContentDeleteButton } from "./content-delete-button";
import { fetchWithCsrf } from "@/lib/fetch-csrf";
import { toast } from "sonner";

interface ContentListItem {
  id: string;
  title: string;
  type: string;
  status: string;
  author: string | null;
  publish_at?: string | null;
}

interface ContentListProps {
  items: ContentListItem[];
}

function ContentStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    published: "bg-green-100 text-green-700",
    draft: "bg-yellow-100 text-yellow-700",
    review: "bg-blue-100 text-blue-700",
    scheduled: "bg-indigo-100 text-indigo-700",
    archived: "bg-gray-100 text-gray-600",
  };
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${colors[status] ?? "bg-gray-100 text-gray-600"}`}
    >
      {status}
    </span>
  );
}

export function ContentList({ items }: ContentListProps) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [cloningId, setCloningId] = useState<string | null>(null);

  async function handleClone(id: string, title: string) {
    setCloningId(id);
    try {
      const res = await fetchWithCsrf(`/api/admin/content/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        toast.success(`Cloned "${title}"`);
        router.refresh();
      } else {
        const data = await res.json();
        toast.error(data.error ?? "Failed to clone");
      }
    } catch {
      toast.error("Failed to clone content");
    }
    setCloningId(null);
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleAll() {
    if (selectedIds.length === items.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(items.map((c) => c.id));
    }
  }

  return (
    <>
      <ContentBulkActions selectedIds={selectedIds} onClear={() => setSelectedIds([])} />

      {/* Card layout on mobile */}
      <div className="mt-4 grid gap-3 md:hidden">
        {items.map((item) => (
          <div key={item.id} className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(item.id)}
                  onChange={() => toggleSelect(item.id)}
                  className="rounded border-gray-300"
                />
                <h3 className="font-medium text-gray-900">{item.title}</h3>
              </div>
              <ContentStatusBadge status={item.status} />
            </div>
            <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-gray-500">
              <span className="rounded bg-gray-100 px-2 py-0.5 text-xs">{item.type}</span>
              {item.author && <span>by {item.author}</span>}
            </div>
            <div className="flex gap-3">
              <Link
                href={`/admin/content/${item.id}`}
                className="text-sm text-blue-600 hover:underline"
              >
                Edit
              </Link>
              <button
                onClick={() => handleClone(item.id, item.title)}
                disabled={cloningId === item.id}
                className="text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50"
              >
                {cloningId === item.id ? "Cloning…" : "Clone"}
              </button>
              <ContentDeleteButton id={item.id} title={item.title} />
            </div>
          </div>
        ))}
      </div>

      {/* Table layout on md+ screens */}
      <div className="mt-4 hidden overflow-hidden rounded-lg border border-gray-200 bg-white md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-start text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.length === items.length && items.length > 0}
                    onChange={toggleAll}
                    className="rounded border-gray-300"
                  />
                </th>
                <th className="px-4 py-3 font-medium text-gray-700">Title</th>
                <th className="px-4 py-3 font-medium text-gray-700">Type</th>
                <th className="px-4 py-3 font-medium text-gray-700">Status</th>
                <th className="px-4 py-3 font-medium text-gray-700">Author</th>
                <th className="px-4 py-3 font-medium text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(item.id)}
                      onChange={() => toggleSelect(item.id)}
                      className="rounded border-gray-300"
                    />
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900">{item.title}</td>
                  <td className="px-4 py-3 text-gray-500">{item.type}</td>
                  <td className="px-4 py-3">
                    <ContentStatusBadge status={item.status} />
                    {item.publish_at && (
                      <span
                        className={`ms-1 text-xs ${item.status === "scheduled" ? "text-indigo-500" : "text-gray-400"}`}
                        title={new Date(item.publish_at).toLocaleString()}
                      >
                        {item.status !== "scheduled" && "📅 "}
                        {new Date(item.publish_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{item.author ?? "—"}</td>
                  <td className="flex gap-2 px-4 py-3">
                    <Link
                      href={`/admin/content/${item.id}`}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      Edit
                    </Link>
                    <button
                      onClick={() => handleClone(item.id, item.title)}
                      disabled={cloningId === item.id}
                      className="text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50"
                    >
                      {cloningId === item.id ? "Cloning…" : "Clone"}
                    </button>
                    <ContentDeleteButton id={item.id} title={item.title} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
