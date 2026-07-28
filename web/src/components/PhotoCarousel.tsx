import type { LeadPhoto } from "@prisma/client";

/**
 * Photo strip for a single lead's detail page. Pure CSS scroll-snapping
 * (`.photo-carousel` / `.photo-carousel__item` in globals.css) — no JS
 * carousel library, per the plan's Task 3 requirement. Each `<img>` points
 * at `/api/photos/[leadId]/[position]`, which is the only route allowed to
 * touch `data/photos/` on disk (see that route's org-ownership check).
 *
 * When a lead has zero `LeadPhoto` rows, this renders a plain inline SVG
 * placeholder rather than any fabricated photo — see plan amendment point
 * 2: no AI-generated mockups, ever, for missing listing photos.
 */
export default function PhotoCarousel({
  leadId,
  photos,
  title,
}: {
  leadId: string;
  photos: Pick<LeadPhoto, "id" | "position">[];
  title: string;
}) {
  if (photos.length === 0) {
    return (
      <div className="photo-carousel photo-carousel--empty surface">
        <svg
          className="photo-carousel__placeholder-icon"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <rect
            x="3"
            y="5"
            width="18"
            height="14"
            rx="2"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <circle cx="8.5" cy="10" r="1.5" stroke="currentColor" strokeWidth="1.5" />
          <path
            d="M3 16.5 8 12l3 2.5 4-4 6 6"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path d="M4 4l16 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <p className="photo-carousel__placeholder-text">No photo available</p>
      </div>
    );
  }

  return (
    <div className="photo-carousel" role="group" aria-label={`Photos of ${title}`}>
      {photos.map((photo, index) => (
        <img
          key={photo.id}
          className="photo-carousel__item"
          src={`/api/photos/${leadId}/${photo.position}`}
          alt={`${title} — photo ${index + 1} of ${photos.length}`}
          loading={index === 0 ? "eager" : "lazy"}
        />
      ))}
    </div>
  );
}
