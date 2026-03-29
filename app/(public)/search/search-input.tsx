"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";

interface SearchInputProps {
  placeholder: string;
  buttonLabel: string;
}

export function SearchInput({ placeholder, buttonLabel }: SearchInputProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") ?? "";
  const [value, setValue] = useState(initialQuery);
  const [isPending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 2) return;

    debounceRef.current = setTimeout(() => {
      startTransition(() => {
        router.replace(`/search?q=${encodeURIComponent(value.trim())}`, { scroll: false });
      });
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, router]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (value.trim().length >= 2) {
      startTransition(() => {
        router.replace(`/search?q=${encodeURIComponent(value.trim())}`);
      });
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type="search"
            name="q"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-1"
            style={{ "--tw-ring-color": "var(--color-accent, #10B981)" } as React.CSSProperties}
          />
          {isPending && (
            <div className="absolute inset-y-0 end-3 flex items-center">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
            </div>
          )}
        </div>
        <button
          type="submit"
          className="rounded-lg px-5 py-2.5 text-sm font-medium text-white transition-colors hover:opacity-90"
          style={{ backgroundColor: "var(--color-accent, #10B981)" }}
        >
          {buttonLabel}
        </button>
      </div>
    </form>
  );
}
