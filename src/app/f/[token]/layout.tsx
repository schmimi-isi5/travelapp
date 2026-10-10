import type { Metadata } from 'next';

// The link is private: keep it out of search engines and do not leak it through the Referer header.
export const metadata: Metadata = {
  title: 'Unsere Reise | Namibia & Botswana',
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer',
};

export default function FollowerLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-sand-50">{children}</div>;
}
