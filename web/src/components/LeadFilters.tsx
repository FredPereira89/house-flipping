"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export const SORT_OPTIONS = [
  { value: "discount", label: "Discount % (best first)" },
  { value: "newest", label: "Newest first" },
  { value: "price", label: "Price (lowest first)" },
  { value: "pricePerSqm", label: "€/m² (lowest first)" },
] as const;

export const LIMIT_OPTIONS = [
  { value: "36", label: "36 per page" },
  { value: "72", label: "72 per page" },
  { value: "144", label: "144 per page" },
  { value: "all", label: "All leads" },
] as const;

export type LeadSort = (typeof SORT_OPTIONS)[number]["value"];
export type ViewMode = "grid" | "table";

const DEBOUNCE_MS = 350;

/**
 * Controls read/write the URL's search params rather than local component
 * state, so a filtered/sorted/paginated view stays shareable and survives a refresh.
 */
export default function LeadFilters({
  areas,
  currentView = "grid",
}: {
  areas: { id: string; name: string }[];
  currentView?: ViewMode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const [minDiscount, setMinDiscount] = useState(
    searchParams.get("minDiscount") ?? "",
  );
  const [area, setArea] = useState(searchParams.get("area") ?? "");
  const [sort, setSort] = useState(searchParams.get("sort") ?? "discount");
  const [limit, setLimit] = useState(searchParams.get("limit") ?? "36");
  const [view, setView] = useState<ViewMode>(
    (searchParams.get("view") as ViewMode) || currentView
  );

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateParam = useCallback(
    (key: string, value: string, resetPage = true) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value && value !== "default") {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      if (resetPage && key !== "page") {
        params.delete("page");
      }
      startTransition(() => {
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      });
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

  const handleViewChange = (newView: ViewMode) => {
    setView(newView);
    const params = new URLSearchParams(searchParams.toString());
    if (newView === "grid") {
      params.delete("view");
    } else {
      params.set("view", newView);
    }
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    });
  };

  const hasActiveFilters =
    searchParams.get("q") ||
    searchParams.get("minDiscount") ||
    searchParams.get("area");

  return (
    <div className="lead-filters-wrapper">
      {isPending && <div className="lead-filters__loading-bar" role="progressbar" aria-label="Loading results" />}
      
      <div className={`lead-filters${isPending ? " lead-filters--pending" : ""}`} role="search" aria-label="Filter and sort leads">
        <div className="lead-filters__field lead-filters__field--search">
          <label htmlFor="lead-search">
            <span>Search</span>
            <kbd className="lead-filters__kbd-hint" title="Press / to focus search">/</kbd>
          </label>
          <div className="lead-filters__input-wrap">
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

        <div className="lead-filters__field lead-filters__field--limit">
          <label htmlFor="lead-limit">Page size</label>
          <select
            id="lead-limit"
            value={limit}
            onChange={(e) => {
              setLimit(e.target.value);
              updateParam("limit", e.target.value);
            }}
          >
            {LIMIT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="lead-filters__controls-right">
          <div className="view-toggle" role="group" aria-label="View mode">
            <button
              type="button"
              className={`view-toggle__btn${view === "grid" ? " view-toggle__btn--active" : ""}`}
              onClick={() => handleViewChange("grid")}
              title="Grid view (Cards)"
              aria-label="Grid view"
              aria-pressed={view === "grid"}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <rect x="3" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="14" width="7" height="7" rx="1.5" />
                <rect x="3" y="14" width="7" height="7" rx="1.5" />
              </svg>
            </button>
            <button
              type="button"
              className={`view-toggle__btn${view === "table" ? " view-toggle__btn--active" : ""}`}
              onClick={() => handleViewChange("table")}
              title="Dense Table view"
              aria-label="Dense Table view"
              aria-pressed={view === "table"}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M3 6h18M3 12h18M3 18h18" />
              </svg>
            </button>
          </div>

          <button
            type="button"
            className="button lead-filters__clear"
            style={{ visibility: hasActiveFilters ? "visible" : "hidden" }}
            onClick={() => {
              setQ("");
              setMinDiscount("");
              setArea("");
              setSort("discount");
              const params = new URLSearchParams(searchParams.toString());
              params.delete("q");
              params.delete("minDiscount");
              params.delete("area");
              params.delete("page");
              startTransition(() => {
                router.replace(`${pathname}?${params.toString()}`, { scroll: false });
              });
            }}
          >
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}
