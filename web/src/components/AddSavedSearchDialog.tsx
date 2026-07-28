"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

const PORTALS = ["idealista", "imovirtual", "olx"] as const;

/**
 * "Add new search" modal, built on the native `<dialog>` element per the
 * plan (no modal library, matching the Popover-based pattern established
 * for the triage assignment flow in Task 2). `showModal()`/`close()` give
 * us focus-trapping and Escape-to-dismiss for free; the `onClick` handler
 * below adds click-outside-to-dismiss by checking whether the click landed
 * on the `<dialog>` element itself (the `::backdrop` area) rather than one
 * of its children — the same effect newer browsers give natively via the
 * `closedby="any"` attribute, done in a way that works everywhere today.
 */
export default function AddSavedSearchDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPending, startTransition] = useTransition();

  function openDialog() {
    setError(null);
    dialogRef.current?.showModal();
  }

  function closeDialog() {
    dialogRef.current?.close();
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const form = event.currentTarget;
    const data = new FormData(form);
    const body = {
      portal: String(data.get("portal") ?? ""),
      url: String(data.get("url") ?? ""),
      label: String(data.get("label") ?? "").trim() || undefined,
      schedule: String(data.get("schedule") ?? "").trim() || undefined,
    };

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/admin/searches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setError(
          typeof payload?.error === "string"
            ? payload.error
            : "Failed to add saved search.",
        );
        return;
      }

      form.reset();
      closeDialog();
      startTransition(() => {
        router.refresh();
      });
    } catch {
      setError(
        "Failed to add saved search. Check your connection and try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        id="open-add-search"
        className="button button--primary"
        onClick={openDialog}
      >
        Add new search
      </button>

      <dialog
        ref={dialogRef}
        id="add-search-dialog"
        className="modal"
        onClick={(event) => {
          if (event.target === dialogRef.current) {
            closeDialog();
          }
        }}
      >
        <form onSubmit={handleSubmit} className="modal__form">
          <h2>Add new search</h2>

          <div className="modal__field">
            <label htmlFor="search-portal">Portal</label>
            <select
              id="search-portal"
              name="portal"
              defaultValue="idealista"
              required
            >
              {PORTALS.map((portal) => (
                <option key={portal} value={portal}>
                  {portal}
                </option>
              ))}
            </select>
          </div>

          <div className="modal__field">
            <label htmlFor="search-url">Search URL</label>
            <input
              id="search-url"
              name="url"
              type="url"
              required
              placeholder="https://..."
            />
          </div>

          <div className="modal__field">
            <label htmlFor="search-label">Label (optional)</label>
            <input id="search-label" name="label" type="text" />
          </div>

          <div className="modal__field">
            <label htmlFor="search-schedule">Cron schedule (optional)</label>
            <input
              id="search-schedule"
              name="schedule"
              type="text"
              placeholder="0 */6 * * *"
            />
          </div>

          {error && <p className="modal__error">{error}</p>}

          <div className="modal__actions">
            <button type="button" className="button" onClick={closeDialog}>
              Cancel
            </button>
            <button
              type="submit"
              className="button button--primary"
              disabled={isSubmitting || isPending}
            >
              {isSubmitting ? "Adding…" : "Add search"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
