import type { Metadata, Viewport } from 'next';

// The link is private: keep it out of search engines and do not leak it through the Referer header.
export const metadata: Metadata = {
  title: 'Unsere Reise | Namibia & Botswana',
  description: 'Unsere Reise zum Mitverfolgen: Fotos, Berichte und Stationen.',
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer',
  openGraph: { title: 'Unsere Reise | Namibia & Botswana', description: 'Unsere Reise zum Mitverfolgen: Fotos, Berichte und Stationen.', locale: 'de_DE', type: 'website' },
};

// viewport-fit=cover lets the picture run under the notch; the page keeps its content inside the safe areas.
export const viewport: Viewport = { themeColor: '#0b2e3b', width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function FollowerLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-sand-50">{children}</div>;
}
