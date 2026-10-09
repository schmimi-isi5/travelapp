import Link from 'next/link';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-deep px-4 py-10">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-6 flex items-center justify-center gap-3 text-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon.svg" alt="" width={44} height={44} className="rounded-xl" />
          <span className="text-xl font-extrabold">Namibia &amp; Botswana</span>
        </Link>
        <main className="rounded-xl bg-white p-6 shadow-card md:p-8">{children}</main>
        <p className="mt-4 text-center text-xs text-sand">Unsere Reise. Unsere Geschichte.</p>
      </div>
    </div>
  );
}
