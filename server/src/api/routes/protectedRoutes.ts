// Every protected route and the role groups it is open to, in one place (IF-COM-04, NFR-09c). Each route is mounted
// behind `authenticate` and `requireRole`, and tests/rbac.test.ts checks every route against every role group, so a
// route added here is covered automatically. Only POST /auth/register, POST /auth/login and GET /health are public.
import type { RequestHandler, Router } from 'express';
import { ROLE_GROUPS, type RoleGroup } from '../../domain/roles.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { decideHandler, listApplicationsHandler } from './admin.js';
import { logoutHandler } from './auth.js';
import { nearbyOffersHandler, offerHandler, offerPhotoHandler } from './feed.js';
import { categoryHoursHandler } from './perishability.js';
import {
  addBranchHandler,
  chooseDestinationHandler,
  createListingHandler,
  estimatePerishabilityHandler,
  getDestinationsHandler,
  markUnfitHandler,
  previewPickByHandler,
  updateBranchHoursHandler,
  createQuickPostHandler,
  getListingHandler,
  getListingPhotoHandler,
  getMyListingsHandler,
  getShopHandler,
  publishListingHandler,
  updateShopHandler,
  uploadPhotoHandler,
} from './listings.js';
import { getMeHandler, patchMeHandler } from './users.js';

export interface ProtectedRoute {
  method: 'get' | 'post' | 'patch' | 'delete';
  path: string;
  roles: readonly RoleGroup[];
  /** E-ACC-05: only Approved vendors and partners (posting or receiving food). */
  approvedOnly?: boolean;
  notApprovedError?: 'E-ACC-05' | 'E-LST-06';
  handler: RequestHandler;
}

// E-LST-06: a vendor whose account is not Approved may not create or publish a listing.
const APPROVED_VENDOR = { roles: ['vendor'], approvedOnly: true, notApprovedError: 'E-LST-06' } as const;

const EVERYONE = ROLE_GROUPS;

export const protectedRoutes: readonly ProtectedRoute[] = [
  { method: 'post', path: '/auth/logout', roles: EVERYONE, handler: logoutHandler },
  { method: 'get', path: '/users/me', roles: EVERYONE, handler: getMeHandler },
  { method: 'patch', path: '/users/me', roles: EVERYONE, handler: patchMeHandler },
  // D-70: what each perishability category means in hours (BR-01).
  { method: 'get', path: '/perishability/categories', roles: EVERYONE, handler: categoryHoursHandler },
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
  // US-10, US-11, US-13 (SDD C-05).
  { method: 'get', path: '/vendors/me', roles: ['vendor'], handler: getShopHandler },
  // D-62: the vendor sets the shop's opening hours.
  { method: 'patch', path: '/vendors/me', roles: ['vendor'], handler: updateShopHandler },
  // D-64: the vendor's branches.
  { method: 'post', path: '/vendors/me/branches', roles: ['vendor'], handler: addBranchHandler },
  { method: 'patch', path: '/vendors/me/branches/:id', roles: ['vendor'], handler: updateBranchHoursHandler },
  { method: 'post', path: '/listings/pick-by', ...APPROVED_VENDOR, handler: previewPickByHandler },
  { method: 'post', path: '/listings/photo', ...APPROVED_VENDOR, handler: uploadPhotoHandler },
  { method: 'post', path: '/listings/quick', ...APPROVED_VENDOR, handler: createQuickPostHandler },
  { method: 'post', path: '/listings', ...APPROVED_VENDOR, handler: createListingHandler },
  // US-26 (FR-RES-01, D-65): consumers browse offers near them. Before /listings/:id, which would match "nearby".
  { method: 'get', path: '/listings/nearby', roles: ['consumer'], handler: nearbyOffersHandler },
  { method: 'get', path: '/listings/nearby/:id', roles: ['consumer'], handler: offerHandler },
  { method: 'get', path: '/listings/nearby/:id/photo', roles: ['consumer'], handler: offerPhotoHandler },
  { method: 'get', path: '/listings/:id', roles: ['vendor'], handler: getListingHandler },
  // US-15 (FR-LST-06) and the listing photo: a vendor sees only their own listings.
  { method: 'get', path: '/listings', roles: ['vendor'], handler: getMyListingsHandler },
  { method: 'get', path: '/listings/:id/photo', roles: ['vendor'], handler: getListingPhotoHandler },
  // US-18 (SDD C-06) and US-19 (SDD C-07): only Approved vendors change a listing before publishing (E-LST-06).
  {
    method: 'post',
    path: '/listings/:id/perishability/estimate',
    ...APPROVED_VENDOR,
    handler: estimatePerishabilityHandler,
  },
  { method: 'get', path: '/listings/:id/destinations', ...APPROVED_VENDOR, handler: getDestinationsHandler },
  {
    method: 'post',
    path: '/listings/:id/destination',
    ...APPROVED_VENDOR,
    handler: chooseDestinationHandler,
  },
  { method: 'post', path: '/listings/:id/unfit', ...APPROVED_VENDOR, handler: markUnfitHandler },
  { method: 'post', path: '/listings/:id/publish', ...APPROVED_VENDOR, handler: publishListingHandler },
];

export function mountProtectedRoutes(
  router: Pick<Router, ProtectedRoute['method']>,
  routes: readonly ProtectedRoute[] = protectedRoutes,
): void {
  for (const route of routes) {
    router[route.method](route.path, authenticate, requireRole(route.roles, route), route.handler);
  }
}
