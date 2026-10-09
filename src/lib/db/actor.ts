import type { Role } from '../domain/schemas';

export interface Actor {
  userId: string;
  role: Role;
}

let current: Actor = { userId: 'anonymous', role: 'child' };

/** The acting family member. Defaults to the least-privileged role until a session is established. */
export function setActor(actor: Actor): void {
  current = actor;
}

export function getActor(): Actor {
  return current;
}
