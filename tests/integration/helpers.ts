import { setActor } from '@/lib/db/actor';
import { DEMO_USERS } from '@/lib/db/demo-data';
import { resetDatabasesForTests } from '@/lib/db/local';
import { seedDemoData } from '@/lib/db/seed';
import { setSimulatedOffline } from '@/lib/offline/network';

let counter = 0;

/** Fresh seeded local + simulated-server databases, acting as the owner, online. */
export async function freshWorld(role: 'owner' | 'adult' | 'member' | 'child' = 'owner', userId: string = DEMO_USERS.ownerA) {
  counter += 1;
  resetDatabasesForTests(`t${counter}-${Math.random().toString(36).slice(2, 8)}`);
  setSimulatedOffline(false);
  await seedDemoData();
  setActor({ userId, role });
}
