import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SiteAnalytics } from "@/components/site-analytics";

const SITE_NAME = "GAMER.ID";
const SITE_DESCRIPTION = "Your gamer identity across Xbox, Steam and PlayStation: pooled playtime, top games and shareable Top 6/10/25/50 cards.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")),
  title: { default: `${SITE_NAME}: your gaming history across Xbox, Steam and PlayStation`, template: `%s | ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: { type: "website", siteName: SITE_NAME, title: SITE_NAME, description: SITE_DESCRIPTION },
  twitter: { card: "summary_large_image", title: SITE_NAME, description: SITE_DESCRIPTION },
};

export const viewport: Viewport = { themeColor: "#09090b", colorScheme: "dark" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
    >
      <body className="min-h-screen flex flex-col bg-zinc-950 text-zinc-100">
        <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-zinc-50 focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-zinc-950">
          Skip to content
        </a>
        <SiteHeader />
        <main id="main-content" className="flex-1 flex flex-col">{children}</main>
        <SiteFooter />
        <SiteAnalytics />
      </body>
    </html>
  );
}
