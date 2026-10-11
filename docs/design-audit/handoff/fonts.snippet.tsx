// ENTWURF – in das Root-Layout übernehmen (vermutlich app/layout.tsx).
// next/font lädt die Dateien zur Build-Zeit und hostet sie selbst → kompatibel mit CSP default-src 'self'.
import { Fraunces, Inter } from "next/font/google";

export const fraunces = Fraunces({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-fraunces",
  axes: ["opsz", "SOFT"], // variable Achsen; SOFT im CSS auf 0 halten
});

export const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

// Im RootLayout:
// <html lang="de" className={`${fraunces.variable} ${inter.variable}`}>
//   <body className="font-sans bg-sand-50 text-ink-900 antialiased">…</body>
// </html>
