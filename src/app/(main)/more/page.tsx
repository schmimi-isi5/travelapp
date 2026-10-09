'use client';

import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useApp } from '@/components/app-provider';
import { MORE_NAV, PRIMARY_NAV, visibleFor } from '@/components/nav-items';
import { AccountMenu } from '@/components/app-shell';
import { PageHeader, Select } from '@/components/ui';

export default function MorePage() {
  const { role, members, currentUser, switchUser, isSupabase } = useApp();
  const items = [...visibleFor(PRIMARY_NAV, role).filter((i) => i.href === '/gallery'), ...visibleFor(MORE_NAV, role)];
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Mehr" subtitle="Alle weiteren Module." />
      {isSupabase && <div className="mb-4 sm:hidden"><AccountMenu /></div>}
      {currentUser && !isSupabase && (
        <div className="mb-4 sm:hidden">
          <label className="mb-1 block text-sm font-semibold text-slate" htmlFor="profile">Profil (Demo)</label>
          <Select id="profile" value={currentUser.id} onChange={(e) => switchUser(e.target.value)}>{members.filter((m) => m.status === 'active').map((m) => <option key={m.id} value={m.id}>{m.display_name} ({m.role})</option>)}</Select>
        </div>
      )}
      <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-white shadow-card">
        {items.map((item) => (
          <li key={item.href}>
            <Link href={item.href} className="flex min-h-16 items-center gap-4 px-4">
              <span className="grid size-10 place-items-center rounded-full bg-sand text-deep"><item.icon size={20} aria-hidden /></span>
              <span className="flex-1"><strong className="block">{item.label}</strong><span className="text-sm text-slate">{item.description}</span></span>
              <ChevronRight aria-hidden className="text-muted" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
