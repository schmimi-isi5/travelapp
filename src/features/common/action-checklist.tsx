'use client';

import clsx from 'clsx';
import { Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '@/components/app-provider';
import { Button, Dialog, Input, Select } from '@/components/ui';
import { create, remove, update } from '@/lib/db/repo';
import { isAdult } from '@/lib/domain/policy';
import type { ActionItem } from '@/lib/domain/schemas';
import { formatShortDate } from '@/lib/formatting';

interface Scope {
  stay_id?: string;
  stop_id?: string;
  booking_id?: string;
}

/** Form for a new task (optionally scoped to a stay, stop or booking); adults only, decided by the caller. */
export function AddActionForm({ scope, label, onAdded, className }: { scope?: Scope; label: string; onAdded?: () => void; className?: string }) {
  const { members, familyId, tripId } = useApp();
  const [title, setTitle] = useState('');
  const [owner, setOwner] = useState('');
  const [error, setError] = useState<string | null>(null);

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
    onAdded?.();
  }

  return (
    <form onSubmit={add} className={clsx('flex flex-col gap-2 sm:flex-row', className)} aria-label={`${label}: neue Aufgabe`} noValidate>
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
  );
}

const PRIORITY_OPTIONS: ReadonlyArray<{ value: ActionItem['priority']; label: string }> = [
  { value: 'low', label: 'Niedrig' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'Dringend' },
];
const STATUS_OPTIONS: ReadonlyArray<{ value: ActionItem['status']; label: string }> = [
  { value: 'open', label: 'Offen' },
  { value: 'blocked', label: 'Wartet auf etwas' },
  { value: 'done', label: 'Erledigt' },
];

/** Pencil button plus dialog to change or delete one task; adults only, decided by the caller. */
export function EditActionButton({ item }: { item: ActionItem }) {
  const { members } = useApp();
  const [isOpen, setIsOpen] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [owner, setOwner] = useState(item.owner_user_id ?? '');
  const [dueDate, setDueDate] = useState(item.due_at?.slice(0, 10) ?? '');
  const [priority, setPriority] = useState(item.priority);
  const [status, setStatus] = useState(item.status);
  const [error, setError] = useState<string | null>(null);

  function openDialog() {
    setTitle(item.title);
    setOwner(item.owner_user_id ?? '');
    setDueDate(item.due_at?.slice(0, 10) ?? '');
    setPriority(item.priority);
    setStatus(item.status);
    setError(null);
    setIsConfirmingDelete(false);
    setIsOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError('Bitte einen Titel eingeben.');
      return;
    }
    setIsBusy(true);
    try {
      await update('action_items', item.id, { title: title.trim(), owner_user_id: owner || null, due_at: dueDate || null, priority, status });
      setIsOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Die Aufgabe konnte nicht gespeichert werden.');
    } finally {
      setIsBusy(false);
    }
  }

  async function confirmDelete() {
    setIsBusy(true);
    try {
      await remove('action_items', item.id);
      setIsOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Die Aufgabe konnte nicht gelöscht werden.');
      setIsConfirmingDelete(false);
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <>
      <button type="button" aria-label="Aufgabe bearbeiten" onClick={openDialog} className="grid size-11 shrink-0 place-items-center rounded-full text-slate hover:bg-sand-50">
        <Pencil size={16} aria-hidden />
      </button>
      <Dialog open={isOpen} onClose={() => setIsOpen(false)} title={isConfirmingDelete ? 'Aufgabe löschen?' : 'Aufgabe bearbeiten'}>
        {isConfirmingDelete ? (
          <>
            <p className="text-slate">„{item.title}“ wird endgültig gelöscht.</p>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setIsConfirmingDelete(false)}>Abbrechen</Button>
              <Button variant="danger" disabled={isBusy} onClick={() => void confirmDelete()}>Endgültig löschen</Button>
            </div>
          </>
        ) : (
          <form onSubmit={save} className="space-y-3" noValidate>
            <label className="block text-sm font-semibold">
              Aufgabe
              <Input className="mt-1 font-normal" value={title} onChange={(e) => setTitle(e.target.value)} aria-invalid={Boolean(error)} />
            </label>
            <label className="block text-sm font-semibold">
              Zuständige Person
              <Select className="mt-1 font-normal" value={owner} onChange={(e) => setOwner(e.target.value)}>
                <option value="">Nicht zugewiesen</option>
                {members.filter((m) => m.status === 'active').map((m) => (
                  <option key={m.id} value={m.id}>{m.display_name}</option>
                ))}
              </Select>
            </label>
            <label className="block text-sm font-semibold">
              Fällig am
              <Input className="mt-1 font-normal" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-semibold">
                Wichtigkeit
                <Select className="mt-1 font-normal" value={priority} onChange={(e) => setPriority(e.target.value as ActionItem['priority'])}>
                  {PRIORITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </label>
              <label className="block text-sm font-semibold">
                Stand
                <Select className="mt-1 font-normal" value={status} onChange={(e) => setStatus(e.target.value as ActionItem['status'])}>
                  {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </label>
            </div>
            {error && <p role="alert" className="text-sm text-danger">{error}</p>}
            <div className="mt-6 flex flex-wrap justify-between gap-2">
              <Button variant="danger" onClick={() => setIsConfirmingDelete(true)}>Löschen</Button>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setIsOpen(false)}>Abbrechen</Button>
                <Button type="submit" disabled={isBusy}>Speichern</Button>
              </div>
            </div>
          </form>
        )}
      </Dialog>
    </>
  );
}

export function ActionChecklist({ items, scope, label, readOnly }: { items: ActionItem[]; scope?: Scope; label: string; readOnly?: boolean }) {
  const { members, role } = useApp();
  const canEdit = isAdult(role) && !readOnly;
  const nameOf = (id: string | null) => members.find((m) => m.id === id)?.display_name ?? null;

  async function toggle(item: ActionItem) {
    await update('action_items', item.id, { status: item.status === 'done' ? 'open' : 'done' });
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
            {canEdit && <EditActionButton item={item} />}
          </li>
        ))}
      </ul>
      {canEdit && <AddActionForm scope={scope} label={label} className="mt-3" />}
    </div>
  );
}
