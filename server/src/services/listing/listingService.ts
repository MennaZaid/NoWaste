// C-05 Listing Service: create listings (US-10, FR-LST-01), Quick Posts (US-11, FR-LST-02) with preparation time,
// storage and expiry (US-13, FR-LST-04), the photo upload (C-26, NFR-08a) and publishing.
// Sprint 1 has no AI: the vendor types food type, category and both descriptions, which is the manual path of
// E-LST-01 and NFR-03. The AI draft (US-12) fills the same fields in Sprint 2.
// Only Approved vendors reach these functions (E-LST-06, checked by the API layer).
import { validateListing, validateQuickPost, type ListingInput, type ValidListing } from '@nowaste/shared';
import { getStorage, type PhotoType } from '../../adapters/storage/storage.js';
import { SrsError } from '../../domain/errors.js';
import { clock } from '../../domain/clock.js';
import { getSetting } from '../../data/settingsRepository.js';
import {
  activateDraft,
  findShopDetails,
  findVendorListing,
  insertListing,
  type ListingRecord,
  type ShopDetails,
} from '../../data/listingRepository.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The listing as the API returns it. Unknown values are "unknown"; values never asked (Quick Post) are null. */
export interface ListingView {
  id: string;
  status: ListingRecord['status'];
  listingType: ListingRecord['listingType'];
  isQuickPost: boolean;
  foodType: string | null;
  foodCategory: string;
  photoKey: string;
  descriptionAr: string | null;
  descriptionEn: string | null;
  calorieMin: number | null;
  calorieMax: number | null;
  bagsTotal: number;
  bagsAvailable: number;
  originalValue: number | null;
  price: number;
  pickupStart: string;
  pickupEnd: string;
  prepTime: string | null;
  storage: string | null;
  expiryAt: string | null;
  perishabilityCategory: ListingRecord['perishabilityCategory'];
  unfitForPeople: boolean;
  latitude: number;
  longitude: number;
}

function toView(listing: ListingRecord): ListingView {
  const asked = !listing.isQuickPost;
  const timeOrUnknown = (time: Date | null) =>
    time === null ? (asked ? 'unknown' : null) : time.toISOString();
  return {
    id: listing.id,
    status: listing.status,
    listingType: listing.listingType,
    isQuickPost: listing.isQuickPost,
    foodType: listing.foodType,
    foodCategory: listing.foodCategory ?? 'unknown',
    photoKey: listing.photoKey,
    descriptionAr: listing.descriptionAr,
    descriptionEn: listing.descriptionEn,
    calorieMin: listing.calorieMin,
    calorieMax: listing.calorieMax,
    bagsTotal: listing.bagsTotal,
    bagsAvailable: listing.bagsAvailable,
    originalValue: listing.originalValue,
    price: listing.price,
    pickupStart: listing.pickupStart.toISOString(),
    pickupEnd: listing.pickupEnd.toISOString(),
    prepTime: timeOrUnknown(listing.prepTime),
    storage: listing.storage,
    expiryAt: timeOrUnknown(listing.expiryAt),
    perishabilityCategory: listing.perishabilityCategory,
    unfitForPeople: listing.unfitForPeople,
    latitude: listing.latitude,
    longitude: listing.longitude,
  };
}

const JPEG = [0xff, 0xd8, 0xff];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function startsWith(data: Buffer, magic: number[]): boolean {
  return data.length >= magic.length && magic.every((byte, i) => data[i] === byte);
}

const invalidPhoto = () => new SrsError(400, { error: 'E-LST-04', fields: ['photo'] });

/** The NFR-08a limit from the settings table. */
async function maxPhotoBytes(): Promise<number> {
  const setting = await getSetting('NFR-08a');
  const value = (setting?.value as { max_photo_bytes?: unknown } | null)?.max_photo_bytes;
  if (typeof value !== 'number') throw new Error('Settings row NFR-08a is missing');
  return value;
}

/**
 * POST /listings/photo. NFR-08a: the app compresses the photo; the server still refuses anything over the limit
 * (413). Only JPEG and PNG pictures are kept (checked by their first bytes, not only by the declared type).
 */
export async function uploadPhoto(
  data: Buffer,
  contentType: string | undefined,
): Promise<{ photoKey: string }> {
  if (data.length > (await maxPhotoBytes())) {
    throw new SrsError(413, { error: 'E-LST-04', fields: ['photo'] });
  }
  let type: PhotoType;
  if (contentType === 'image/jpeg' && startsWith(data, JPEG)) type = 'image/jpeg';
  else if (contentType === 'image/png' && startsWith(data, PNG)) type = 'image/png';
  else throw invalidPhoto();
  return { photoKey: await getStorage().save(data, type) };
}

async function shopOf(vendorId: string): Promise<ShopDetails> {
  const shop = await findShopDetails(vendorId);
  if (shop === undefined) throw new Error('No vendor profile for this vendor');
  return shop;
}

/** GET /vendors/me: the shop name, type and pin, for the listing form. */
export function getShop(vendorId: string): Promise<ShopDetails> {
  return shopOf(vendorId);
}

async function checkPhotoKey(photoKey: string): Promise<void> {
  if (!(await getStorage().exists(photoKey))) {
    throw new SrsError(400, { error: 'E-LST-04', fields: ['photoKey'] });
  }
}

/** POST /listings: a full listing, saved as a Draft (FR-LST-01, FR-LST-04, E-LST-03, E-LST-04). */
export async function createListing(vendorId: string, input: ListingInput): Promise<ListingView> {
  const check = validateListing(input);
  if (!check.ok) {
    throw new SrsError(
      400,
      check.error === 'E-LST-03'
        ? { error: 'E-LST-03', field: check.field }
        : { error: 'E-LST-04', fields: check.fields },
    );
  }
  const listing: ValidListing = check.value;
  await checkPhotoKey(listing.photoKey);
  const created = await insertListing({
    vendorId,
    // Set in turn 5 (US-18 perishability, US-19 destination) before publishing.
    listingType: null,
    perishabilityCategory: null,
    status: 'Draft',
    isQuickPost: false,
    foodType: listing.foodType,
    foodCategory: listing.foodCategory === 'unknown' ? null : listing.foodCategory,
    photoKey: listing.photoKey,
    descriptionAr: listing.descriptionAr,
    descriptionEn: listing.descriptionEn,
    bagsTotal: listing.bagsTotal,
    originalValue: listing.originalValue,
    price: listing.price,
    pickupStart: new Date(listing.pickupStart),
    pickupEnd: new Date(listing.pickupEnd),
    prepTime: listing.prepTime === null ? null : new Date(listing.prepTime),
    storage: listing.storage,
    expiryAt: listing.expiryAt === null ? null : new Date(listing.expiryAt),
    location: listing.location,
  });
  return toView(created);
}

/**
 * POST /listings/quick (FR-LST-02): informal vendors only. Only the photo, bags, price and pickup end time are read.
 * The pickup starts at the time of posting (decision D-43) at the shop pin; the listing is a Discounted Surplus Bag
 * that is always Highly perishable (FR-LST-02, FR-RTE-02, SDD 3.2.2) and is published at once, as SRS 4.2.2 says.
 */
export async function createQuickPost(
  vendorId: string,
  input: { photoKey?: unknown; bagsTotal?: unknown; price?: unknown; pickupEnd?: unknown },
): Promise<ListingView> {
  const check = validateQuickPost(input, clock.now());
  if (!check.ok) throw new SrsError(400, { error: 'E-LST-04', fields: check.fields });
  // Checked after the fields, so a formal vendor sending an empty form also learns what Quick Post needs.
  if ((await shopOf(vendorId)).vendorType !== 'informal') {
    throw new SrsError(403, { error: 'quick_post_informal_only' });
  }
  const post = check.value;
  await checkPhotoKey(post.photoKey);
  const created = await insertListing({
    vendorId,
    listingType: 'Discounted Surplus Bag',
    perishabilityCategory: 'Highly perishable',
    status: 'Active',
    isQuickPost: true,
    foodType: null,
    foodCategory: null,
    photoKey: post.photoKey,
    descriptionAr: null,
    descriptionEn: null,
    bagsTotal: post.bagsTotal,
    originalValue: null,
    price: post.price,
    pickupStart: new Date(post.pickupStart),
    pickupEnd: new Date(post.pickupEnd),
    prepTime: null,
    storage: null,
    expiryAt: null,
    location: null,
  });
  return toView(created);
}

async function ownListing(vendorId: string, id: string): Promise<ListingRecord> {
  const listing = UUID.test(id) ? await findVendorListing(vendorId, id) : undefined;
  if (listing === undefined) throw new SrsError(404, { error: 'not_found' });
  return listing;
}

/** GET /listings/:id: only the vendor's own listing. */
export async function getListing(vendorId: string, id: string): Promise<ListingView> {
  return toView(await ownListing(vendorId, id));
}

/**
 * POST /listings/:id/publish: Draft → Active after every check passes. This is the one place where a listing is
 * published, so turn 5 adds its steps here: the vendor's perishability confirmation (US-18, FR-RTE-03) and the
 * destination that sets listing_type (US-19, FR-RTE-06). Until then listing_type and perishability_category stay
 * NULL on full listings, and listings published in turn 4 are test data only.
 */
export async function publishListing(vendorId: string, id: string): Promise<ListingView> {
  const listing = await ownListing(vendorId, id);
  if (listing.status !== 'Draft')
    throw new SrsError(409, { error: 'listing_not_draft', status: listing.status });
  // The fields were checked when the Draft was saved (validateListing) and the table enforces the same rules.
  const published = await activateDraft(vendorId, id);
  if (published === undefined) {
    const now = await ownListing(vendorId, id);
    throw new SrsError(409, { error: 'listing_not_draft', status: now.status });
  }
  return toView(published);
}
