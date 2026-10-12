import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { AppProvider } from '@/components/app-provider';

// Self-hosted variable fonts (src/app/fonts/README.md): no request to a font service, works offline.
const fraunces = localFont({ src: './fonts/fraunces-latin.woff2', weight: '400 700', display: 'swap', variable: '--font-fraunces' });
const inter = localFont({ src: './fonts/inter-latin.woff2', weight: '400 700', display: 'swap', variable: '--font-inter' });
const caveat = localFont({ src: './fonts/caveat-latin.woff2', weight: '400 700', display: 'swap', variable: '--font-caveat' });

export const metadata: Metadata = {
  title: 'Namibia & Botswana | Unsere Reise',
  description: 'Die gemeinsame Familien-Reise-App für Namibia und Botswana',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icons/icon.svg', apple: '/icons/icon-192.png' },
  appleWebApp: { capable: true, title: 'Afrika-Reise', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  themeColor: '#0F3D4E',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de-DE" className={`${fraunces.variable} ${inter.variable} ${caveat.variable}`}>
      <body>
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
