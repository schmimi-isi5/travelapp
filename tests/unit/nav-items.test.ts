import { describe, expect, it } from 'vitest';
import { MORE_NAV, SIDEBAR_NAV, visibleFor } from '@/components/nav-items';

describe('navigation by role', () => {
  it('shows the mailbox to owners and adults only', () => {
    expect(visibleFor(SIDEBAR_NAV, 'owner').some((i) => i.href === '/mailbox')).toBe(true);
    expect(visibleFor(SIDEBAR_NAV, 'adult').some((i) => i.href === '/mailbox')).toBe(true);
    for (const role of ['member', 'child'] as const) {
      expect(visibleFor(SIDEBAR_NAV, role).some((i) => i.href === '/mailbox'), role).toBe(false);
      expect(visibleFor(MORE_NAV, role).some((i) => i.href === '/mailbox'), role).toBe(false);
    }
  });
});
