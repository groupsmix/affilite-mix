"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { StickySaveBar, useDirtyTracking, useSaveShortcut } from "@/components/admin/forms";
import { fetchWithCsrf } from "@/lib/fetch-csrf";
import type { CategoryRow } from "@/types/database";
import type { AIContentType } from "@/lib/ai/content-generator";
import type { AutomationPolicyRow } from "@/lib/dal/automation-policies";
import { toast } from "sonner";

const FORM_ID = "automation-schedule-form";

type Frequency = "daily" | "weekly" | "monthly";
type FormContentType = AIContentType | "blog";

interface ScheduleFormState {
  category_id: string | null;
  content_type: FormContentType;
  frequency: Frequency;
  max_per_day: number;
  auto_approve: boolean;
  is_active: boolean;
}

interface AutomationScheduleFormProps {
  categories: CategoryRow[];
  existingPolicy: AutomationPolicyRow | null;
}

const CONTENT_TYPES: { value: FormContentType; label: string }[] = [
  { value: "article", label: "Article" },
  { value: "review", label: "Review" },
  { value: "comparison", label: "Comparison" },
  { value: "guide", label: "Guide" },
  { value: "blog", label: "Blog" },
];

const FREQUENCIES: { value: Frequency; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

const VALID_CONTENT_TYPE_VALUES = new Set<FormContentType>([
  "article",
  "review",
  "comparison",
  "guide",
  "blog",
]);
const VALID_FREQUENCY_VALUES = new Set<Frequency>(["daily", "weekly", "monthly"]);

function toFormState(policy: AutomationScheduleFormProps["existingPolicy"]): ScheduleFormState {
  const c = policy?.constraints ?? {};
  const rawContentType = typeof c.content_type === "string" ? c.content_type : "article";
  const rawFrequency = typeof c.frequency === "string" ? c.frequency : "daily";
  const rawMaxPerDay = typeof c.max_per_day === "number" ? c.max_per_day : 3;
  const rawCategoryId = typeof c.category_id === "string" ? c.category_id : null;

  return {
    category_id: rawCategoryId,
    content_type: VALID_CONTENT_TYPE_VALUES.has(rawContentType as FormContentType)
      ? (rawContentType as FormContentType)
      : "article",
    frequency: VALID_FREQUENCY_VALUES.has(rawFrequency as Frequency)
      ? (rawFrequency as Frequency)
      : "daily",
    max_per_day: Number.isFinite(rawMaxPerDay) && rawMaxPerDay >= 1 ? rawMaxPerDay : 3,
    auto_approve: policy?.mode === "allow",
    is_active: policy?.is_active ?? true,
  };
}

function validate(state: ScheduleFormState): Partial<Record<keyof ScheduleFormState, string>> {
  const errors: Partial<Record<keyof ScheduleFormState, string>> = {};
  if (state.max_per_day < 1) errors.max_per_day = "At least 1 article per run is required";
  if (state.max_per_day > 100) errors.max_per_day = "Cannot exceed 100 articles per run";
  return errors;
}

export function AutomationScheduleForm({
  categories,
  existingPolicy,
}: AutomationScheduleFormProps) {
  const router = useRouter();
  const [state, setState] = useState<ScheduleFormState>(() => toFormState(existingPolicy));
  const [savedState, setSavedState] = useState<ScheduleFormState>(() =>
    toFormState(existingPolicy),
  );
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof ScheduleFormState, string>>>(
    {},
  );
  const [formError, setFormError] = useState("");

  const isDirty = useDirtyTracking(state, savedState);

  const hasValidationErrors = useMemo(() => Object.keys(validate(state)).length > 0, [state]);

  function update<K extends keyof ScheduleFormState>(key: K, value: ScheduleFormState[K]) {
    setState((prev) => ({ ...prev, [key]: value }));
    if (fieldErrors[key]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }

  const handleSave = useCallback(async () => {
    const errors = validate(state);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    setFormError("");

    try {
      const res = await fetchWithCsrf("/api/admin/automation/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category_id: state.category_id,
          content_type: state.content_type,
          frequency: state.frequency,
          max_per_day: state.max_per_day,
          auto_approve: state.auto_approve,
          is_active: state.is_active,
        }),
      });

      const data = (await res.json()) as { error?: string; details?: Record<string, string> };
      if (!res.ok) {
        const msg = data.error ?? "Failed to save schedule";
        setFormError(msg);
        toast.error(msg);
        return;
      }

      setSavedState(state);
      toast.success("Automation schedule saved");
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save schedule";
      setFormError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }, [router, state]);

  const triggerSave = useCallback(() => {
    void handleSave();
  }, [handleSave]);

  useSaveShortcut(triggerSave, !isDirty || saving || hasValidationErrors);

  const handleCancel = useCallback(() => {
    setState(savedState);
    setFieldErrors({});
    setFormError("");
  }, [savedState]);

  return (
    <>
      <form
        id={FORM_ID}
        onSubmit={(e) => {
          e.preventDefault();
          void handleSave();
        }}
        className="space-y-6"
      >
        <Card>
          <CardHeader>
            <CardTitle>Content schedule</CardTitle>
            <CardDescription>
              Tell the daily cron how much content to produce and which category to focus on.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="content_type">Content type</Label>
              <Select
                value={state.content_type}
                onValueChange={(value) => update("content_type", value as FormContentType)}
              >
                <SelectTrigger id="content_type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTENT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="category_id">Category (optional)</Label>
              <Select
                value={state.category_id ?? "__none__"}
                onValueChange={(value) =>
                  update("category_id", value === "__none__" ? null : value)
                }
              >
                <SelectTrigger id="category_id">
                  <SelectValue placeholder="Any / site-wide" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Any / site-wide</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="frequency">Frequency</Label>
                <Select
                  value={state.frequency}
                  onValueChange={(value) => update("frequency", value as Frequency)}
                >
                  <SelectTrigger id="frequency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FREQUENCIES.map((f) => (
                      <SelectItem key={f.value} value={f.value}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="max_per_day">Max per day</Label>
                <Input
                  id="max_per_day"
                  type="number"
                  min={1}
                  max={100}
                  value={state.max_per_day}
                  onChange={(e) =>
                    update("max_per_day", Math.max(1, Math.min(100, Number(e.target.value))))
                  }
                  aria-invalid={!!fieldErrors.max_per_day}
                />
                {fieldErrors.max_per_day ? (
                  <p className="text-sm text-destructive">{fieldErrors.max_per_day}</p>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Workflow</CardTitle>
            <CardDescription>
              Auto-approve publishes drafts immediately if they pass content moderation.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label htmlFor="auto_approve" className="text-base">
                  Auto-approve drafts
                </Label>
                <p className="text-sm text-muted-foreground">
                  Skip the review queue and publish after AI generation and moderation.
                </p>
              </div>
              <Switch
                id="auto_approve"
                checked={state.auto_approve}
                onCheckedChange={(checked) => update("auto_approve", checked)}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label htmlFor="is_active" className="text-base">
                  Schedule active
                </Label>
                <p className="text-sm text-muted-foreground">
                  Pause the cron for this site without deleting the configuration.
                </p>
              </div>
              <Switch
                id="is_active"
                checked={state.is_active}
                onCheckedChange={(checked) => update("is_active", checked)}
              />
            </div>
          </CardContent>
        </Card>

        {formError ? (
          <p className="text-sm font-medium text-destructive" role="alert">
            {formError}
          </p>
        ) : null}
      </form>

      <StickySaveBar
        formId={FORM_ID}
        isDirty={isDirty}
        saving={saving}
        disabled={hasValidationErrors}
        onCancel={handleCancel}
      />
    </>
  );
}
