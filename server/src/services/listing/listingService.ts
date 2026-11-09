// C-05 Listing Service: create listings (US-10, FR-LST-01), Quick Posts (US-11, FR-LST-02), the photo upload (C-26,
// NFR-08a) and publishing. US-12 (D-80 to D-83): the photo upload also asks the AI for a draft (aiDraft.ts); without
// one the vendor writes the listing by hand (E-LST-01, NFR-03).
// D-66 (2026-11-03, replaces the translation of D-63): the name and description are stored exactly as the vendor wrote
// them, in the language they are written in; nothing is translated. D-64: a listing is picked up at one of the vendor's branches; preparation time and expiry are no longer
// asked; the pick-by time is worked out from the rules (pickup start + shelf-life) and capped at the branch's closing
// time. Full listings are for formal vendors; informal vendors use Quick Post.
// Only Approved vendors reach these functions (E-LST-06, checked by the API layer).
import {
  validateBranch,
  validateListing,
  validateOpeningHours,
  validateQuickPost,
  type Language,
  type ListingInput,
} from '@nowaste/shared';
import { getStorage, type PhotoType } from '../../adapters/storage/storage.js';
import { SrsError } from '../../domain/errors.js';
import { clock } from '../../domain/clock.js';
import { estimate, pickBy, type PerishabilityCategory } from '../../domain/perishability.js';
import { getSetting } from '../../data/settingsRepository.js';
import { openingPeriodFor } from '../../domain/openingHours.js';
import { rulesFor } from '../perishability/thresholds.js';
import {
  checkConfirmed,
  draftForPhoto,
  draftOf,
  isAiConfident,
  parseConfirmed,
  type AiDraft,
} from './aiDraft.js';
import {
  findVendorBranch,
  findVendorBranches,
  insertBranch,
  saveBranchHours,
  type BranchRecord,
} from '../../data/branchRepository.js';
import {
  activateDraft,
  findShopDetails,
  saveOpeningHours,
  findVendorListing,
  findVendorListings,
  insertListing,
  type ListingRecord,
  type ShopDetails,
} from '../../data/listingRepository.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The listing as the API returns it. Unknown values are "unknown"; values never asked are null. */
export interface ListingView {
  id: string;
  status: ListingRecord['status'];
  listingType: ListingRecord['listingType'];
  isQuickPost: boolean;
  foodType: string | null;
  foodCategory: string;
  photoKey: string;
  /** D-66: the name and description as written, under the language they are written in (the other is null). */
  nameAr: string | null;
  nameEn: string | null;
  descriptionAr: string | null;
  descriptionEn: string | null;
  sourceLanguage: Language | null;
  /** D-64: the branch where the food is picked up. */
  branchId: string | null;
  calorieMin: number | null;
  calorieMax: number | null;
  bagsTotal: number;
  bagsAvailable: number;
  originalValue: number | null;
  price: number;
  pickupStart: string;
  /** The pick-by time (D-64). */
  pickupEnd: string;
  storage: string | null;
  perishabilityCategory: ListingRecord['perishabilityCategory'];
  /** How soon to collect (FR-RTE-04, D-61): the pick-by time. null until a category is confirmed. */
  urgency: Urgency | null;
  unfitForPeople: boolean;
  latitude: number;
  longitude: number;
}

function toView(listing: ListingRecord, urgency: Urgency | null): ListingView {
  return {
    id: listing.id,
    status: listing.status,
    listingType: listing.listingType,
    isQuickPost: listing.isQuickPost,
    foodType: listing.foodType,
    foodCategory: listing.foodCategory ?? 'unknown',
    photoKey: listing.photoKey,
    nameAr: listing.nameAr,
    nameEn: listing.nameEn,
    descriptionAr: listing.descriptionAr,
    descriptionEn: listing.descriptionEn,
    sourceLanguage: listing.sourceLanguage,
    branchId: listing.branchId,
    calorieMin: listing.calorieMin,
    calorieMax: listing.calorieMax,
    bagsTotal: listing.bagsTotal,
    bagsAvailable: listing.bagsAvailable,
    originalValue: listing.originalValue,
    price: listing.price,
    pickupStart: listing.pickupStart.toISOString(),
    pickupEnd: listing.pickupEnd.toISOString(),
    storage: listing.storage,
    perishabilityCategory: listing.perishabilityCategory,
    urgency,
    unfitForPeople: listing.unfitForPeople,
    latitude: listing.latitude,
    longitude: listing.longitude,
  };
}

/** D-61: the deadline shown with the category, "Collect by" the pick-by time. */
export interface Urgency {
  collectBy: string;
}

export function urgencyOf(listing: ListingRecord): Urgency {
  return { collectBy: listing.pickupEnd.toISOString() };
}

/** The listing as the API returns it, with the collect-by time once its category is confirmed. */
export function present(listing: ListingRecord): Promise<ListingView> {
  return Promise.resolve(toView(listing, listing.perishabilityCategory === null ? null : urgencyOf(listing)));
}

/** The time zone of opening hours (settings row LOCAL-TIME, D-62). */
async function localTimeZone(): Promise<string> {
  const value = (await getSetting('LOCAL-TIME'))?.value as { time_zone?: unknown } | null | undefined;
  if (typeof value?.time_zone !== 'string') throw new Error('Settings row LOCAL-TIME is missing');
  return value.time_zone;
}

/**
 * D-62 / D-64: the opening period of the branch that contains `start`. A branch without hours (registered before they
 * were required) cannot be used: 409 opening_hours_required. When the branch is closed at `start`, 400 E-LST-04 on
 * `field` with the branch hours.
 */
async function openingPeriod(
  branch: BranchRecord,
  start: Date,
  field: 'pickupStart' | 'pickupEnd',
): Promise<{ opens: Date; closes: Date; hours: { opensAt: string; closesAt: string } }> {
  if (branch.opensAt === null || branch.closesAt === null) {
    throw new SrsError(409, { error: 'opening_hours_required' });
  }
  const hours = { opensAt: branch.opensAt, closesAt: branch.closesAt };
  const period = openingPeriodFor(start, hours, await localTimeZone());
  if (period === null) throw new SrsError(400, { error: 'E-LST-04', fields: [field], ...hours });
  return { ...period, hours };
}

/**
 * D-66: the listing text as the vendor wrote it, stored under its language. D-81: the other language holds the
 * accepted or edited AI draft text when there is one, otherwise it stays empty.
 */
function asWritten(
  text: { name: string; description: string; secondName?: string | null; secondDescription?: string | null },
  language: Language,
) {
  const pick = (lang: Language, field: 'name' | 'description') =>
    lang === language ? text[field] : ((field === 'name' ? text.secondName : text.secondDescription) ?? null);
  return {
    nameAr: pick('ar', 'name'),
    nameEn: pick('en', 'name'),
    descriptionAr: pick('ar', 'description'),
    descriptionEn: pick('en', 'description'),
    sourceLanguage: language,
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
): Promise<{ photoKey: string; draft: AiDraft | null; draftError?: 'E-LST-01' }> {
  if (data.length > (await maxPhotoBytes())) {
    throw new SrsError(413, { error: 'E-LST-04', fields: ['photo'] });
  }
  let type: PhotoType;
  if (contentType === 'image/jpeg' && startsWith(data, JPEG)) type = 'image/jpeg';
  else if (contentType === 'image/png' && startsWith(data, PNG)) type = 'image/png';
  else throw invalidPhoto();
  const photoKey = await getStorage().save(data, type);
  // US-12 FR-LST-03: the AI draft, or E-LST-01 (the vendor fills the form by hand).
  return { photoKey, ...(await draftForPhoto(photoKey, { data, type })) };
}

async function shopOf(vendorId: string): Promise<ShopDetails> {
  const shop = await findShopDetails(vendorId);
  if (shop === undefined) throw new Error('No vendor profile for this vendor');
  return shop;
}

/** GET /vendors/me: the shop details and its branches (D-64), for the listing forms. */
export async function getShop(vendorId: string): Promise<ShopDetails & { branches: BranchRecord[] }> {
  return { ...(await shopOf(vendorId)), branches: await findVendorBranches(vendorId) };
}

/** PATCH /vendors/me {opensAt, closesAt} (D-62): saves the main branch's opening hours; they cannot be removed. */
export async function updateOpeningHours(
  vendorId: string,
  input: { opensAt?: unknown; closesAt?: unknown },
): Promise<ShopDetails & { branches: BranchRecord[] }> {
  const check = validateOpeningHours(input);
  if (!check.ok) throw new SrsError(400, { error: 'E-ACC-02', fields: check.fields });
  const shop = await saveOpeningHours(vendorId, check.value);
  if (shop === undefined) throw new Error('No vendor profile for this vendor');
  return { ...shop, branches: await findVendorBranches(vendorId) };
}

/** POST /vendors/me/branches (D-64): adds a branch with its pin and opening hours. */
export async function addBranch(vendorId: string, input: unknown): Promise<BranchRecord> {
  const check = validateBranch(input);
  if (!check.ok) throw new SrsError(400, { error: 'E-ACC-02', fields: check.fields });
  // D-69: every branch carries the store name.
  const shop = await shopOf(vendorId);
  return insertBranch(vendorId, { ...check.value, name: shop.shopName });
}

/** PATCH /vendors/me/branches/:id {opensAt, closesAt} (D-64): a branch's opening hours. */
export async function updateBranchHours(
  vendorId: string,
  id: string,
  input: { opensAt?: unknown; closesAt?: unknown },
): Promise<BranchRecord> {
  const check = validateOpeningHours(input);
  if (!check.ok) throw new SrsError(400, { error: 'E-ACC-02', fields: check.fields });
  const branch = UUID.test(id) ? await saveBranchHours(vendorId, id, check.value) : undefined;
  if (branch === undefined) throw new SrsError(404, { error: 'not_found' });
  return branch;
}

async function checkPhotoKey(photoKey: string): Promise<void> {
  if (!(await getStorage().exists(photoKey))) {
    throw new SrsError(400, { error: 'E-LST-04', fields: ['photoKey'] });
  }
}

async function ownBranch(vendorId: string, branchId: unknown): Promise<BranchRecord> {
  const branch =
    typeof branchId === 'string' && UUID.test(branchId)
      ? await findVendorBranch(vendorId, branchId)
      : undefined;
  if (branch === undefined) throw new SrsError(400, { error: 'E-LST-04', fields: ['branchId'] });
  return branch;
}

/** Full listings are for formal vendors (D-64); informal vendors use Quick Post. */
async function formalOnly(vendorId: string): Promise<void> {
  if ((await shopOf(vendorId)).vendorType !== 'formal') {
    throw new SrsError(403, { error: 'full_listing_formal_only' });
  }
}

/**
 * D-64: the pick-by time for a listing that starts at `pickupStart` at `branch`: the pickup start + the shelf-life of
 * the food category and storage (or + the BR-01 Highly perishable hours when that is unknown), never later than the
 * closing time of the branch's opening period. Also checks that the branch is open at the pickup start.
 */
async function workOutPickBy(
  branch: BranchRecord,
  facts: { foodCategory: string; storage: string; pickupStart: Date; aiConfident: boolean },
): Promise<{ pickupEnd: Date; closesAt: Date; category: PerishabilityCategory }> {
  const period = await openingPeriod(branch, facts.pickupStart, 'pickupStart');
  const { input, rules } = await rulesFor({
    foodCategory: facts.foodCategory === 'unknown' ? null : (facts.foodCategory as never),
    storage: facts.storage === 'unknown' ? null : (facts.storage as never),
    pickupStart: facts.pickupStart,
    isQuickPost: false,
    aiConfident: facts.aiConfident,
  });
  return {
    pickupEnd: pickBy(input, rules, period.closes),
    closesAt: period.closes,
    // D-70: the estimated category (FR-RTE-01) is set when the listing is saved.
    category: estimate(input, rules).category,
  };
}

/**
 * POST /listings/pick-by {foodCategory, storage, pickupStart, branchId} (D-64): the pick-by time the form shows before
 * saving, worked out exactly as when the listing is saved.
 */
export async function previewPickBy(
  vendorId: string,
  input: {
    foodCategory?: unknown;
    storage?: unknown;
    pickupStart?: unknown;
    branchId?: unknown;
    /** US-12: the uploaded photo, so an uncertain AI category gives the same answer as saving (NFR-05d). */
    photoKey?: unknown;
  },
): Promise<{
  pickupEnd: string;
  closesAt: string;
  cappedAtClosing: boolean;
  category: PerishabilityCategory;
}> {
  const check = validateListing({
    photoKey: 'preview',
    name: 'preview',
    description: 'preview',
    language: 'en',
    bagsTotal: 1,
    originalValue: 1,
    price: 1,
    foodCategory: input.foodCategory,
    storage: input.storage,
    pickupStart: input.pickupStart,
    branchId: input.branchId,
  });
  if (!check.ok) {
    const fields = check.fields.filter((f) =>
      ['foodCategory', 'storage', 'pickupStart', 'branchId'].includes(f),
    );
    throw new SrsError(400, { error: 'E-LST-04', fields });
  }
  const branch = await ownBranch(vendorId, check.value.branchId);
  const draft = typeof input.photoKey === 'string' ? await draftOf(input.photoKey) : undefined;
  const { pickupEnd, closesAt, category } = await workOutPickBy(branch, {
    foodCategory: check.value.foodCategory,
    storage: check.value.storage,
    pickupStart: new Date(check.value.pickupStart),
    aiConfident: await isAiConfident(draft, check.value.foodCategory),
  });
  return {
    pickupEnd: pickupEnd.toISOString(),
    closesAt: closesAt.toISOString(),
    cappedAtClosing: pickupEnd.getTime() === closesAt.getTime(),
    // D-74: shown to the vendor as the reason for the allowed pickup window.
    category,
  };
}

/**
 * POST /listings: a full listing, saved as a Draft (FR-LST-01, FR-LST-04 as changed by D-64, E-LST-04). Formal
 * vendors only. The pickup location is the chosen branch and the pick-by time is worked out by the server.
 */
export async function createListing(
  vendorId: string,
  input: ListingInput & { confirmedAiFields?: unknown },
): Promise<ListingView> {
  const check = validateListing(input);
  if (!check.ok) throw new SrsError(400, { error: 'E-LST-04', fields: check.fields });
  const listing = check.value;
  const confirmed = parseConfirmed(input.confirmedAiFields);
  await formalOnly(vendorId);
  await checkPhotoKey(listing.photoKey);
  // US-12: NFR-05b every AI-filled field confirmed; NFR-05d an uncertain AI category is Highly perishable.
  const draft = await draftOf(listing.photoKey);
  checkConfirmed(draft, listing, confirmed);
  const branch = await ownBranch(vendorId, listing.branchId);
  const pickupStart = new Date(listing.pickupStart);
  const { pickupEnd: limit, category } = await workOutPickBy(branch, {
    foodCategory: listing.foodCategory,
    storage: listing.storage,
    pickupStart,
    aiConfident: await isAiConfident(draft, listing.foodCategory),
  });
  // D-69: the vendor may end the pickup earlier than the worked-out limit, never later (E-LST-03).
  const chosen = listing.pickupEnd === null ? null : new Date(listing.pickupEnd);
  if (chosen !== null && chosen.getTime() > limit.getTime()) {
    throw new SrsError(400, { error: 'E-LST-03', field: 'pickupEnd', latestPickupEnd: limit.toISOString() });
  }
  const pickupEnd = chosen ?? limit;
  const text = asWritten(listing, listing.language);
  const created = await insertListing({
    vendorId,
    // D-70: the estimate is set now; the vendor may make it more urgent (FR-RTE-03). The destination (US-19) is
    // chosen before publishing.
    listingType: null,
    perishabilityCategory: category,
    status: 'Draft',
    isQuickPost: false,
    // The name as written; the SDD food_type column keeps it for older screens and reports.
    foodType: listing.name,
    foodCategory: listing.foodCategory === 'unknown' ? null : listing.foodCategory,
    photoKey: listing.photoKey,
    ...text,
    bagsTotal: listing.bagsTotal,
    originalValue: listing.originalValue,
    price: listing.price,
    pickupStart,
    pickupEnd,
    prepTime: null,
    storage: listing.storage,
    expiryAt: null,
    location: { latitude: branch.latitude, longitude: branch.longitude },
    branchId: branch.id,
  });
  return present(created);
}

/**
 * POST /listings/quick (FR-LST-02, with name and description since D-63, D-66): informal vendors only. Photo, name,
 * description, bags, price and pickup end time. The pickup starts at the time of posting (decision D-43) at the main
 * branch, must be inside its opening hours, and ends within the BR-01 Highly perishable hours (D-61); the listing is
 * a Discounted Surplus Bag that is always Highly perishable (FR-RTE-02) and is published at once (SRS 4.2.2).
 */
export async function createQuickPost(
  vendorId: string,
  input: {
    photoKey?: unknown;
    name?: unknown;
    description?: unknown;
    language?: unknown;
    foodCategory?: unknown;
    bagsTotal?: unknown;
    price?: unknown;
    pickupStart?: unknown;
    pickupEnd?: unknown;
  },
): Promise<ListingView> {
  const check = validateQuickPost(input, clock.now());
  if (!check.ok) throw new SrsError(400, { error: 'E-LST-04', fields: check.fields });
  // Checked after the fields, so a formal vendor sending an empty form also learns what Quick Post needs.
  const shop = await shopOf(vendorId);
  if (shop.vendorType !== 'informal') {
    throw new SrsError(403, { error: 'quick_post_informal_only' });
  }
  const post = check.value;
  await checkPhotoKey(post.photoKey);
  const [main] = await findVendorBranches(vendorId);
  if (main === undefined) throw new Error('No branch for this vendor');
  const pickupStart = new Date(post.pickupStart);
  const pickupEnd = new Date(post.pickupEnd);
  // D-75: the shop must be open when the pickup starts (now, or the start the vendor chose).
  const period = await openingPeriod(main, pickupStart, 'pickupStart');
  const { input: facts, rules } = await rulesFor({
    foodCategory: null,
    storage: null,
    pickupStart,
    isQuickPost: true,
  });
  const latest = pickBy(facts, rules, period.closes);
  if (pickupEnd.getTime() > latest.getTime()) {
    // Ends after closing time: the hours; otherwise after the Highly perishable hours: the latest end (D-61).
    throw latest.getTime() === period.closes.getTime()
      ? new SrsError(400, { error: 'E-LST-04', fields: ['pickupEnd'], ...period.hours })
      : new SrsError(400, { error: 'E-LST-03', field: 'pickupEnd', latestPickupEnd: latest.toISOString() });
  }
  const text = asWritten(post, post.language);
  const created = await insertListing({
    vendorId,
    listingType: 'Discounted Surplus Bag',
    perishabilityCategory: 'Highly perishable',
    status: 'Active',
    isQuickPost: true,
    foodType: post.name,
    // D-68: the optional food category, so that matching partners can be offered the Quick Post.
    foodCategory: post.foodCategory === 'unknown' ? null : post.foodCategory,
    photoKey: post.photoKey,
    ...text,
    bagsTotal: post.bagsTotal,
    originalValue: null,
    price: post.price,
    pickupStart,
    pickupEnd,
    prepTime: null,
    storage: null,
    expiryAt: null,
    location: { latitude: main.latitude, longitude: main.longitude },
    branchId: main.id,
  });
  return present(created);
}

/** The vendor's own listing, or 404 (another vendor's listing and a malformed id are not found either). */
export async function ownListing(vendorId: string, id: string): Promise<ListingRecord> {
  const listing = UUID.test(id) ? await findVendorListing(vendorId, id) : undefined;
  if (listing === undefined) throw new SrsError(404, { error: 'not_found' });
  return listing;
}

/** GET /listings/:id: only the vendor's own listing. */
export async function getListing(vendorId: string, id: string): Promise<ListingView> {
  return present(await ownListing(vendorId, id));
}

/**
 * GET /listings (US-15, FR-LST-06): the vendor's active and previous listings, newest first. Reservations are added
 * to this view when they exist (Sprint 2).
 */
export async function getMyListings(vendorId: string): Promise<ListingView[]> {
  return Promise.all((await findVendorListings(vendorId)).map(present));
}

/** GET /listings/:id/photo: the photo of the vendor's own listing (C-26). */
export async function getListingPhoto(
  vendorId: string,
  id: string,
): Promise<{ data: Buffer; type: PhotoType }> {
  const photo = await getStorage().read((await ownListing(vendorId, id)).photoKey);
  if (photo === undefined) throw new SrsError(404, { error: 'not_found' });
  return photo;
}

/**
 * POST /listings/:id/publish: Draft → Active after every check passes. This is the one place where a listing is
 * published. Turn 5: the vendor must first confirm the perishability category (US-18, FR-RTE-03) and choose the
 * destination that sets listing_type (US-19, FR-RTE-06); otherwise 409 lists what is missing.
 */
export async function publishListing(vendorId: string, id: string): Promise<ListingView> {
  const listing = await ownListing(vendorId, id);
  if (listing.status !== 'Draft')
    throw new SrsError(409, { error: 'listing_not_draft', status: listing.status });
  const missing = [
    ...(listing.perishabilityCategory === null ? ['perishabilityCategory'] : []),
    ...(listing.listingType === null ? ['destination'] : []),
  ];
  if (missing.length > 0) throw new SrsError(409, { error: 'not_ready_to_publish', missing });
  // The fields were checked when the Draft was saved (validateListing) and the table enforces the same rules.
  const published = await activateDraft(vendorId, id);
  if (published === undefined) {
    const now = await ownListing(vendorId, id);
    throw new SrsError(409, { error: 'listing_not_draft', status: now.status });
  }
  return present(published);
}
