import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { SITE_URL, SITE_NAME } from "@/lib/seo";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  // Resolves every relative URL below (and in child pages) against the canonical
  // www origin. Without this Next infers a base from the deployment URL, which
  // silently differs between preview and production.
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Plebs · Hedge fund tools. Retail prices.",
    // Child pages that set a plain string title get the brand appended; pages
    // that already brand themselves use `title.absolute` to opt out.
    template: "%s · Plebs",
  },
  description: "AI-powered trading signals for crypto and prediction markets. Whale alerts, morning briefing, per-asset accuracy. Wall Street's toolkit, finally for everyone.",
  applicationName: SITE_NAME,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    url: "/",
    title: "Plebs · Hedge fund tools. Retail prices.",
    description: "AI-powered trading signals for crypto and prediction markets.",
  },
  twitter: {
    // The /opengraph-image route renders a proper 1200x630 card; `summary`
    // would render it as a small square thumbnail instead.
    card: "summary_large_image",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="bg-background">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
