"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function LeadKeyboardController({
  totalLeads,
}: {
  totalLeads: number;
}) {
  const router = useRouter();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't intercept if user is typing in an input or select
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (activeTag === "input" || activeTag === "select" || activeTag === "textarea") {
        if (e.key === "Escape") {
          (document.activeElement as HTMLElement).blur();
        }
        return;
      }

      if (e.key === "/") {
        e.preventDefault();
        const searchInput = document.getElementById("lead-search");
        if (searchInput) {
          searchInput.focus();
        }
        return;
      }

      if (e.key === "?") {
        e.preventDefault();
        setShowHelp((prev) => !prev);
        return;
      }

      if (e.key === "Escape") {
        if (showHelp) {
          setShowHelp(false);
          return;
        }
        setSelectedIndex(null);
        removeHighlight();
        return;
      }

      if (totalLeads === 0) return;

      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => {
          const next = prev === null ? 0 : Math.min(prev + 1, totalLeads - 1);
          highlightIndex(next);
          return next;
        });
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => {
          const next = prev === null ? 0 : Math.max(prev - 1, 0);
          highlightIndex(next);
          return next;
        });
      } else if ((e.key === "Enter" || e.key === "o") && selectedIndex !== null) {
        const selectedEl = document.querySelector(`[data-lead-index="${selectedIndex}"]`);
        const link = selectedEl?.querySelector("a[href^='/leads/']") as HTMLAnchorElement | null;
        if (link) {
          e.preventDefault();
          router.push(link.getAttribute("href")!);
        }
      } else if (e.key === "h" && selectedIndex !== null) {
        const selectedEl = document.querySelector(`[data-lead-index="${selectedIndex}"]`);
        const hotBtn = selectedEl?.querySelector(".lead-action-btn:first-child") as HTMLButtonElement | null;
        if (hotBtn) {
          e.preventDefault();
          hotBtn.click();
        }
      } else if (e.key === "x" && selectedIndex !== null) {
        const selectedEl = document.querySelector(`[data-lead-index="${selectedIndex}"]`);
        const rejectBtn = selectedEl?.querySelector(".lead-action-btn--reject") as HTMLButtonElement | null;
        if (rejectBtn) {
          e.preventDefault();
          rejectBtn.click();
        }
      }
    }

    function highlightIndex(index: number) {
      removeHighlight();
      const target = document.querySelector(`[data-lead-index="${index}"]`) as HTMLElement | null;
      if (target) {
        target.classList.add("lead-keyboard-focused");
        target.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }

    function removeHighlight() {
      document.querySelectorAll(".lead-keyboard-focused").forEach((el) => {
        el.classList.remove("lead-keyboard-focused");
      });
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      removeHighlight();
    };
  }, [selectedIndex, showHelp, totalLeads, router]);

  return (
    <>
      <div className="keyboard-helper-badge" onClick={() => setShowHelp(true)}>
        <kbd className="keyboard-key">?</kbd>
        <span className="keyboard-helper-label">Shortcuts</span>
      </div>

      {showHelp && (
        <div className="modal-backdrop" onClick={() => setShowHelp(false)}>
          <div className="modal modal--shortcuts" onClick={(e) => e.stopPropagation()}>
            <header className="modal__header">
              <h2 style={{ margin: 0, fontSize: "var(--fs-lg)" }}>Keyboard Shortcuts</h2>
              <button
                type="button"
                className="button button--subtle button--icon"
                onClick={() => setShowHelp(false)}
                aria-label="Close shortcuts"
              >
                ✕
              </button>
            </header>
            <div className="shortcuts-list">
              <div className="shortcut-item">
                <span className="shortcut-keys"><kbd>j</kbd> / <kbd>↓</kbd></span>
                <span className="shortcut-desc">Next lead</span>
              </div>
              <div className="shortcut-item">
                <span className="shortcut-keys"><kbd>k</kbd> / <kbd>↑</kbd></span>
                <span className="shortcut-desc">Previous lead</span>
              </div>
              <div className="shortcut-item">
                <span className="shortcut-keys"><kbd>h</kbd></span>
                <span className="shortcut-desc">Toggle Hot lead status</span>
              </div>
              <div className="shortcut-item">
                <span className="shortcut-keys"><kbd>x</kbd></span>
                <span className="shortcut-desc">Reject lead</span>
              </div>
              <div className="shortcut-item">
                <span className="shortcut-keys"><kbd>Enter</kbd> / <kbd>o</kbd></span>
                <span className="shortcut-desc">Open lead details</span>
              </div>
              <div className="shortcut-item">
                <span className="shortcut-keys"><kbd>/</kbd></span>
                <span className="shortcut-desc">Focus search</span>
              </div>
              <div className="shortcut-item">
                <span className="shortcut-keys"><kbd>Esc</kbd></span>
                <span className="shortcut-desc">Clear selection / close dialog</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
