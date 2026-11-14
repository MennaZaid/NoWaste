// SDD IApi: listing and shop routes (US-10, US-11, US-13, D-63, D-64, D-66). The routes read the body and call the Listing
// Service; roles and approval (E-LST-06) are checked by protectedRoutes.ts.
import express, { type RequestHandler } from 'express';
import { PHOTO_MAX_BYTES } from '@nowaste/shared';
import {
  addBranch,
  createListing,
  createQuickPost,
  previewPickBy,
  updateBranchHours,
  getListing,
  getListingPhoto,
  getMyListings,
  getShop,
  publishListing,
  updateOpeningHours,
  uploadPhoto,
} from '../../services/listing/listingService.js';
import { estimateListing } from '../../services/perishability/perishabilityService.js';
import { chooseDestination, getDestinations, markUnfit } from '../../services/routing/routingService.js';
import { SrsError } from '../../domain/errors.js';
import { authOf } from '../middleware/auth.js';

function bodyOf(body: unknown): Record<string, unknown> {
  return typeof body === 'object' && body !== null && !Buffer.isBuffer(body)
    ? (body as Record<string, unknown>)
    : {};
}

// Reads the raw photo bytes. The parser stops a little above the limit, so a very large upload is cut short and
// answered 413 by the service instead of being read in full.
const readPhoto = express.raw({ type: () => true, limit: PHOTO_MAX_BYTES + 1024 });

/**
 * POST /listings/photo: the body is the JPEG or PNG file itself. Returns 201 {photoKey}. With ?draft=1 (the vendor
 * tapped "Fill in with AI draft", D-84, D-86) it also returns {draft, draftError?} (US-12).
 */
export const uploadPhotoHandler: RequestHandler = (req, res, next) => {
  readPhoto(req, res, (error?: unknown) => {
    if (error !== undefined) {
      const tooLarge = (error as { type?: string }).type === 'entity.too.large';
      next(tooLarge ? new SrsError(413, { error: 'E-LST-04', fields: ['photo'] }) : error);
      return;
    }
    const data = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    uploadPhoto(data, req.get('content-type')?.split(';')[0]?.trim(), req.query.draft === '1')
      .then((result) => res.status(201).json(result))
      .catch(next);
  });
};

/** POST /listings: a full listing saved as a Draft (D-63, D-64: no pickup end, preparation time or expiry). */
export const createListingHandler: RequestHandler = async (req, res) => {
  const b = bodyOf(req.body);
  const listing = await createListing(authOf(res).user.id, {
    photoKey: b.photoKey,
    name: b.name,
    description: b.description,
    language: b.language,
    foodCategory: b.foodCategory,
    storage: b.storage,
    bagsTotal: b.bagsTotal,
    originalValue: b.originalValue,
    price: b.price,
    pickupStart: b.pickupStart,
    pickupEnd: b.pickupEnd,
    branchId: b.branchId,
    // US-12 (D-81): the other-language text from an AI draft and the AI fields the vendor confirmed or edited.
    secondName: b.secondName,
    secondDescription: b.secondDescription,
    confirmedAiFields: b.confirmedAiFields,
  });
  res.status(201).json(listing);
};

/** POST /listings/pick-by: the pick-by time a listing would get (D-64), shown in the form before saving. */
export const previewPickByHandler: RequestHandler = async (req, res) => {
  const { foodCategory, storage, pickupStart, branchId, photoKey } = bodyOf(req.body);
  res.json(
    await previewPickBy(authOf(res).user.id, { foodCategory, storage, pickupStart, branchId, photoKey }),
  );
};

/**
 * POST /listings/quick: photo, name, description, optional food category (D-68), bags, price, optional pickup start
 * (D-75) and pickup end time. D-86: optionally the other-language text from an AI draft and the confirmed AI fields.
 */
export const createQuickPostHandler: RequestHandler = async (req, res) => {
  const {
    photoKey,
    name,
    description,
    language,
    foodCategory,
    bagsTotal,
    price,
    pickupStart,
    pickupEnd,
    secondName,
    secondDescription,
    confirmedAiFields,
  } = bodyOf(req.body);
  res.status(201).json(
    await createQuickPost(authOf(res).user.id, {
      photoKey,
      name,
      description,
      language,
      // D-68: optional.
      foodCategory,
      bagsTotal,
      price,
      // D-75: optional; without it the pickup starts now.
      pickupStart,
      pickupEnd,
      // D-86 (US-12 for Quick Post): optional, like the full listing (D-81).
      secondName,
      secondDescription,
      confirmedAiFields,
    }),
  );
};

/** POST /vendors/me/branches: adds a branch (D-64). */
export const addBranchHandler: RequestHandler = async (req, res) => {
  const { name, address, latitude, longitude, opensAt, closesAt } = bodyOf(req.body);
  res
    .status(201)
    .json(await addBranch(authOf(res).user.id, { name, address, latitude, longitude, opensAt, closesAt }));
};

/** PATCH /vendors/me/branches/:id {opensAt, closesAt}: a branch's opening hours (D-64). */
export const updateBranchHoursHandler: RequestHandler = async (req, res) => {
  const { opensAt, closesAt } = bodyOf(req.body);
  res.json(await updateBranchHours(authOf(res).user.id, String(req.params.id), { opensAt, closesAt }));
};

export const getListingHandler: RequestHandler = async (req, res) => {
  res.json(await getListing(authOf(res).user.id, String(req.params.id)));
};

/** GET /listings: the vendor's own listings, newest first (US-15, FR-LST-06). */
export const getMyListingsHandler: RequestHandler = async (_req, res) => {
  res.json(await getMyListings(authOf(res).user.id));
};

/** GET /listings/:id/photo: the photo file of the vendor's own listing. */
export const getListingPhotoHandler: RequestHandler = async (req, res) => {
  const photo = await getListingPhoto(authOf(res).user.id, String(req.params.id));
  res.type(photo.type).send(photo.data);
};

export const publishListingHandler: RequestHandler = async (req, res) => {
  res.json(await publishListing(authOf(res).user.id, String(req.params.id)));
};

/** POST /listings/:id/perishability/estimate (US-18, FR-RTE-01, FR-RTE-02, E-RTE-01). */
export const estimatePerishabilityHandler: RequestHandler = async (req, res) => {
  res.json(await estimateListing(authOf(res).user.id, String(req.params.id)));
};

/** GET /listings/:id/destinations (US-19, FR-RTE-05, FR-RTE-07, E-RTE-02). */
export const getDestinationsHandler: RequestHandler = async (req, res) => {
  res.json(await getDestinations(authOf(res).user.id, String(req.params.id)));
};

/** POST /listings/:id/destination {destination} (US-19, FR-RTE-06). */
export const chooseDestinationHandler: RequestHandler = async (req, res) => {
  res.json(await chooseDestination(authOf(res).user.id, String(req.params.id), bodyOf(req.body).destination));
};

/** POST /listings/:id/unfit {unfitForPeople} (US-19, FR-RTE-07). */
export const markUnfitHandler: RequestHandler = async (req, res) => {
  res.json(await markUnfit(authOf(res).user.id, String(req.params.id), bodyOf(req.body).unfitForPeople));
};

/** PATCH /vendors/me {opensAt, closesAt}: the shop's opening hours (D-62). */
export const updateShopHandler: RequestHandler = async (req, res) => {
  const { opensAt, closesAt } = bodyOf(req.body);
  res.json(await updateOpeningHours(authOf(res).user.id, { opensAt, closesAt }));
};

/** GET /vendors/me: the shop details the listing form needs (pickup pin, Quick Post for informal vendors). */
export const getShopHandler: RequestHandler = async (_req, res) => {
  res.json(await getShop(authOf(res).user.id));
};
