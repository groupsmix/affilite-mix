// Adapted from https://github.com/Qualiora/shadboard (MIT).
"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { fetchWithCsrf } from "@/lib/fetch-csrf";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type TokenScope = "all" | "site";

interface Token {
  id: string;
  name: string;
  site_id: string | null;
  expires_at: string;
  created_at: string;
  last_used_at?: string | null;
  is_active?: boolean;
}

interface ApiTokensResponse {
  tokens: Token[];
}

interface CreateTokenResponse {
  token: Token;
  plain_token: string;
}

interface ApiEndpoint {
  method: string;
  path: string;
  description: string;
}

interface ApiGroup {
  title: string;
  auth: string;
  endpoints: ApiEndpoint[];
}

// Structured, hard-coded reference so an owner (or their AI assistant) can see
// the base URL and every endpoint without hunting through the codebase.
const API_GROUPS: ApiGroup[] = [
  {
    title: "Admin API",
    auth: "Exchange the token at POST /api/auth/token-login to get a session cookie, then call these with that cookie.",
    endpoints: [
      {
        method: "POST",
        path: "/api/auth/token-login",
        description: "Exchange token → session cookie",
      },
      {
        method: "GET · PUT · POST",
        path: "/api/admin/presentations",
        description: "Header/footer design (draft, publish, rollback)",
      },
      { method: "GET · POST", path: "/api/admin/content", description: "Articles & content" },
      { method: "GET · POST", path: "/api/admin/ads", description: "Ad placements" },
      { method: "GET · POST", path: "/api/admin/products", description: "Products & offers" },
      { method: "GET · POST", path: "/api/admin/categories", description: "Categories" },
      { method: "GET", path: "/api/admin/analytics", description: "Site analytics" },
      { method: "GET · POST", path: "/api/admin/api-tokens", description: "Manage API tokens" },
      { method: "GET", path: "/api/admin/sites", description: "Sites (all-sites tokens only)" },
    ],
  },
  {
    title: "Automation API (safer, read + drafts only)",
    auth: "Send the token directly as an Authorization: Bearer <token> header on every request.",
    endpoints: [
      { method: "GET", path: "/api/automation/v1/health", description: "Health check" },
      { method: "GET", path: "/api/automation/v1/context", description: "Site context" },
      {
        method: "GET",
        path: "/api/automation/v1/analytics/summary",
        description: "Analytics summary",
      },
      { method: "GET", path: "/api/automation/v1/content", description: "Read content" },
      {
        method: "POST",
        path: "/api/automation/v1/content/drafts",
        description: "Create a draft (needs approval)",
      },
      { method: "GET", path: "/api/automation/v1/runs", description: "Automation run history" },
    ],
  },
];

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function ApiTokensCard() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [scope, setScope] = useState<TokenScope>("all");
  const [creating, setCreating] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [activeSite, setActiveSite] = useState<string | null>(null);
  const [baseUrl, setBaseUrl] = useState("");

  useEffect(() => {
    setBaseUrl(window.location.origin);
  }, []);

  async function loadTokens() {
    try {
      const res = await fetchWithCsrf("/api/admin/api-tokens");
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(data.error ?? "Failed to load API tokens");
        return;
      }
      const data = (await res.json()) as ApiTokensResponse;
      setTokens(data.tokens ?? []);
    } catch {
      toast.error("Failed to load API tokens");
    } finally {
      setLoading(false);
    }
  }

  async function loadActiveSite() {
    try {
      const res = await fetchWithCsrf("/api/admin/sites/active");
      if (!res.ok) return;
      const data = (await res.json()) as { activeSiteId?: string | null };
      setActiveSite(data.activeSiteId ?? null);
    } catch {
      // best-effort — the scope label just falls back to a generic string
    }
  }

  useEffect(() => {
    void loadTokens();
    void loadActiveSite();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }

    setCreating(true);
    try {
      const res = await fetchWithCsrf("/api/admin/api-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), scope }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(data.error ?? "Failed to create API token");
        return;
      }
      const data = (await res.json()) as CreateTokenResponse;
      setNewToken(data.plain_token);
      setName("");
      toast.success("API token created. Copy it now — it will not be shown again.");
      await loadTokens();
    } catch {
      toast.error("Failed to create API token");
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id: string) {
    try {
      const res = await fetchWithCsrf(`/api/admin/api-tokens/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(data.error ?? "Failed to revoke token");
        return;
      }
      toast.success("Token revoked");
      await loadTokens();
    } catch {
      toast.error("Failed to revoke token");
    }
  }

  function copyToClipboard(text: string) {
    void navigator.clipboard.writeText(text).then(() => toast.success("Copied to clipboard"));
  }

  const siteScopeLabel = activeSite ? `This site only (${activeSite})` : "This site only";

  return (
    <Card>
      <CardHeader>
        <CardTitle>API Access Tokens</CardTitle>
        <CardDescription>
          Generate long-lived tokens for Devin or other automation tools. Choose whether a token can
          manage all your sites or just one. Tokens are shown once on creation and can be revoked at
          any time.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {newToken ? (
          <div className="space-y-3 rounded-md border border-amber-500/50 bg-amber-500/10 p-4">
            <p className="text-sm font-medium text-amber-900">
              Copy this token now — it will not be shown again.
            </p>
            <div className="flex items-center gap-2">
              <Input value={newToken} readOnly className="font-mono" />
              <Button type="button" variant="outline" onClick={() => copyToClipboard(newToken)}>
                Copy
              </Button>
            </div>
            <Button type="button" variant="outline" onClick={() => setNewToken(null)}>
              Done
            </Button>
          </div>
        ) : null}

        <form
          onSubmit={(e) => void handleCreate(e)}
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
        >
          <div className="flex-1 space-y-2">
            <Label htmlFor="token-name">Token name</Label>
            <Input
              id="token-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. AI assistant access"
              maxLength={128}
            />
          </div>
          <div className="space-y-2 sm:w-64">
            <Label htmlFor="token-scope">Access</Label>
            <Select value={scope} onValueChange={(v) => setScope(v as TokenScope)}>
              <SelectTrigger id="token-scope">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sites (full access)</SelectItem>
                <SelectItem value="site">{siteScopeLabel}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={creating || !name.trim()}>
            {creating ? "Creating..." : "Generate token"}
          </Button>
        </form>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading tokens...</p>
        ) : tokens.length === 0 ? (
          <p className="text-sm text-muted-foreground">No API tokens yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Access</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tokens.map((token) => (
                <TableRow key={token.id}>
                  <TableCell>{token.name}</TableCell>
                  <TableCell>
                    {token.site_id ? (
                      <Badge variant="secondary">Single site</Badge>
                    ) : (
                      <Badge>All sites</Badge>
                    )}
                  </TableCell>
                  <TableCell>{formatDate(token.created_at)}</TableCell>
                  <TableCell>{formatDate(token.expires_at)}</TableCell>
                  <TableCell>
                    {token.last_used_at ? formatDate(token.last_used_at) : "Never"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void handleRevoke(token.id)}
                      disabled={token.is_active === false}
                    >
                      Revoke
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <Separator />

        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">API reference</h3>
            <p className="text-sm text-muted-foreground">
              Hand this to your AI assistant so it knows where to send requests.
            </p>
          </div>

          <div className="space-y-1">
            <Label>Base URL</Label>
            <div className="flex items-center gap-2">
              <Input value={baseUrl} readOnly className="font-mono" />
              <Button
                type="button"
                variant="outline"
                onClick={() => copyToClipboard(baseUrl)}
                disabled={!baseUrl}
              >
                Copy
              </Button>
            </div>
          </div>

          {API_GROUPS.map((group) => (
            <div key={group.title} className="space-y-2 rounded-md border p-3">
              <div>
                <p className="text-sm font-medium text-foreground">{group.title}</p>
                <p className="text-xs text-muted-foreground">{group.auth}</p>
              </div>
              <ul className="space-y-1">
                {group.endpoints.map((ep) => {
                  const full = `${baseUrl}${ep.path}`;
                  return (
                    <li key={ep.path} className="flex items-center justify-between gap-2 text-sm">
                      <div className="min-w-0">
                        <code className="break-all font-mono text-xs">
                          <span className="text-muted-foreground">{ep.method}</span> {ep.path}
                        </code>
                        <span className="ml-2 text-xs text-muted-foreground">{ep.description}</span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(full)}
                        disabled={!baseUrl}
                      >
                        Copy
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
