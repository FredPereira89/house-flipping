"use client";

import { useEffect, useState } from "react";
import type { LeadPhoto } from "@prisma/client";

export default function PhotoCarousel({
  leadId,
  photos,
  title,
}: {
  leadId: string;
  photos: Pick<LeadPhoto, "id" | "position">[];
  title: string;
}) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [isZoomed, setIsZoomed] = useState(false);

  useEffect(() => {
    if (lightboxIndex === null) {
      setIsZoomed(false);
      return;
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setLightboxIndex(null);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setLightboxIndex((prev) => (prev !== null && prev > 0 ? prev - 1 : photos.length - 1));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setLightboxIndex((prev) => (prev !== null && prev < photos.length - 1 ? prev + 1 : 0));
      } else if (e.key === "z" || e.key === "Z") {
        setIsZoomed((prev) => !prev);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lightboxIndex, photos.length]);

  if (photos.length === 0) {
    return (
      <div className="photo-gallery-empty surface">
        <svg
          viewBox="0 0 24 24"
          width="40"
          height="40"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path d="m21 15-5-5L5 21" />
        </svg>
        <p>No photos available for this listing</p>
      </div>
    );
  }

  return (
    <div className="photo-gallery-container">
      <div className="photo-gallery-strip" role="region" aria-label="Photo gallery">
        {photos.map((photo, index) => (
          <button
            key={photo.id}
            type="button"
            className="photo-gallery-card"
            onClick={() => setLightboxIndex(index)}
            aria-label={`Open photo ${index + 1} of ${photos.length}`}
          >
            <img
              className="photo-gallery-img"
              src={`/api/photos/${leadId}/${photo.position}`}
              alt={`${title} — ${index + 1} of ${photos.length}`}
              loading={index < 2 ? "eager" : "lazy"}
            />
            <div className="photo-gallery-card__hover">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                <line x1="11" y1="8" x2="11" y2="14" />
                <line x1="8" y1="11" x2="14" y2="11" />
              </svg>
              <span>Expand photo</span>
            </div>
          </button>
        ))}
      </div>

      <div className="photo-gallery-badge">
        <span>📸 {photos.length} photo{photos.length === 1 ? "" : "s"}</span>
      </div>

      {lightboxIndex !== null && (
        <div
          className="photo-lightbox-backdrop"
          onClick={() => setLightboxIndex(null)}
          role="dialog"
          aria-modal="true"
          aria-label={`Photo viewer: ${title}`}
        >
          <div className="photo-lightbox-modal" onClick={(e) => e.stopPropagation()}>
            <div className="photo-lightbox-topbar">
              <span className="photo-lightbox-title">
                {title} <span className="photo-lightbox-count">({lightboxIndex + 1} / {photos.length})</span>
              </span>
              <div className="photo-lightbox-actions">
                <button
                  type="button"
                  className="photo-lightbox-icon-btn"
                  onClick={() => setIsZoomed((prev) => !prev)}
                  title={isZoomed ? "Zoom out (z)" : "Zoom in (z)"}
                  aria-label={isZoomed ? "Zoom out" : "Zoom in"}
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    {isZoomed ? <line x1="8" y1="11" x2="14" y2="11" /> : <><line x1="11" y1="8" x2="11" y2="14" /><line x1="8" y1="11" x2="14" y2="11" /></>}
                  </svg>
                </button>
                <button
                  type="button"
                  className="photo-lightbox-icon-btn photo-lightbox-icon-btn--close"
                  onClick={() => setLightboxIndex(null)}
                  title="Close (Esc)"
                  aria-label="Close photo viewer"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="photo-lightbox-main">
              <button
                type="button"
                className="photo-lightbox-arrow photo-lightbox-arrow--prev"
                onClick={() => setLightboxIndex((prev) => (prev !== null && prev > 0 ? prev - 1 : photos.length - 1))}
                aria-label="Previous photo"
              >
                ‹
              </button>

              <div className={`photo-lightbox-stage${isZoomed ? " photo-lightbox-stage--zoomed" : ""}`}>
                <img
                  className="photo-lightbox-current-img"
                  src={`/api/photos/${leadId}/${photos[lightboxIndex].position}`}
                  alt={`${title} — Photo ${lightboxIndex + 1}`}
                  onClick={() => setIsZoomed((prev) => !prev)}
                />
              </div>

              <button
                type="button"
                className="photo-lightbox-arrow photo-lightbox-arrow--next"
                onClick={() => setLightboxIndex((prev) => (prev !== null && prev < photos.length - 1 ? prev + 1 : 0))}
                aria-label="Next photo"
              >
                ›
              </button>
            </div>

            <div className="photo-lightbox-thumbs">
              {photos.map((photo, idx) => (
                <button
                  key={photo.id}
                  type="button"
                  className={`photo-lightbox-thumb-btn${idx === lightboxIndex ? " photo-lightbox-thumb-btn--active" : ""}`}
                  onClick={() => {
                    setLightboxIndex(idx);
                    setIsZoomed(false);
                  }}
                  aria-label={`View photo ${idx + 1}`}
                >
                  <img
                    src={`/api/photos/${leadId}/${photo.position}`}
                    alt=""
                    loading="lazy"
                  />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
