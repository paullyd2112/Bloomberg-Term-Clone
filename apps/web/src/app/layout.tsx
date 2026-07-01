import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
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
<<<<<<< HEAD
  title: "Plebs · Hedge fund tools. Retail prices.",
  description: "AI-powered trading signals for stocks, crypto & prediction markets. Unusual options flow, morning briefing, per-asset accuracy. Wall Street's toolkit, finally for everyone.",
  openGraph: {
    title: "Plebs · Hedge fund tools. Retail prices.",
    description: "AI-powered trading signals for stocks, crypto & prediction markets.",
=======
  title: "Plebs — Hedge fund tools. Retail prices.",
  description: "AI-powered trading signals for stocks and crypto. Unusual options flow, morning briefing, per-asset accuracy — Wall Street's toolkit, finally for everyone.",
  openGraph: {
    title: "Plebs — Hedge fund tools. Retail prices.",
    description: "AI-powered trading signals for stocks and crypto.",
>>>>>>> 7796bb55b34c9bea668375d5b7937747a9746108
    images: [{ url: "/logo.png", width: 500, height: 200 }],
  },
  twitter: {
    card: "summary",
    images: ["/logo-icon.png"],
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
