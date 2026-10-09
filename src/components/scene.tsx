import clsx from 'clsx';

export type SceneName = 'dunes' | 'waterhole' | 'coast' | 'river' | 'savanna' | 'city';

const PALETTES: Record<SceneName, { sky: [string, string]; sun: string; far: string; mid: string; near: string }> = {
  dunes: { sky: ['#f6d9b0', '#e9a870'], sun: '#fff1d0', far: '#d4883f', mid: '#b8602e', near: '#8f3f22' },
  waterhole: { sky: ['#f4b982', '#c65a3a'], sun: '#ffe2a8', far: '#5b6b3a', mid: '#3e4a28', near: '#222a16' },
  coast: { sky: ['#cfe6ee', '#7fb3c4'], sun: '#fff7e0', far: '#3f7f95', mid: '#0f3d4e', near: '#d4a373' },
  river: { sky: ['#f9d9a8', '#4f8aa0'], sun: '#fff1c4', far: '#4a6b4a', mid: '#2f5b6d', near: '#0f3d4e' },
  savanna: { sky: ['#fbe3b3', '#e8a25a'], sun: '#fff4d6', far: '#9c7a3c', mid: '#6b5a2a', near: '#3a3318' },
  city: { sky: ['#f2d8bd', '#d9926a'], sun: '#fff0cf', far: '#8c6b55', mid: '#5a4638', near: '#33271f' },
};

export function sceneNameFromPath(path: string): SceneName | null {
  const name = path.replace('scene:', '') as SceneName;
  return name in PALETTES ? name : null;
}

/** Original vector illustration used for demo imagery. Not a photograph and never presented as one. */
export function Scene({ name, label, className }: { name: SceneName; label: string; className?: string }) {
  const p = PALETTES[name];
  const gid = `sky-${name}`;
  return (
    <svg {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })} viewBox="0 0 400 240" preserveAspectRatio="xMidYMid slice" className={clsx('block h-full w-full', className)}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={p.sky[0]} />
          <stop offset="1" stopColor={p.sky[1]} />
        </linearGradient>
      </defs>
      <rect width="400" height="240" fill={`url(#${gid})`} />
      <circle cx="290" cy="92" r="30" fill={p.sun} opacity="0.92" />
      <path d="M0 150 C60 118 110 128 170 146 C230 164 300 120 400 142 V240 H0Z" fill={p.far} />
      <path d="M0 178 C80 150 140 176 220 170 C300 164 340 150 400 168 V240 H0Z" fill={p.mid} />
      {name === 'dunes' && <path d="M0 200 C90 160 150 190 230 182 C310 174 360 188 400 176 V240 H0Z" fill={p.near} />}
      {(name === 'waterhole' || name === 'savanna') && (
        <>
          <path d="M0 210 C100 196 200 214 400 200 V240 H0Z" fill={p.near} />
          <g fill={p.near}>
            <path d="M70 200 v-34 M70 172 q-22 -6 -30 -18 M70 168 q18 -8 34 -20 M70 176 q-12 -14 -2 -28" stroke={p.near} strokeWidth="4" fill="none" strokeLinecap="round" />
            <ellipse cx="235" cy="188" rx="22" ry="12" />
            <rect x="214" y="190" width="6" height="16" rx="3" />
            <rect x="228" y="192" width="6" height="14" rx="3" />
            <rect x="244" y="192" width="6" height="14" rx="3" />
            <path d="M255 182 q14 -2 16 12 q-10 2 -16 -4Z" />
            <circle cx="266" cy="190" r="7" />
          </g>
        </>
      )}
      {name === 'coast' && (
        <g stroke="#ffffff" strokeWidth="2" fill="none" opacity="0.7">
          <path d="M0 196 q25 -8 50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0" />
          <path d="M0 214 q25 -8 50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0" />
        </g>
      )}
      {name === 'river' && (
        <g fill="none" stroke="#ffffff" strokeWidth="2" opacity="0.55">
          <path d="M20 190 q30 -6 60 0 t60 0 t60 0 t60 0 t60 0" />
          <path d="M60 212 q30 -6 60 0 t60 0 t60 0 t60 0" />
        </g>
      )}
      {name === 'city' && (
        <g fill={p.near}>
          <rect x="60" y="150" width="30" height="60" />
          <rect x="96" y="132" width="26" height="78" />
          <rect x="128" y="160" width="40" height="50" />
          <rect x="250" y="140" width="34" height="70" />
        </g>
      )}
    </svg>
  );
}
