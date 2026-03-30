"use client";

import { useEffect, useState } from "react";
import { fetchWithCsrf } from "@/lib/fetch-csrf";

interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: "admin" | "super_admin";
  is_active: boolean;
  created_at: string;
}

export function UsersClient() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // New user form
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "super_admin">("admin");
  const [formError, setFormError] = useState("");
  const [formSaving, setFormSaving] = useState(false);

  async function fetchUsers() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users");
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to load users");
        return;
      }
      const data = await res.json();
      setUsers(data);
    } catch {
      setError("Failed to load users");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchUsers();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormSaving(true);
    setFormError("");

    const res = await fetchWithCsrf("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name, password, role }),
    });

    if (res.ok) {
      setShowForm(false);
      setEmail("");
      setName("");
      setPassword("");
      setRole("admin");
      fetchUsers();
    } else {
      const data = await res.json();
      setFormError(data.error ?? "Failed to create user");
    }
    setFormSaving(false);
  }

  async function handleToggleActive(user: AdminUser) {
    await fetchWithCsrf("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: user.id, is_active: !user.is_active }),
    });
    fetchUsers();
  }

  async function handleDelete(user: AdminUser) {
    if (!confirm(`Delete admin user ${user.email}? This cannot be undone.`)) {
      return;
    }
    await fetchWithCsrf(`/api/admin/users?id=${user.id}`, { method: "DELETE" });
    fetchUsers();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-gray-500">Loading users...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Admin Users</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage who can access the admin dashboard.
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          {showForm ? "Cancel" : "Add User"}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded bg-yellow-50 p-3 text-sm text-yellow-700">
          {error}
          <p className="mt-1 text-xs">
            If you haven&apos;t run the admin_users migration yet, create the
            table first using <code>supabase/admin-users.sql</code>.
          </p>
        </div>
      )}

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="mb-6 rounded-lg border border-gray-200 bg-white p-4"
        >
          <h2 className="mb-4 text-sm font-semibold text-gray-700">
            New Admin User
          </h2>
          {formError && (
            <div className="mb-3 rounded bg-red-50 p-2 text-sm text-red-600">
              {formError}
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
              <p className="mt-1 text-xs text-gray-400">Minimum 8 characters</p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Role
              </label>
              <select
                value={role}
                onChange={(e) =>
                  setRole(e.target.value as "admin" | "super_admin")
                }
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="admin">Admin</option>
                <option value="super_admin">Super Admin</option>
              </select>
            </div>
          </div>
          <button
            type="submit"
            disabled={formSaving}
            className="mt-4 rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {formSaving ? "Creating..." : "Create User"}
          </button>
        </form>
      )}

      {users.length === 0 && !error ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center">
          <p className="text-sm text-gray-500">
            No admin users yet. Add your first admin user above to enable login.
          </p>
        </div>
      ) : (
        <>
          {/* Card layout on mobile */}
          <div className="grid gap-3 md:hidden">
            {users.map((user) => (
              <div key={user.id} className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-gray-900">{user.email}</p>
                    {user.name && <p className="text-sm text-gray-500">{user.name}</p>}
                  </div>
                  <span
                    className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                      user.is_active
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {user.is_active ? "Active" : "Inactive"}
                  </span>
                </div>
                <div className="mb-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      user.role === "super_admin"
                        ? "bg-purple-100 text-purple-700"
                        : "bg-blue-100 text-blue-700"
                    }`}
                  >
                    {user.role === "super_admin" ? "Super Admin" : "Admin"}
                  </span>
                </div>
                <div className="flex gap-3 text-sm">
                  <button
                    onClick={() => handleToggleActive(user)}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    {user.is_active ? "Deactivate" : "Activate"}
                  </button>
                  <button
                    onClick={() => handleDelete(user)}
                    className="text-red-500 hover:text-red-700"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Table layout on md+ screens */}
          <div className="hidden overflow-hidden rounded-lg border border-gray-200 bg-white md:block">
            <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                    Email
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                    Role
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                    Status
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {users.map((user) => (
                  <tr key={user.id}>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">
                      {user.email}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                      {user.name || "\u2014"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          user.role === "super_admin"
                            ? "bg-purple-100 text-purple-700"
                            : "bg-blue-100 text-blue-700"
                        }`}
                      >
                        {user.role === "super_admin" ? "Super Admin" : "Admin"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          user.is_active
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {user.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm">
                      <button
                        onClick={() => handleToggleActive(user)}
                        className="mr-2 text-gray-500 hover:text-gray-700"
                      >
                        {user.is_active ? "Deactivate" : "Activate"}
                      </button>
                      <button
                        onClick={() => handleDelete(user)}
                        className="text-red-500 hover:text-red-700"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
