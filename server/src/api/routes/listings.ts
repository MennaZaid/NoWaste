// SDD IApi: listing routes (US-10, US-11, US-13). The routes read the body and call the Listing Service; roles and
// approval (E-LST-06) are checked by protectedRoutes.ts.
import express, { type RequestHandler } from 'express';
import { PHOTO_MAX_BYTES } from '@nowaste/shared';
import {
  createListing,
  createQuickPost,
  getListing,
  getListingPhoto,
  getMyListings,
  getShop,
  publishListing,
  uploadPhoto,
} from '../../services/listing/listingService.js';
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

/** POST /listings/photo: the body is the JPEG or PNG file itself. Returns 201 {photoKey}. */
export const uploadPhotoHandler: RequestHandler = (req, res, next) => {
  readPhoto(req, res, (error?: unknown) => {
    if (error !== undefined) {
      const tooLarge = (error as { type?: string }).type === 'entity.too.large';
      next(tooLarge ? new SrsError(413, { error: 'E-LST-04', fields: ['photo'] }) : error);
      return;
    }
    const data = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    uploadPhoto(data, req.get('content-type')?.split(';')[0]?.trim())
      .then((result) => res.status(201).json(result))
      .catch(next);
  });
};

/** POST /listings: a full listing saved as a Draft. */
export const createListingHandler: RequestHandler = async (req, res) => {
  const b = bodyOf(req.body);
  const listing = await createListing(authOf(res).user.id, {
    photoKey: b.photoKey,
    foodType: b.foodType,
    foodCategory: b.foodCategory,
    descriptionAr: b.descriptionAr,
    descriptionEn: b.descriptionEn,
    bagsTotal: b.bagsTotal,
    originalValue: b.originalValue,
    price: b.price,
    pickupStart: b.pickupStart,
    pickupEnd: b.pickupEnd,
    prepTime: b.prepTime,
    storage: b.storage,
    expiryAt: b.expiryAt,
    location: b.location,
  });
  res.status(201).json(listing);
};

/** POST /listings/quick: only photo, bags, price and pickup end time are read (FR-LST-02). */
export const createQuickPostHandler: RequestHandler = async (req, res) => {
  const { photoKey, bagsTotal, price, pickupEnd } = bodyOf(req.body);
  res.status(201).json(await createQuickPost(authOf(res).user.id, { photoKey, bagsTotal, price, pickupEnd }));
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

/** GET /vendors/me: the shop details the listing form needs (pickup pin, Quick Post for informal vendors). */
export const getShopHandler: RequestHandler = async (_req, res) => {
  res.json(await getShop(authOf(res).user.id));
};
