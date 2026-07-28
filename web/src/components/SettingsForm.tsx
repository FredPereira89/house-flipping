"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type SettingsValues = {
  discountThresholdPct: number;
  maxPrice: number;
  minTypology: number;
  stalenessThresholdDays: number;
  currency: string;
};

/**
 * The org's driving thresholds. Native HTML constraint validation
 * (`required`/`min`/`max`/`step`/`pattern`) blocks a bad submit before this
 * component's `onSubmit` even fires; the `:user-invalid` rule in
 * globals.css supplies the visual feedback once a field has been
 * interacted with. The server route re-validates everything again — this
 * form's constraints are UX sugar, not the security boundary.
 */
export default function SettingsForm({
  settings,
}: {
  settings: SettingsValues;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(false);

    const data = new FormData(event.currentTarget);
    const body = {
      discountThresholdPct: Number(data.get("discountThresholdPct")),
      maxPrice: Number(data.get("maxPrice")),
      minTypology: Number(data.get("minTypology")),
      stalenessThresholdDays: Number(data.get("stalenessThresholdDays")),
      currency: String(data.get("currency") ?? "").toUpperCase(),
    };

    try {
      const response = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setError(
          typeof payload?.error === "string"
            ? payload.error
            : "Failed to save settings.",
        );
        return;
      }

      setSuccess(true);
      startTransition(() => {
        router.refresh();
      });
    } catch {
      setError("Failed to save settings. Check your connection and try again.");
    }
  }

  return (
    <form
      id="settings-form"
      className="settings-form surface"
      onSubmit={handleSubmit}
    >
      <div className="settings-form__grid">
        <div className="settings-form__field">
          <label htmlFor="settings-discount">Discount threshold (%)</label>
          <input
            id="settings-discount"
            name="discountThresholdPct"
            type="number"
            defaultValue={settings.discountThresholdPct}
            required
            min={0}
            max={100}
            step="0.1"
          />
        </div>

        <div className="settings-form__field">
          <label htmlFor="settings-max-price">Max price</label>
          <input
            id="settings-max-price"
            name="maxPrice"
            type="number"
            defaultValue={settings.maxPrice}
            required
            min={1}
            step="1000"
          />
        </div>

        <div className="settings-form__field">
          <label htmlFor="settings-min-typology">
            Min typology (bedrooms)
          </label>
          <input
            id="settings-min-typology"
            name="minTypology"
            type="number"
            defaultValue={settings.minTypology}
            required
            min={0}
            step="1"
          />
        </div>

        <div className="settings-form__field">
          <label htmlFor="settings-staleness">
            Staleness threshold (days)
          </label>
          <input
            id="settings-staleness"
            name="stalenessThresholdDays"
            type="number"
            defaultValue={settings.stalenessThresholdDays}
            required
            min={0}
            step="1"
          />
        </div>

        <div className="settings-form__field">
          <label htmlFor="settings-currency">Currency</label>
          <input
            id="settings-currency"
            name="currency"
            type="text"
            defaultValue={settings.currency}
            required
            pattern="[A-Za-z]{3}"
            title="Three-letter currency code, e.g. EUR"
            maxLength={3}
          />
        </div>
      </div>

      {error && <p className="settings-form__error">{error}</p>}
      {success && !error && (
        <p className="settings-form__success">Settings saved.</p>
      )}

      <div className="settings-form__actions">
        <button
          type="submit"
          className="button button--primary"
          disabled={isPending}
        >
          {isPending ? "Saving…" : "Save settings"}
        </button>
      </div>
    </form>
  );
}
