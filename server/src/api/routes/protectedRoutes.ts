// Every protected route and the role groups it is open to, in one place (IF-COM-04, NFR-09c). Each route is mounted
// behind `authenticate` and `requireRole`, and tests/rbac.test.ts checks every route against every role group, so a
// route added here is covered automatically. Only POST /auth/register, POST /auth/login and GET /health are public.
import type { RequestHandler, Router } from 'express';
import { ROLE_GROUPS, type RoleGroup } from '../../domain/roles.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { decideHandler, listApplicationsHandler } from './admin.js';
import { logoutHandler } from './auth.js';
import { getMeHandler, patchMeHandler } from './users.js';

export interface ProtectedRoute {
  method: 'get' | 'post' | 'patch' | 'delete';
  path: string;
  roles: readonly RoleGroup[];
  /** E-ACC-05: only Approved vendors and partners (posting or receiving food). */
  approvedOnly?: boolean;
  handler: RequestHandler;
}

const EVERYONE = ROLE_GROUPS;

export const protectedRoutes: readonly ProtectedRoute[] = [
  { method: 'post', path: '/auth/logout', roles: EVERYONE, handler: logoutHandler },
  { method: 'get', path: '/users/me', roles: EVERYONE, handler: getMeHandler },
  { method: 'patch', path: '/users/me', roles: EVERYONE, handler: patchMeHandler },
  { method: 'get', path: '/admin/applications', roles: ['admin'], handler: listApplicationsHandler },
  {
    method: 'post',
    path: '/admin/applications/:userId/approve',
    roles: ['admin'],
    handler: decideHandler('approve'),
  },
  {
    method: 'post',
    path: '/admin/applications/:userId/reject',
    roles: ['admin'],
    handler: decideHandler('reject'),
  },
];

export function mountProtectedRoutes(
  router: Pick<Router, ProtectedRoute['method']>,
  routes: readonly ProtectedRoute[] = protectedRoutes,
): void {
  for (const route of routes) {
    router[route.method](route.path, authenticate, requireRole(route.roles, route), route.handler);
  }
}
