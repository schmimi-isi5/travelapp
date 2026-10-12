import type { Member } from '@/lib/domain/schemas';
import { readableTextColor } from '@/lib/formatting';

/** Two letters for the avatar: first letters of the first two words, or the first two letters of a single word. */
export function initials(name: string): string {
  const words = name.replace('Demo-', '').split(/[\s._-]+/).filter(Boolean);
  const letters = words.length >= 2 ? `${words[0]![0]}${words[1]![0]}` : (words[0] ?? '?').slice(0, 2);
  return letters.toUpperCase();
}

/** Round avatar: the person's own photo when there is one, otherwise their initials on the avatar colour. */
export function MemberAvatar({ member, size = 40, className = '' }: { member: Pick<Member, 'display_name' | 'avatar_color' | 'avatar_data'>; size?: number; className?: string }) {
  if (member.avatar_data) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={member.avatar_data} alt={member.display_name} width={size} height={size} className={`shrink-0 rounded-full object-cover ${className}`} style={{ width: size, height: size }} />;
  }
  return (
    <span className={`grid shrink-0 place-items-center rounded-full text-xs font-bold ${className}`} style={{ width: size, height: size, background: member.avatar_color, color: readableTextColor(member.avatar_color) }}>
      <span aria-hidden>{initials(member.display_name)}</span>
      <span className="sr-only">{member.display_name}</span>
    </span>
  );
}
