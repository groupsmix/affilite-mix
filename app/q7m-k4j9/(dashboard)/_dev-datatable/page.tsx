// Adapted from https://github.com/openstatusHQ/data-table-filters (MIT).
// Dev-only demo route — gated behind NODE_ENV !== "production".
import { notFound } from "next/navigation";
import { DevDataTableDemo } from "./demo";

export default function DevDataTablePage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return (
    <div className="mx-auto max-w-5xl py-6">
      <h1 className="mb-6 text-2xl font-bold">DataTable Demo (dev only)</h1>
      <DevDataTableDemo />
    </div>
  );
}
