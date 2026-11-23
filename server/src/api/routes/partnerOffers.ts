// SDD IApi: charity partner offers and pickups (US-22, FR-RTE-10, E-RTE-03, E-RTE-04) and the vendor's view of the
// donation pickup. The routes read the request and call the Partner Offer Service; roles are checked by
// protectedRoutes.ts.
import type { RequestHandler } from 'express';
import {
  acceptOffer,
  cancelPickup,
  getOffer,
  listOffers,
  listPickups,
  listingPartnerPickup,
} from '../../services/partner-offer/partnerOfferService.js';
import {
  getAutoCharityOptIn,
  listingAutoOffer,
  setAutoCharityOptIn,
} from '../../services/partner-offer/autoCharityOfferService.js';
import { authOf } from '../middleware/auth.js';

const pickupTimeOf = (body: unknown): unknown =>
  typeof body === 'object' && body !== null ? (body as { pickupTime?: unknown }).pickupTime : undefined;

/** GET /partner/offers */
export const listOffersHandler: RequestHandler = async (_req, res) => {
  res.json(await listOffers(authOf(res).user.id));
};

/** GET /partner/offers/:id */
export const getOfferHandler: RequestHandler = async (req, res) => {
  res.json(await getOffer(authOf(res).user.id, String(req.params.id)));
};

/** POST /partner/offers/:id/accept {pickupTime} */
export const acceptOfferHandler: RequestHandler = async (req, res) => {
  res
    .status(201)
    .json(
      await acceptOffer(authOf(res).user.id, String(req.params.id), { pickupTime: pickupTimeOf(req.body) }),
    );
};

/** GET /partner/pickups */
export const listPickupsHandler: RequestHandler = async (_req, res) => {
  res.json(await listPickups(authOf(res).user.id));
};

/** POST /partner/pickups/:id/cancel */
export const cancelPickupHandler: RequestHandler = async (req, res) => {
  res.json(await cancelPickup(authOf(res).user.id, String(req.params.id)));
};

/** GET /listings/:id/partner-pickup (vendor) */
export const listingPartnerPickupHandler: RequestHandler = async (req, res) => {
  res.json(await listingPartnerPickup(authOf(res).user.id, String(req.params.id)));
};

/** GET /vendors/me/auto-charity (US-23) */
export const getAutoCharityHandler: RequestHandler = async (_req, res) => {
  res.json(await getAutoCharityOptIn(authOf(res).user.id));
};

/** PATCH /vendors/me/auto-charity {optIn} (US-23) */
export const setAutoCharityHandler: RequestHandler = async (req, res) => {
  const optIn =
    typeof req.body === 'object' && req.body !== null ? (req.body as { optIn?: unknown }).optIn : undefined;
  res.json(await setAutoCharityOptIn(authOf(res).user.id, optIn));
};

/** GET /listings/:id/auto-charity (US-23) */
export const listingAutoOfferHandler: RequestHandler = async (req, res) => {
  res.json(await listingAutoOffer(authOf(res).user.id, String(req.params.id)));
};
