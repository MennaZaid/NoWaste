// Every protected route and the role groups it is open to, in one place (IF-COM-04, NFR-09c). Each route is mounted
// behind `authenticate` and `requireRole`, and tests/rbac.test.ts checks every route against every role group, so a
// route added here is covered automatically. Only POST /auth/register, POST /auth/login and GET /health are public.
import type { RequestHandler, Router } from 'express';
import { ROLE_GROUPS, type RoleGroup } from '../../domain/roles.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { decideHandler, listApplicationsHandler } from './admin.js';
import { logoutHandler } from './auth.js';
import { createCardTokenHandler } from './mockBank.js';
import { nearbyOffersHandler, offerHandler, offerPhotoHandler } from './feed.js';
import { categoryHoursHandler } from './perishability.js';
import { getRamadanHandler, setRamadanHandler } from './ramadan.js';
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
import {
  checkInHandler,
  getReservationHandler,
  myReservationsHandler,
  noShowStandingHandler,
  reserveHandler,
} from './reservations.js';
import {
  changePasswordHandler,
  getMeHandler,
  getMyApplicationHandler,
  patchMeHandler,
  sendApplicationAgainHandler,
} from './users.js';
import {
  completePickupHandler,
  listingReservationsHandler,
  verifyPickupHandler,
} from './vendorReservations.js';

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
  // FR-ACC-06 (D-95): every logged-in user may change their password.
  { method: 'post', path: '/users/me/password', roles: EVERYONE, handler: changePasswordHandler },
  // D-105: vendors and partners (any status) see their application and send a rejected one again.
  {
    method: 'get',
    path: '/users/me/application',
    roles: ['vendor', 'partner'],
    handler: getMyApplicationHandler,
  },
  {
    method: 'post',
    path: '/users/me/application',
    roles: ['vendor', 'partner'],
    handler: sendApplicationAgainHandler,
  },
  // D-70: what each perishability category means in hours (BR-01).
  { method: 'get', path: '/perishability/categories', roles: EVERYONE, handler: categoryHoursHandler },
  // US-45 (FR-TGI-08, D-107): consumers read the Ramadan times; the administrator sets them.
  { method: 'get', path: '/ramadan', roles: ['consumer', 'admin'], handler: getRamadanHandler },
  { method: 'patch', path: '/admin/ramadan', roles: ['admin'], handler: setRamadanHandler },
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
  // US-32, US-33 (D-101): the vendor's reservations of a listing and the pickup code at the counter.
  {
    method: 'get',
    path: '/listings/:id/reservations',
    roles: ['vendor'],
    handler: listingReservationsHandler,
  },
  { method: 'post', path: '/listings/:id/pickups/verify', ...APPROVED_VENDOR, handler: verifyPickupHandler },
  {
    method: 'post',
    path: '/listings/:id/pickups/complete',
    ...APPROVED_VENDOR,
    handler: completePickupHandler,
  },
  // US-28, US-30 (SDD C-09): consumers reserve without a card and check in. /no-show-standing before /:id.
  // D-99: the pretend bank's card page (stands in for the payment gateway; the card never reaches NoWaste).
  { method: 'post', path: '/mock-bank/tokens', roles: ['consumer'], handler: createCardTokenHandler },
  { method: 'post', path: '/reservations', roles: ['consumer'], handler: reserveHandler },
  // FR-RES-08 (D-94): the customer's active or past reservations.
  { method: 'get', path: '/reservations', roles: ['consumer'], handler: myReservationsHandler },
  {
    method: 'get',
    path: '/reservations/no-show-standing',
    roles: ['consumer'],
    handler: noShowStandingHandler,
  },
  { method: 'get', path: '/reservations/:id', roles: ['consumer'], handler: getReservationHandler },
  { method: 'post', path: '/reservations/:id/checkin', roles: ['consumer'], handler: checkInHandler },
];

export function mountProtectedRoutes(
  router: Pick<Router, ProtectedRoute['method']>,
  routes: readonly ProtectedRoute[] = protectedRoutes,
): void {
  for (const route of routes) {
    router[route.method](route.path, authenticate, requireRole(route.roles, route), route.handler);
  }
}
