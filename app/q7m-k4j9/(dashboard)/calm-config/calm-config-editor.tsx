"use client";

import { useEffect, useState } from "react";
import { fetchWithCsrf } from "@/lib/fetch-csrf";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface CalmConfigEditorProps {
  siteName: string | null;
}

export function CalmConfigEditor({ siteName }: CalmConfigEditorProps) {
  const [json, setJson] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  useEffect(() => {
    fetchWithCsrf("/api/admin/calm-config")
      .then(async (res) => {
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }
        const data = (await res.json()) as unknown;
        setJson(JSON.stringify(data, null, 2));
      })
      .catch((err) => {
        toast.error(`Failed to load config: ${err instanceof Error ? err.message : String(err)}`);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setParseError(null);
    let config: unknown;
    try {
      config = JSON.parse(json);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Invalid JSON");
      toast.error("Invalid JSON — fix the error before saving");
      return;
    }

    setSaving(true);
    try {
      const res = await fetchWithCsrf("/api/admin/calm-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const saved = (await res.json()) as unknown;
      setJson(JSON.stringify(saved, null, 2));
      toast.success("Calmroutine config saved");
    } catch (err) {
      toast.error(`Failed to save: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Calmroutine Site Config</CardTitle>
        <CardDescription>
          Edit the JSON configuration for the {siteName ?? "current site"} calmroutine tenant.
          Posts, products, categories, author bio, and badges are all controlled here. Upload images
          in the Media Library and paste the URLs here.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="calm-config">Configuration JSON</Label>
          <Textarea
            id="calm-config"
            value={json}
            onChange={(e) => setJson(e.target.value)}
            disabled={loading}
            rows={24}
            className="font-mono text-xs"
          />
          {parseError && <p className="text-sm text-red-500">{parseError}</p>}
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={() => void handleSave()} disabled={loading || saving}>
            {saving ? "Saving..." : "Save calm config"}
          </Button>
          {loading && <span className="text-sm text-muted-foreground">Loading...</span>}
        </div>
      </CardContent>
    </Card>
  );
}
