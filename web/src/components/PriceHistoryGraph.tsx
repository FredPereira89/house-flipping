import type { LeadPriceHistory } from "@prisma/client";

type PricePoint = Pick<LeadPriceHistory, "price" | "observedAt">;

const currencyFormatter = new Intl.NumberFormat("pt-PT", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const dateFormatter = new Intl.DateTimeFormat("pt-PT", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const WIDTH = 600;
const HEIGHT = 160;
const PAD_X = 12;
const PAD_Y = 16;

/**
 * Lightweight price-over-time chart for a lead's detail page. A hand-rolled
 * inline SVG polyline — no charting library, per the plan's "keep it
 * lightweight" note for Task 3 Step 2. X-axis is scaled by actual elapsed
 * time between observations (not just row index), so an uneven capture
 * cadence still reads correctly.
 */
export default function PriceHistoryGraph({ history }: { history: PricePoint[] }) {
  const points = history
    .map((entry) => ({ price: Number(entry.price), observedAt: entry.observedAt }))
    .filter((entry) => Number.isFinite(entry.price));

  if (points.length === 0) {
    return (
      <p className="price-history__empty">No price history recorded yet.</p>
    );
  }

  if (points.length === 1) {
    return (
      <p className="price-history__empty">
        Only one price observed so far:{" "}
        {currencyFormatter.format(points[0].price)} on{" "}
        {dateFormatter.format(points[0].observedAt)}.
      </p>
    );
  }

  const minTime = points[0].observedAt.getTime();
  const maxTime = points[points.length - 1].observedAt.getTime();
  const timeSpan = maxTime - minTime || 1;

  const prices = points.map((p) => p.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceSpan = maxPrice - minPrice || 1;

  const coords = points.map((p) => ({
    x: PAD_X + ((p.observedAt.getTime() - minTime) / timeSpan) * (WIDTH - PAD_X * 2),
    // SVG y grows downward, so a higher price needs a smaller y.
    y: HEIGHT - PAD_Y - ((p.price - minPrice) / priceSpan) * (HEIGHT - PAD_Y * 2),
    ...p,
  }));

  const polylinePoints = coords
    .map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`)
    .join(" ");

  const first = points[0];
  const last = points[points.length - 1];
  const trend = last.price - first.price;
  const trendClass =
    trend < 0
      ? "price-history__trend--down"
      : trend > 0
        ? "price-history__trend--up"
        : undefined;

  return (
    <div className="price-history">
      <svg
        className="price-history__svg"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`Price history from ${currencyFormatter.format(first.price)} on ${dateFormatter.format(first.observedAt)} to ${currencyFormatter.format(last.price)} on ${dateFormatter.format(last.observedAt)}`}
      >
        <polyline points={polylinePoints} className="price-history__line" fill="none" />
        {coords.map((c, index) => (
          <circle
            key={index}
            cx={c.x}
            cy={c.y}
            r={3}
            className="price-history__dot"
          />
        ))}
      </svg>
      <div className="price-history__legend">
        <span>
          {dateFormatter.format(first.observedAt)} ·{" "}
          {currencyFormatter.format(first.price)}
        </span>
        <span className={trendClass}>
          {trend === 0
            ? "No change"
            : `${trend > 0 ? "+" : ""}${currencyFormatter.format(trend)}`}
        </span>
        <span>
          {dateFormatter.format(last.observedAt)} ·{" "}
          {currencyFormatter.format(last.price)}
        </span>
      </div>
    </div>
  );
}
