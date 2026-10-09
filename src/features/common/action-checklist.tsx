'use client';

import clsx from 'clsx';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '@/components/app-provider';
import { Button, Input, Select } from '@/components/ui';
import { create, update } from '@/lib/db/repo';
import { isAdult } from '@/lib/domain/policy';
import type { ActionItem } from '@/lib/domain/schemas';
import { formatShortDate } from '@/lib/formatting';

interface Scope {
  stay_id?: string;
  stop_id?: string;
  booking_id?: string;
}

export function ActionChecklist({ items, scope, label, readOnly }: { items: ActionItem[]; scope?: Scope; label: string; readOnly?: boolean }) {
  const { members, familyId, tripId, role } = useApp();
  const [title, setTitle] = useState('');
  const [owner, setOwner] = useState('');
  const [error, setError] = useState<string | null>(null);
  const canEdit = isAdult(role) && !readOnly;
  const nameOf = (id: string | null) => members.find((m) => m.id === id)?.display_name ?? null;

  async function toggle(item: ActionItem) {
    await update('action_items', item.id, { status: item.status === 'done' ? 'open' : 'done' });
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError('Bitte einen Titel eingeben.');
      return;
    }
    setError(null);
    await create('action_items', { family_id: familyId, trip_id: tripId, title: title.trim(), owner_user_id: owner || null, ...scope });
    setTitle('');
    setOwner('');
  }

  return (
    <div>
      <ul aria-label={label} className="divide-y divide-line">
        {items.length === 0 && <li className="py-3 text-sm text-muted">Keine Aufgaben.</li>}
        {items.map((item) => (
          <li key={item.id} className="flex min-h-12 items-center gap-3 py-2">
            <input
              id={`chk-${item.id}`}
              type="checkbox"
              checked={item.status === 'done'}
              disabled={!canEdit}
              onChange={() => void toggle(item)}
              className="size-5 shrink-0 accent-[#0F3D4E]"
            />
            <label htmlFor={`chk-${item.id}`} className={clsx('min-w-0 flex-1 text-[15px]', item.status === 'done' && 'text-muted line-through')}>
              {item.title}
              <span className="block text-xs text-muted">
                {nameOf(item.owner_user_id) ? `Zuständig: ${nameOf(item.owner_user_id)}` : 'Nicht zugewiesen'}
                {item.due_at ? ` · fällig ${formatShortDate(item.due_at)}` : ''}
              </span>
            </label>
          </li>
        ))}
      </ul>
      {canEdit && (
        <form onSubmit={add} className="mt-3 flex flex-col gap-2 sm:flex-row" aria-label={`${label}: neue Aufgabe`} noValidate>
          <div className="flex-1">
            <Input aria-label="Neue Aufgabe" placeholder="Neue Aufgabe …" value={title} onChange={(e) => setTitle(e.target.value)} aria-invalid={Boolean(error)} />
            {error && (
              <p role="alert" className="mt-1 text-sm text-danger">
                {error}
              </p>
            )}
          </div>
          <Select aria-label="Zuständige Person" value={owner} onChange={(e) => setOwner(e.target.value)} className="sm:w-52">
            <option value="">Nicht zugewiesen</option>
            {members.filter((m) => m.status === 'active').map((m) => (
              <option key={m.id} value={m.id}>
                {m.display_name}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="secondary">
            <Plus size={16} aria-hidden /> Hinzufügen
          </Button>
        </form>
      )}
    </div>
  );
}
