'use client';

import { useState } from 'react';
import { useApp } from '@/components/app-provider';
import { Button, Field, Input, Textarea } from '@/components/ui';
import { create, ValidationError } from '@/lib/db/repo';
import { estimateRoute } from '@/lib/domain/geo';
import type { TripStop } from '@/lib/domain/schemas';

interface FormState {
  title: string;
  country: string;
  latitude: string;
  longitude: string;
  arrive_at: string;
  depart_at: string;
  summary: string;
}

const EMPTY: FormState = { title: '', country: 'Namibia', latitude: '', longitude: '', arrive_at: '', depart_at: '', summary: '' };

function parseCoordinate(value: string): number | null | 'invalid' {
  if (!value.trim()) return null;
  const n = Number(value.replace(',', '.'));
  return Number.isFinite(n) ? n : 'invalid';
}

export function StopForm({ stops, onDone }: { stops: TripStop[]; onDone: () => void }) {
  const { tripId } = useApp();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const lat = parseCoordinate(form.latitude);
    const lon = parseCoordinate(form.longitude);
    const next: Record<string, string> = {};
    if (lat === 'invalid') next.latitude = 'Zahl erwartet, z. B. -22.56';
    if (lon === 'invalid') next.longitude = 'Zahl erwartet, z. B. 17.07';
    if (form.arrive_at && form.depart_at && form.depart_at < form.arrive_at) next.depart_at = 'Abreise liegt vor der Ankunft.';
    if (Object.keys(next).length) return setErrors(next);
    const sequence = Math.max(0, ...stops.map((s) => s.sequence)) + 1;
    try {
      const stop = await create('trip_stops', {
        trip_id: tripId,
        title: form.title.trim(),
        country: form.country.trim(),
        latitude: lat === 'invalid' ? null : lat,
        longitude: lon === 'invalid' ? null : lon,
        arrive_at: form.arrive_at || null,
        depart_at: form.depart_at || null,
        sequence,
        summary: form.summary,
      });
      const previous = [...stops].sort((a, b) => b.sequence - a.sequence)[0];
      if (previous) {
        const estimate = estimateRoute(previous, stop);
        await create('routes', {
          trip_id: tripId,
          from_stop_id: previous.id,
          to_stop_id: stop.id,
          distance_km: estimate?.distance_km ?? null,
          duration_minutes: estimate?.duration_minutes ?? null,
          duration_source: estimate ? 'offline_estimate' : 'unknown',
        });
      }
      setForm(EMPTY);
      setErrors({});
      onDone();
    } catch (error) {
      if (error instanceof ValidationError) setErrors(Object.fromEntries(error.issues.map((i) => [i.path, i.message])));
      else throw error;
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4" aria-label="Station hinzufügen">
      <Field label="Titel" error={errors.title}>{(p) => <Input {...p} value={form.title} onChange={set('title')} required />}</Field>
      <Field label="Land" error={errors.country}>{(p) => <Input {...p} value={form.country} onChange={set('country')} />}</Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Breitengrad" hint="optional" error={errors.latitude}>{(p) => <Input {...p} inputMode="decimal" value={form.latitude} onChange={set('latitude')} />}</Field>
        <Field label="Längengrad" hint="optional" error={errors.longitude}>{(p) => <Input {...p} inputMode="decimal" value={form.longitude} onChange={set('longitude')} />}</Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Ankunft" error={errors.arrive_at}>{(p) => <Input {...p} type="date" value={form.arrive_at} onChange={set('arrive_at')} />}</Field>
        <Field label="Abreise" error={errors.depart_at}>{(p) => <Input {...p} type="date" value={form.depart_at} onChange={set('depart_at')} />}</Field>
      </div>
      <Field label="Notiz">{(p) => <Textarea {...p} value={form.summary} onChange={set('summary')} />}</Field>
      <div className="flex justify-end"><Button type="submit">Station speichern</Button></div>
    </form>
  );
}
