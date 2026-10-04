import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Foresight — Fantasy intelligence for NFL + NBA", template: "%s · Foresight" },
  description: "Live data. Deeper context. Smarter fantasy decisions. Projections, opportunity, availability, trades and scenarios — explained.",
};

export const viewport: Viewport = { themeColor: "#04060b" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
