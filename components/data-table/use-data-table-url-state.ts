// Adapted from https://github.com/openstatusHQ/data-table-filters (MIT).
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ColumnFiltersState, PaginationState, SortingState } from "@tanstack/react-table";

interface UseDataTableUrlStateOptions {
  prefix?: string;
  defaultPageSize?: number;
}

function prefixKey(prefix: string, key: string) {
  return prefix ? `${prefix}.${key}` : key;
}

export function useDataTableUrlState({
  prefix = "",
  defaultPageSize = 20,
}: UseDataTableUrlStateOptions = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const searchKey = prefixKey(prefix, "q");
  const sortKey = prefixKey(prefix, "sort");
  const pageKey = prefixKey(prefix, "page");
  const sizeKey = prefixKey(prefix, "size");
  const filterPrefix = prefixKey(prefix, "f");

  // --- Parse URL state ---

  const urlSearch = searchParams.get(searchKey) ?? "";
  const urlSort = searchParams.get(sortKey) ?? "";
  const urlPage = parseInt(searchParams.get(pageKey) ?? "1", 10) || 1;
  const urlSize =
    parseInt(searchParams.get(sizeKey) ?? String(defaultPageSize), 10) ||
    defaultPageSize;

  const sorting: SortingState = useMemo(() => {
    if (!urlSort) return [];
    const [id, direction] = urlSort.split(":");
    if (!id) return [];
    return [{ id, desc: direction === "desc" }];
  }, [urlSort]);

  const columnFilters: ColumnFiltersState = useMemo(() => {
    const filters: ColumnFiltersState = [];
    searchParams.forEach((value, key) => {
      const fp = `${filterPrefix}.`;
      if (key.startsWith(fp)) {
        const colId = key.slice(fp.length);
        filters.push({ id: colId, value: value.split(",") });
      }
    });
    return filters;
  }, [searchParams, filterPrefix]);

  const pagination: PaginationState = useMemo(
    () => ({ pageIndex: urlPage - 1, pageSize: urlSize }),
    [urlPage, urlSize],
  );

  // --- Debounced search ---

  const [searchValue, setSearchValue] = useState(urlSearch);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setSearchValue(urlSearch);
  }, [urlSearch]);

  // --- Write URL state ---

  const buildParams = useCallback(
    (overrides: {
      search?: string;
      sort?: SortingState;
      filters?: ColumnFiltersState;
      page?: PaginationState;
    }) => {
      const params = new URLSearchParams(searchParams.toString());

      // Search
      const search = overrides.search ?? searchValue;
      if (search) {
        params.set(searchKey, search);
      } else {
        params.delete(searchKey);
      }

      // Sorting
      const s = overrides.sort ?? sorting;
      if (s.length > 0 && s[0]) {
        params.set(sortKey, `${s[0].id}:${s[0].desc ? "desc" : "asc"}`);
      } else {
        params.delete(sortKey);
      }

      // Filters — clear all existing filter keys first
      const keysToDelete: string[] = [];
      params.forEach((_v, k) => {
        if (k.startsWith(`${filterPrefix}.`)) keysToDelete.push(k);
      });
      for (const k of keysToDelete) params.delete(k);
      const f = overrides.filters ?? columnFilters;
      for (const filter of f) {
        const val = Array.isArray(filter.value)
          ? (filter.value as string[]).join(",")
          : String(filter.value);
        if (val) {
          params.set(`${filterPrefix}.${filter.id}`, val);
        }
      }

      // Pagination
      const p = overrides.page ?? pagination;
      if (p.pageIndex > 0) {
        params.set(pageKey, String(p.pageIndex + 1));
      } else {
        params.delete(pageKey);
      }
      if (p.pageSize !== defaultPageSize) {
        params.set(sizeKey, String(p.pageSize));
      } else {
        params.delete(sizeKey);
      }

      return params;
    },
    [
      searchParams,
      searchValue,
      sorting,
      columnFilters,
      pagination,
      searchKey,
      sortKey,
      filterPrefix,
      pageKey,
      sizeKey,
      defaultPageSize,
    ],
  );

  const pushParams = useCallback(
    (params: URLSearchParams) => {
      const qs = params.toString();
      router.push(qs ? `?${qs}` : "?", { scroll: false });
    },
    [router],
  );

  const onSearchChange = useCallback(
    (value: string) => {
      setSearchValue(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        const params = buildParams({
          search: value,
          page: { pageIndex: 0, pageSize: pagination.pageSize },
        });
        pushParams(params);
      }, 250);
    },
    [buildParams, pushParams, pagination.pageSize],
  );

  const onSortingChange = useCallback(
    (updater: SortingState | ((old: SortingState) => SortingState)) => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      const params = buildParams({
        sort: next,
        page: { pageIndex: 0, pageSize: pagination.pageSize },
      });
      pushParams(params);
    },
    [buildParams, pushParams, sorting, pagination.pageSize],
  );

  const onColumnFiltersChange = useCallback(
    (
      updater:
        | ColumnFiltersState
        | ((old: ColumnFiltersState) => ColumnFiltersState),
    ) => {
      const next =
        typeof updater === "function" ? updater(columnFilters) : updater;
      const params = buildParams({
        filters: next,
        page: { pageIndex: 0, pageSize: pagination.pageSize },
      });
      pushParams(params);
    },
    [buildParams, pushParams, columnFilters, pagination.pageSize],
  );

  const onPaginationChange = useCallback(
    (
      updater: PaginationState | ((old: PaginationState) => PaginationState),
    ) => {
      const next =
        typeof updater === "function" ? updater(pagination) : updater;
      const params = buildParams({ page: next });
      pushParams(params);
    },
    [buildParams, pushParams, pagination],
  );

  return {
    search: searchValue,
    onSearchChange,
    sorting,
    onSortingChange,
    columnFilters,
    onColumnFiltersChange,
    pagination,
    onPaginationChange,
  };
}
