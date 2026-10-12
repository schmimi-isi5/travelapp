/** Decorative acacia and dunes for the foot of the sidebar, with the handwritten motto. Purely ornamental. */
export function SidebarArt() {
  return (
    <div aria-hidden className="pointer-events-none mt-auto select-none px-2 pt-6">
      <svg viewBox="0 0 240 150" className="block h-auto w-full" role="presentation" focusable="false">
        <path d="M0 150V112C32 98 62 104 92 112C128 122 160 92 240 104V150Z" fill="#ead7be" />
        <path d="M0 150V128C40 116 78 126 116 130C152 134 196 116 240 124V150Z" fill="#e5dccd" />
        <path d="M118 128V74M118 92c-8-6-18-8-28-6M118 84c10-8 24-10 36-6" stroke="#8f5f2e" strokeWidth="3.2" strokeLinecap="round" fill="none" />
        <path d="M62 64c18-14 52-16 76-8 22-10 50-8 66 8-30 6-52 2-72-2-22 8-48 8-70 2Z" fill="#b99363" opacity="0.85" />
        <path d="M86 52c14-9 36-10 52-4 16-7 36-5 48 6-22 4-38 1-52-2-16 5-34 5-48 0Z" fill="#c9a77c" opacity="0.9" />
      </svg>
      <p className="-mt-3 pb-3 text-center font-script text-xl leading-snug text-gold-700">Mehr als eine Reise – unsere Geschichte in Afrika.</p>
    </div>
  );
}
