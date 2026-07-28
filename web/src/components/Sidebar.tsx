"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  id: string;
  href: string;
  label: string;
  icon: React.ReactNode;
};

const NAV_ITEMS: NavItem[] = [
  {
    id: "nav-link-leads",
    href: "/",
    label: "Dashboard / Leads",
    icon: (
      <svg className="sidebar__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    id: "nav-link-triage",
    href: "/triage",
    label: "Triage",
    // A map pin, not the trash-can silhouette this used to be -- Triage's
    // entire job is assigning an area (location) to unmatched leads, and a
    // pin is the same location metaphor LeadCard already uses elsewhere in
    // this app, not a new icon language. The old trash-can shape read as
    // "delete" at exactly the spot a new/returning user needs the least
    // ambiguity.
    icon: (
      <svg className="sidebar__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M12 21s-7-5.5-7-11a7 7 0 1 1 14 0c0 5.5-7 11-7 11Z"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <circle cx="12" cy="10" r="2.4" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    ),
  },
  {
    id: "nav-link-alerts",
    href: "/alerts",
    label: "Alerts",
    icon: (
      <svg className="sidebar__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M12 3.5c-1 0-1.8.8-1.8 1.8v.4C7.7 6.3 6 8.6 6 11.3V15l-1.6 2.4c-.3.4 0 1 .5 1h14.2c.5 0 .8-.6.5-1L18 15v-3.7c0-2.7-1.7-5-4.2-5.6v-.4c0-1-.8-1.8-1.8-1.8Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path
          d="M10 20a2 2 0 0 0 4 0"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    id: "nav-link-saved-searches",
    href: "/admin/searches",
    label: "Saved Searches",
    icon: (
      <svg className="sidebar__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="10.5" cy="10.5" r="6" stroke="currentColor" strokeWidth="1.6" />
        <path d="m20 20-4.6-4.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "nav-link-settings",
    href: "/admin/settings",
    label: "Settings",
    icon: (
      <svg className="sidebar__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
        <path
          d="M12 2.5v3M12 18.5v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2.5 12h3M18.5 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
];

/**
 * Global authenticated-shell navigation. A client component (needs
 * usePathname for active-link styling), rendered once from the root
 * layout so it persists across every route under `/`.
 */
export default function Sidebar() {
  const pathname = usePathname();

  return (
    <nav className="sidebar" aria-label="Primary">
      <Link id="sidebar-brand-link" href="/" className="sidebar__brand">
        <span className="sidebar__brand-mark" aria-hidden="true">
          HF
        </span>
        <span className="sidebar__brand-name">House Flipping</span>
      </Link>

      <ul
        className="sidebar__nav"
        style={{ listStyle: "none", margin: 0, padding: 0 }}
      >
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname === item.href || pathname?.startsWith(`${item.href}/`);

          return (
            <li key={item.id}>
              <Link
                id={item.id}
                href={item.href}
                className={
                  isActive
                    ? "sidebar__link sidebar__link--active"
                    : "sidebar__link"
                }
                aria-current={isActive ? "page" : undefined}
                title={item.label}
              >
                {item.icon}
                <span className="sidebar__link-label">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>

      <p className="sidebar__footer">Internal sourcing pipeline</p>
    </nav>
  );
}
