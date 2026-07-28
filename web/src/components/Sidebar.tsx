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
    icon: (
      <svg className="sidebar__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M9 4h6l1 3h4v2H4V7h4l1-3Z M6 9h12l-1 11H7L6 9Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
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
        House Flipping
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
              >
                {item.icon}
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>

      <p className="sidebar__footer">Internal sourcing pipeline</p>
    </nav>
  );
}
