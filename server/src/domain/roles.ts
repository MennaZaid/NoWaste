// The four role groups that routes are opened to (NFR-09c, IF-COM-04). Charity, composting and other partners
// (D-31) are one group: they share the partner functions (SDD 6.1).
import type { Role } from '../data/userRepository.js';

export const ROLE_GROUPS = ['consumer', 'vendor', 'partner', 'admin'] as const;
export type RoleGroup = (typeof ROLE_GROUPS)[number];

export function roleGroupOf(role: Role): RoleGroup {
  return role === 'charity' || role === 'composting' || role === 'other' ? 'partner' : role;
}
