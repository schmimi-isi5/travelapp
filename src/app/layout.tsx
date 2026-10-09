import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AppProvider } from '@/components/app-provider';

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
    <html lang="de-DE">
      <body>
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
