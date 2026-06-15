import type { Metadata } from "next";
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

export const metadata: Metadata = {
  title: "Plebs — Hedge fund tools. Retail prices.",
  description: "AI-powered trading signals for stocks, crypto & prediction markets. Options flow, congressional trades, morning briefing — Wall Street's toolkit, finally for everyone.",
  openGraph: {
    title: "Plebs — Hedge fund tools. Retail prices.",
    description: "AI-powered trading signals for stocks, crypto & prediction markets.",
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
    <html lang="en" className="bg-black">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
