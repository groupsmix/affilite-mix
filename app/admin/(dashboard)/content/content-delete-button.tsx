"use client";

import { useRouter } from "next/navigation";

export function ContentDeleteButton({ id, title }: { id: string; title: string }) {
  const router = useRouter();

  async function handleDelete() {
    if (!confirm(`Delete "${title}"?`)) return;
    const res = await fetch(`/api/admin/content?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      router.refresh();
    } else {
      alert("Failed to delete content");
    }
  }

  return (
    <button
      onClick={handleDelete}
      className="text-sm text-red-600 hover:underline"
    >
      Delete
    </button>
  );
}
