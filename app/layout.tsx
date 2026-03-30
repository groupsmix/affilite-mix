import type { Metadata } from "next";
import { Inter, IBM_Plex_Sans_Arabic, Playfair_Display } from "next/font/google";
import "./globals.css";

/*
 * All three font families are declared here so that their CSS variables are
 * available to every site. next/font automatically subsets and self-hosts
 * the fonts; the browser only downloads the ones actually referenced in
 * computed styles (via font-display: swap). Per-site font selection happens
 * in app/(public)/layout.tsx which maps site.theme.fontHeading / fontBody
 * to the appropriate CSS variable.
 *
 * If the number of fonts grows significantly, consider dynamic next/font
 * loading per-site to reduce the initial CSS payload.
 */

export const metadata: Metadata = {
  title: "NicheHub",
  description: "Multi-site affiliate platform",
};

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const ibmPlexArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-ibm-plex-arabic",
});

const playfairDisplay = Playfair_Display({
  subsets: ["latin"],
  weight: ["600", "700"],
  display: "swap",
  variable: "--font-playfair",
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html className={`${inter.variable} ${ibmPlexArabic.variable} ${playfairDisplay.variable}`}>
      <body>{children}</body>
    </html>
  );
}
