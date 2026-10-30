// C-02 API Layer: authentication and role checks for protected routes (IF-COM-03, IF-COM-04, NFR-09c).
// The order of the checks: a valid, not ended token (401); a Suspended account (403 E-ACC-06); a role the route
// lists (403 forbidden); for food routes, an Approved vendor or partner (403 E-ACC-05).
import type { RequestHandler, Response } from 'express';
import { authenticate as authenticateToken, type Authenticated } from '../../services/account/authService.js';
import { SrsError } from '../../domain/errors.js';
import { roleGroupOf, type RoleGroup } from '../../domain/roles.js';

export const authenticate: RequestHandler = async (req, res, next) => {
  res.locals.auth = await authenticateToken(req.get('authorization'));
  next();
};

/** The user and session of a request that passed `authenticate`. */
export function authOf(res: Response): Authenticated {
  return res.locals.auth as Authenticated;
}

export interface RoleOptions {
  /** E-ACC-05: posting or receiving food needs an Approved vendor or partner. */
  approvedOnly?: boolean;
  /** The error ID for a vendor or partner that is not Approved: E-ACC-05 by default, E-LST-06 for listings. */
  notApprovedError?: 'E-ACC-05' | 'E-LST-06';
}

export function requireRole(roles: readonly RoleGroup[], options: RoleOptions = {}): RequestHandler {
  return (_req, res, next) => {
    const { user } = authOf(res);
    // E-ACC-06: suspended accounts may not use any protected function.
    if (user.status === 'Suspended') throw new SrsError(403, { error: 'E-ACC-06' });
    const group = roleGroupOf(user.role);
    if (!roles.includes(group)) throw new SrsError(403, { error: 'forbidden' });
    if (options.approvedOnly && (group === 'vendor' || group === 'partner') && user.status !== 'Approved') {
      throw new SrsError(403, { error: options.notApprovedError ?? 'E-ACC-05' });
    }
    next();
  };
}
