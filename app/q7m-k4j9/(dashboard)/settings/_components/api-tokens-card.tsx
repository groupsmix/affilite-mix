// Adapted from https://github.com/Qualiora/shadboard (MIT).
"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { fetchWithCsrf } from "@/lib/fetch-csrf";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
  const [creating, setCreating] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);

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

  useEffect(() => {
    void loadTokens();
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
        body: JSON.stringify({ name: name.trim() }),
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>API Access Tokens</CardTitle>
        <CardDescription>
          Generate long-lived tokens for Devin or other automation tools. Tokens are shown once on
          creation and can be revoked at any time.
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

        <form onSubmit={(e) => void handleCreate(e)} className="flex items-end gap-2">
          <div className="flex-1 space-y-2">
            <Label htmlFor="token-name">Token name</Label>
            <Input
              id="token-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Devin dashboard access"
              maxLength={128}
            />
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
      </CardContent>
    </Card>
  );
}
