"use client";

import { useState } from "react";

export interface PricePoint {
  price: number | string;
  observedAt: Date;
}

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
const PAD_X = 20;
const PAD_Y = 24;

export default function PriceHistoryGraph({ history }: { history: PricePoint[] }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const points = history
    .map((entry) => ({ price: Number(entry.price), observedAt: new Date(entry.observedAt) }))
    .filter((entry) => Number.isFinite(entry.price));

  if (points.length === 0) {
    return (
      <div className="price-history-empty">
        <p>No price history recorded yet.</p>
      </div>
    );
  }

  if (points.length === 1) {
    return (
      <div className="price-history-single">
        <div className="price-history-single__price">
          {currencyFormatter.format(points[0].price)}
        </div>
        <div className="price-history-single__badge">
          <span>First observed on {dateFormatter.format(points[0].observedAt)}</span>
        </div>
      </div>
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
    y: HEIGHT - PAD_Y - ((p.price - minPrice) / priceSpan) * (HEIGHT - PAD_Y * 2),
    ...p,
  }));

  const polylinePoints = coords
    .map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`)
    .join(" ");

  const areaPoints = `${coords[0].x.toFixed(1)},${HEIGHT} ${polylinePoints} ${coords[coords.length - 1].x.toFixed(1)},${HEIGHT}`;

  const first = points[0];
  const last = points[points.length - 1];
  const trend = last.price - first.price;
  const trendClass =
    trend < 0
      ? "price-history__trend--down"
      : trend > 0
        ? "price-history__trend--up"
        : undefined;

  const activePoint = hoveredIdx !== null ? coords[hoveredIdx] : coords[coords.length - 1];

  return (
    <div className="price-history">
      <div className="price-history__header">
        <div className="price-history__active-stat">
          <span className="price-history__active-label">
            {hoveredIdx !== null ? "Selected point" : "Current price"}
          </span>
          <span className="price-history__active-price">
            {currencyFormatter.format(activePoint.price)}
          </span>
          <span className="price-history__active-date">
            {dateFormatter.format(activePoint.observedAt)}
          </span>
        </div>

        <div className={`price-history__trend-pill ${trendClass || ""}`}>
          {trend === 0
            ? "Stable price"
            : `${trend > 0 ? "▲ +" : "▼ "}${currencyFormatter.format(trend)} (${((trend / first.price) * 100).toFixed(1)}%)`}
        </div>
      </div>

      <div className="price-history__chart-wrap">
        <svg
          className="price-history__svg"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label={`Price history from ${currencyFormatter.format(first.price)} to ${currencyFormatter.format(last.price)}`}
        >
          <defs>
            <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-brand)" stopOpacity="0.25" />
              <stop offset="100%" stopColor="var(--color-brand)" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          <polygon points={areaPoints} fill="url(#priceGradient)" />
          <polyline points={polylinePoints} className="price-history__line" fill="none" strokeWidth="2.5" />

          {coords.map((c, index) => (
            <g
              key={index}
              onMouseEnter={() => setHoveredIdx(index)}
              onMouseLeave={() => setHoveredIdx(null)}
              style={{ cursor: "pointer" }}
            >
              <circle
                cx={c.x}
                cy={c.y}
                r={hoveredIdx === index ? 6 : 4}
                className={`price-history__dot${hoveredIdx === index ? " price-history__dot--active" : ""}`}
              />
              <circle cx={c.x} cy={c.y} r={14} fill="transparent" />
            </g>
          ))}
        </svg>
      </div>

      <div className="price-history__legend">
        <span>Start: {dateFormatter.format(first.observedAt)}</span>
        <span>Latest: {dateFormatter.format(last.observedAt)}</span>
      </div>
    </div>
  );
}
