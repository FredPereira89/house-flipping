import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";

import Sidebar from "@/components/Sidebar";
import { requireSession } from "@/lib/session";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "House Flipping Pipeline",
    template: "%s | House Flipping Pipeline",
  },
  description:
    "Internal sourcing pipeline for property leads: triage, review, and pricing baselines.",
  robots: {
    index: false,
    follow: false,
  },
};

/**
 * Root layout doubles as the auth guard for every route under `/`:
 * `requireSession()` reads the session server-side (via NextAuth's
 * `getServerSession`) and redirects to `/api/auth/signin` when there isn't
 * one, so no page can render without a valid, org-scoped session. Route
 * handlers under `app/api/**` are unaffected — layouts only wrap page
 * rendering, not Route Handlers — so the sign-in redirect target itself
 * never bounces back through this guard.
 */
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await requireSession();

  return (
    <html lang="en" className={outfit.variable}>
      <body>
        <div className="app-shell">
          <Sidebar />
          <main id="main-content" className="main-content">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
