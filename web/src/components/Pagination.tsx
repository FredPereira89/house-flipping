"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

export default function Pagination({
  currentPage,
  totalPages,
  totalCount,
  pageSize,
}: {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (totalPages <= 1) return null;

  function createPageUrl(pageNumber: number): string {
    const params = new URLSearchParams(searchParams.toString());
    if (pageNumber <= 1) {
      params.delete("page");
    } else {
      params.set("page", pageNumber.toString());
    }
    return `${pathname}?${params.toString()}`;
  }

  // Generate visible page numbers (sliding window around current page)
  const delta = 2;
  const range: (number | string)[] = [];
  const rangeWithDots: (number | string)[] = [];

  for (
    let i = Math.max(2, currentPage - delta);
    i <= Math.min(totalPages - 1, currentPage + delta);
    i++
  ) {
    range.push(i);
  }

  if (currentPage - delta > 2) {
    rangeWithDots.push(1, "…");
  } else {
    rangeWithDots.push(1);
  }

  rangeWithDots.push(...range);

  if (currentPage + delta < totalPages - 1) {
    rangeWithDots.push("…", totalPages);
  } else if (totalPages > 1) {
    rangeWithDots.push(totalPages);
  }

  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalCount);

  return (
    <nav
      className="pagination"
      role="navigation"
      aria-label="Leads list pagination"
    >
      <div className="pagination__info">
        Showing <strong>{startItem}–{endItem}</strong> of <strong>{totalCount}</strong> leads
      </div>

      <div className="pagination__controls">
        {currentPage > 1 ? (
          <Link
            href={createPageUrl(currentPage - 1)}
            className="button button--subtle pagination__btn"
            aria-label="Previous page"
          >
            ← Previous
          </Link>
        ) : (
          <button
            type="button"
            className="button button--subtle pagination__btn"
            disabled
            aria-label="Previous page (disabled)"
          >
            ← Previous
          </button>
        )}

        <div className="pagination__pages">
          {rangeWithDots.map((item, idx) => {
            if (typeof item === "string") {
              return (
                <span key={`dots-${idx}`} className="pagination__ellipsis">
                  {item}
                </span>
              );
            }

            const isCurrent = item === currentPage;
            return (
              <Link
                key={item}
                href={createPageUrl(item)}
                className={`pagination__page-link${isCurrent ? " pagination__page-link--active" : ""}`}
                aria-current={isCurrent ? "page" : undefined}
                aria-label={`Page ${item}`}
              >
                {item}
              </Link>
            );
          })}
        </div>

        {currentPage < totalPages ? (
          <Link
            href={createPageUrl(currentPage + 1)}
            className="button button--subtle pagination__btn"
            aria-label="Next page"
          >
            Next →
          </Link>
        ) : (
          <button
            type="button"
            className="button button--subtle pagination__btn"
            disabled
            aria-label="Next page (disabled)"
          >
            Next →
          </button>
        )}
      </div>
    </nav>
  );
}
