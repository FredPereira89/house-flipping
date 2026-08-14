"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function LeadDetailNav({
  prevLeadId,
  nextLeadId,
  leadId,
}: {
  prevLeadId?: string | null;
  nextLeadId?: string | null;
  leadId?: string;
}) {
  const router = useRouter();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (activeTag === "input" || activeTag === "select" || activeTag === "textarea") {
        return;
      }

      if (e.key === "[" && prevLeadId) {
        e.preventDefault();
        router.push(`/leads/${prevLeadId}`);
      } else if (e.key === "]" && nextLeadId) {
        e.preventDefault();
        router.push(`/leads/${nextLeadId}`);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [prevLeadId, nextLeadId, router]);

  return (
    <div className="lead-nav-bar">
      <Link href="/" className="lead-nav-bar__back">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        <span>Back to leads</span>
      </Link>

      <div className="lead-nav-bar__paging">
        {prevLeadId ? (
          <Link
            href={`/leads/${prevLeadId}`}
            className="lead-nav-bar__btn"
            title="Previous lead ( [ )"
            aria-label="Previous lead"
          >
            <span>← Previous</span>
            <kbd className="lead-nav-bar__kbd">[</kbd>
          </Link>
        ) : (
          <span className="lead-nav-bar__btn lead-nav-bar__btn--disabled">
            <span>← Previous</span>
          </span>
        )}

        {nextLeadId ? (
          <Link
            href={`/leads/${nextLeadId}`}
            className="lead-nav-bar__btn"
            title="Next lead ( ] )"
            aria-label="Next lead"
          >
            <span>Next →</span>
            <kbd className="lead-nav-bar__kbd">]</kbd>
          </Link>
        ) : (
          <span className="lead-nav-bar__btn lead-nav-bar__btn--disabled">
            <span>Next →</span>
          </span>
        )}
      </div>
    </div>
  );
}
