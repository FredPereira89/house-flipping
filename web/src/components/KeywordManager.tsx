"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { DisqualifyKeyword } from "@prisma/client";

type Group = { category: string; items: DisqualifyKeyword[] };

/**
 * Add/toggle/remove `DisqualifyKeyword`s for the org, grouped by category.
 * All writes go through `/api/admin/keywords`, which re-derives `orgId`
 * from the session server-side — this component never sends an org id.
 */
export default function KeywordManager({
  keywordsByCategory,
}: {
  keywordsByCategory: Group[];
}) {
  const router = useRouter();
  const [category, setCategory] = useState("");
  const [keyword, setKeyword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function handleAdd(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!category.trim() || !keyword.trim()) return;

    setIsAdding(true);
    try {
      const response = await fetch("/api/admin/keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: category.trim(),
          keyword: keyword.trim(),
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setError(
          typeof payload?.error === "string"
            ? payload.error
            : "Failed to add keyword.",
        );
        return;
      }

      setCategory("");
      setKeyword("");
      startTransition(() => {
        router.refresh();
      });
    } catch {
      setError("Failed to add keyword. Check your connection and try again.");
    } finally {
      setIsAdding(false);
    }
  }

  async function handleToggle(id: string, enabled: boolean) {
    setPendingId(id);
    setError(null);
    try {
      const response = await fetch("/api/admin/keywords", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, enabled }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setError(
          typeof payload?.error === "string"
            ? payload.error
            : "Failed to update keyword.",
        );
        return;
      }
      startTransition(() => {
        router.refresh();
      });
    } catch {
      setError("Failed to update keyword. Check your connection and try again.");
    } finally {
      setPendingId(null);
    }
  }

  async function handleDelete(id: string) {
    setPendingId(id);
    setError(null);
    try {
      const response = await fetch("/api/admin/keywords", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setError(
          typeof payload?.error === "string"
            ? payload.error
            : "Failed to delete keyword.",
        );
        return;
      }
      startTransition(() => {
        router.refresh();
      });
    } catch {
      setError("Failed to delete keyword. Check your connection and try again.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="keyword-manager">
      {keywordsByCategory.length === 0 ? (
        <p className="keyword-manager__empty">
          No disqualify keywords configured yet.
        </p>
      ) : (
        keywordsByCategory.map((group) => (
          <div key={group.category} className="keyword-manager__group">
            <h3 className="keyword-manager__category">{group.category}</h3>
            <ul className="keyword-manager__list">
              {group.items.map((item) => (
                <li key={item.id} className="keyword-manager__item">
                  <label className="keyword-manager__toggle">
                    <input
                      type="checkbox"
                      checked={item.enabled}
                      disabled={pendingId === item.id}
                      onChange={(event) =>
                        handleToggle(item.id, event.target.checked)
                      }
                    />
                    <span
                      className={
                        item.enabled
                          ? undefined
                          : "keyword-manager__keyword--disabled"
                      }
                    >
                      {item.keyword}
                    </span>
                  </label>
                  <button
                    type="button"
                    className="button keyword-manager__delete"
                    disabled={pendingId === item.id}
                    onClick={() => handleDelete(item.id)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}

      <form onSubmit={handleAdd} className="keyword-manager__add-form">
        <input
          id="keyword-add-category"
          type="text"
          placeholder="Category (e.g. structural)"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          required
          aria-label="Keyword category"
        />
        <input
          id="keyword-add-keyword"
          type="text"
          placeholder="Keyword (e.g. ruína)"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          required
          aria-label="Keyword"
        />
        <button
          type="submit"
          className="button button--primary"
          disabled={isAdding}
        >
          {isAdding ? "Adding…" : "Add keyword"}
        </button>
      </form>

      {error && <p className="keyword-manager__error">{error}</p>}
    </div>
  );
}
