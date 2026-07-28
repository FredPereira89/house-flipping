"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export const SORT_OPTIONS = [
  { value: "discount", label: "Discount % (best first)" },
  { value: "newest", label: "Newest first" },
  { value: "price", label: "Price (lowest first)" },
  { value: "pricePerSqm", label: "€/m² (lowest first)" },
] as const;

export type LeadSort = (typeof SORT_OPTIONS)[number]["value"];

const DEBOUNCE_MS = 350;

/**
 * Controls read/write the URL's search params rather than local component
 * state, so a filtered/sorted view stays shareable and survives a refresh —
 * `page.tsx` (a server component) re-queries Prisma from whatever's in the
 * URL. Text/number inputs are debounced so each keystroke doesn't trigger a
 * navigation; select changes apply immediately since they're discrete.
 */
export default function LeadFilters({
  areas,
}: {
  areas: { id: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const [minDiscount, setMinDiscount] = useState(
    searchParams.get("minDiscount") ?? "",
  );
  const [area, setArea] = useState(searchParams.get("area") ?? "");
  const [sort, setSort] = useState(searchParams.get("sort") ?? "discount");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const updateParamDebounced = useCallback(
    (key: string, value: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => updateParam(key, value), DEBOUNCE_MS);
    },
    [updateParam],
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const hasActiveFilters =
    searchParams.get("q") ||
    searchParams.get("minDiscount") ||
    searchParams.get("area");

  return (
    <div className="lead-filters" role="search" aria-label="Filter and sort leads">
      <div className="lead-filters__field">
        <label htmlFor="lead-search">Search</label>
        <input
          id="lead-search"
          type="search"
          placeholder="Location, description…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            updateParamDebounced("q", e.target.value);
          }}
        />
      </div>

      <div className="lead-filters__field">
        <label htmlFor="lead-min-discount">Min. discount %</label>
        <input
          id="lead-min-discount"
          type="number"
          inputMode="decimal"
          min={0}
          max={100}
          step={1}
          placeholder="Any"
          value={minDiscount}
          onChange={(e) => {
            setMinDiscount(e.target.value);
            updateParamDebounced("minDiscount", e.target.value);
          }}
        />
      </div>

      <div className="lead-filters__field">
        <label htmlFor="lead-area">Area</label>
        <select
          id="lead-area"
          value={area}
          onChange={(e) => {
            setArea(e.target.value);
            updateParam("area", e.target.value);
          }}
        >
          <option value="">All areas</option>
          {areas.map((area) => (
            <option key={area.id} value={area.id}>
              {area.name}
            </option>
          ))}
        </select>
      </div>

      <div className="lead-filters__field">
        <label htmlFor="lead-sort">Sort by</label>
        <select
          id="lead-sort"
          value={sort}
          onChange={(e) => {
            setSort(e.target.value);
            updateParam("sort", e.target.value);
          }}
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {hasActiveFilters && (
        <button
          type="button"
          className="button lead-filters__clear"
          onClick={() => {
            setQ("");
            setMinDiscount("");
            setArea("");
            setSort("discount");
            router.replace(pathname, { scroll: false });
          }}
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
