'use client';

import { Camera } from 'lucide-react';
import { useRef, useState } from 'react';
import { MemberAvatar } from '@/components/avatar';
import { Button } from '@/components/ui';
import { avatarDataUrl } from '@/lib/db/avatar-image';
import { update } from '@/lib/db/repo';
import type { Member } from '@/lib/domain/schemas';

/** Own profile photo: chosen from the device, shrunk to a small square on the device and saved with the profile. */
export function ProfilePhotoField({ member }: { member: Member }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function choose(file: File | undefined) {
    if (!file) return;
    const dataUrl = await avatarDataUrl(file);
    if (!dataUrl) return setMessage('Dieses Bild konnte nicht verarbeitet werden. Bitte ein anderes Foto (JPEG, PNG) wählen.');
    await update('members', member.id, { avatar_data: dataUrl });
    setMessage('Profilfoto gespeichert.');
  }

  async function remove() {
    await update('members', member.id, { avatar_data: null });
    setMessage('Profilfoto entfernt.');
  }

  return (
    <div className="flex flex-wrap items-center gap-4" data-testid="profile-photo">
      <MemberAvatar member={member} size={64} />
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => inputRef.current?.click()}><Camera size={16} aria-hidden /> {member.avatar_data ? 'Foto ändern' : 'Foto wählen'}</Button>
          {member.avatar_data && <Button variant="ghost" size="sm" onClick={() => void remove()}>Entfernen</Button>}
        </div>
        <input ref={inputRef} type="file" accept="image/*" className="sr-only" aria-label="Profilfoto auswählen" tabIndex={-1} onChange={(e) => { void choose(e.target.files?.[0]); e.target.value = ''; }} />
        <p className="text-sm text-slate">Das Foto sehen nur Familienmitglieder. Es wird auf dem Gerät verkleinert, Ortsdaten werden entfernt.</p>
        {message && <p role="status" className="text-sm text-slate">{message}</p>}
      </div>
    </div>
  );
}
