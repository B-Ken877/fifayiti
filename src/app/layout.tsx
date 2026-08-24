import type { Metadata } from "next";
import { Manrope, Archivo } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { NavigationHistory } from "@/components/fifayiti/navigation-history";

// Manrope — UI, body, admin, metadata (existing font retained)
const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

// Archivo — display typography for hero headlines, scores, broadcast titles.
// Condensed/athletic, highly legible, professional. NOT decorative novelty.
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["600", "700", "800", "900"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "FIFAYITI — Federation Inter Football Ayiti",
  description:
    "FIFAYITI — Federation Inter Football Ayiti. Swiv match yo, ekip yo, jwè yo ak tout aksyon FIFAYITI.",
  keywords: ["FIFAYITI", "Federation Inter Football Ayiti", "Football", "Ayiti"],
  authors: [{ name: "FIFAYITI" }],
  openGraph: {
    title: "FIFAYITI — Federation Inter Football Ayiti",
    description: "Swiv match yo, ekip yo, jwè yo ak tout aksyon FIFAYITI.",
    siteName: "FIFAYITI",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "FIFAYITI — Federation Inter Football Ayiti",
    description: "Swiv match yo, ekip yo, jwè yo ak tout aksyon FIFAYITI.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ht" suppressHydrationWarning>
      <body
        className={`${manrope.variable} ${archivo.variable} antialiased bg-background text-foreground font-sans`}
      >
        <NavigationHistory />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
