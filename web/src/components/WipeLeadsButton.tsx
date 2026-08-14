"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function WipeLeadsButton() {
  const router = useRouter();
  const [isWiping, setIsWiping] = useState(false);

  async function handleWipe() {
    if (!window.confirm("WARNING: Are you absolutely sure you want to wipe ALL leads? This action is permanent and cannot be undone.")) {
      return;
    }

    setIsWiping(true);

    try {
      const response = await fetch("/api/leads/wipe", {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to wipe leads");
      }

      router.refresh();
    } catch (error) {
      console.error(error);
      alert("An error occurred while wiping leads. Please try again.");
    } finally {
      setIsWiping(false);
    }
  }

  return (
    <button
      type="button"
      className="button button--danger"
      onClick={handleWipe}
      disabled={isWiping}
      title="Wipe all leads"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 6h18" />
        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
        <line x1="10" x2="10" y1="11" y2="17" />
        <line x1="14" x2="14" y1="11" y2="17" />
      </svg>
      {isWiping ? "Wiping Database..." : "Wipe All Leads"}
    </button>
  );
}
