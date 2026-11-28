// SDD IApi: reservation routes (US-28, US-30). The routes read the request and call the C-09 Reservation Service;
// the consumer role is checked by protectedRoutes.ts.
import type { RequestHandler } from 'express';
import {
  cancel,
  checkIn,
  getNoShowStanding,
  getReservation,
  myReservations,
  reserve,
} from '../../services/reservation/reservationService.js';
import { decline, join, leave, myEntries } from '../../services/waitlist/waitlistService.js';
import { authOf } from '../middleware/auth.js';

const bodyOf = (body: unknown): Record<string, unknown> =>
  typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};

/** POST /reservations {listingId, method: "no-card", idempotencyKey?} */
export const reserveHandler: RequestHandler = async (req, res) => {
  const result = await reserve(authOf(res).user.id, bodyOf(req.body));
  res.status(result.created ? 201 : 200).json(result.reservation);
};

/** GET /reservations/no-show-standing */
export const noShowStandingHandler: RequestHandler = async (_req, res) => {
  res.json(await getNoShowStanding(authOf(res).user.id));
};

/** GET /reservations/:id */
export const getReservationHandler: RequestHandler = async (req, res) => {
  res.json(await getReservation(authOf(res).user.id, String(req.params.id)));
};

/** POST /reservations/:id/checkin */
export const checkInHandler: RequestHandler = async (req, res) => {
  res.json(await checkIn(authOf(res).user.id, String(req.params.id)));
};

/** GET /reservations?scope=active|past */
export const myReservationsHandler: RequestHandler = async (req, res) => {
  res.json(await myReservations(authOf(res).user.id, req.query.scope));
};

/** POST /reservations/:id/cancel (US-35, FR-RES-12) */
export const cancelReservationHandler: RequestHandler = async (req, res) => {
  res.json(await cancel(authOf(res).user.id, String(req.params.id)));
};

/** POST /listings/nearby/:id/waitlist (US-29, FR-RES-06) */
export const joinWaitlistHandler: RequestHandler = async (req, res) => {
  res.status(201).json(await join(authOf(res).user.id, String(req.params.id)));
};

/** GET /waitlist (US-29) */
export const myWaitlistHandler: RequestHandler = async (_req, res) => {
  res.json(await myEntries(authOf(res).user.id));
};

/** POST /waitlist/:id/leave (US-29, D-119) */
export const leaveWaitlistHandler: RequestHandler = async (req, res) => {
  res.json(await leave(authOf(res).user.id, String(req.params.id)));
};

/** POST /waitlist/:id/decline (US-29, D-119) */
export const declineWaitlistHandler: RequestHandler = async (req, res) => {
  res.json(await decline(authOf(res).user.id, String(req.params.id)));
};
