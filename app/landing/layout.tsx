import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "@/app/globals.css";
import "./landing.css";
import { LandingMotionConfig } from "./components/landing-motion-config";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Affilite-Mix — One Codebase. Every Niche. The Edge Does the Rest.",
  description:
    "Edge-native, multi-tenant affiliate content platform. Run an entire portfolio of niche affiliate sites from one codebase. AI-generated content, privacy-preserving click tracking, RLS-isolated tenants, deployed to Cloudflare Workers.",
  alternates: {
    ...(process.env.SITE_URL || process.env.APP_URL
      ? { canonical: process.env.SITE_URL ?? process.env.APP_URL }
      : {}),
  },
  openGraph: {
    title: "Affilite-Mix — One Codebase. Every Niche.",
    description:
      "Run an entire portfolio of niche affiliate sites from one codebase. AI content, edge click tracking, multi-tenant by design.",
    type: "website",
  },
};

export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${inter.variable} ${mono.variable}`} suppressHydrationWarning>
      <body className="landing-body bg-[#0a0b0f] text-[#e2e4e9] antialiased selection:bg-brand/30">
        <LandingMotionConfig>{children}</LandingMotionConfig>
      </body>
    </html>
  );
}
