"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function DeleteLeadButton({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    if (!window.confirm("Are you sure you want to delete this lead? This cannot be undone.")) {
      return;
    }

    setIsDeleting(true);

    try {
      const response = await fetch(`/api/leads/${leadId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete lead");
      }

      router.push("/");
      router.refresh();
    } catch (error) {
      console.error(error);
      alert("An error occurred while deleting the lead. Please try again.");
      setIsDeleting(false);
    }
  }

  return (
    <button
      type="button"
      className="button button--danger"
      onClick={handleDelete}
      disabled={isDeleting}
      title="Delete lead"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 6h18" />
        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
        <line x1="10" x2="10" y1="11" y2="17" />
        <line x1="14" x2="14" y1="11" y2="17" />
      </svg>
      {isDeleting ? "Deleting..." : "Delete"}
    </button>
  );
}
