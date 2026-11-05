// C-07 Routing & Feed Service, IFeed (SDD 3.2.1): the consumer's nearby offers for the map and the list (FR-RES-01,
// US-26) in the FR-RTE-08 / FR-RTE-09 order, decision D-65. The distance limits come from the settings row FR-RES-01
// (never constants in code). The pickup urgency is the pick-by time (D-61); nothing here says the food is safe.
import { getStorage, type PhotoType } from '../../adapters/storage/storage.js';
import { clock } from '../../domain/clock.js';
import { SrsError } from '../../domain/errors.js';
import { findOffer, findOffersNear, type OfferRecord } from '../../data/offerRepository.js';
import { getSetting } from '../../data/settingsRepository.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface RadiusSettings {
  defaultKm: number;
  minKm: number;
  maxKm: number;
  stepKm: number;
}

/** FR-RES-01 from the settings table; throws when the row is missing or not sensible. */
async function readRadiusSettings(): Promise<RadiusSettings> {
  const value = (await getSetting('FR-RES-01'))?.value as Record<string, unknown> | null | undefined;
  const [defaultKm, minKm, maxKm, stepKm] = [
    value?.default_radius_km,
    value?.min_radius_km,
    value?.max_radius_km,
    value?.step_km,
  ];
  if (
    typeof defaultKm !== 'number' ||
    typeof minKm !== 'number' ||
    typeof maxKm !== 'number' ||
    typeof stepKm !== 'number' ||
    !(minKm > 0 && minKm <= defaultKm && defaultKm <= maxKm && stepKm > 0)
  ) {
    throw new Error('Settings row FR-RES-01 is missing or invalid');
  }
  return { defaultKm, minKm, maxKm, stepKm };
}

export interface OfferView {
  id: string;
  nameAr: string | null;
  nameEn: string | null;
  descriptionAr: string | null;
  descriptionEn: string | null;
  sourceLanguage: 'ar' | 'en' | null;
  foodType: string | null;
  foodCategory: string;
  isQuickPost: boolean;
  bagsAvailable: number;
  originalValue: number | null;
  price: number;
  pickupStart: string;
  pickupEnd: string;
  // D-73: no perishability category for customers; the pickup window says when to come.
  distanceMeters: number | null;
  /** Where the food is picked up; offers with the same key are one pin on the map. */
  place: {
    key: string;
    branchId: string | null;
    shopName: string;
    branchName: string;
    address: string;
    latitude: number;
    longitude: number;
  };
}

function toView(offer: OfferRecord): OfferView {
  return {
    id: offer.id,
    nameAr: offer.nameAr,
    nameEn: offer.nameEn,
    descriptionAr: offer.descriptionAr,
    descriptionEn: offer.descriptionEn,
    sourceLanguage: offer.sourceLanguage,
    foodType: offer.foodType,
    foodCategory: offer.foodCategory ?? 'unknown',
    isQuickPost: offer.isQuickPost,
    bagsAvailable: offer.bagsAvailable,
    originalValue: offer.originalValue,
    price: offer.price,
    pickupStart: offer.pickupStart.toISOString(),
    pickupEnd: offer.pickupEnd.toISOString(),
    distanceMeters: offer.distanceMeters === null ? null : Math.round(offer.distanceMeters),
    place: {
      // A listing made before branches (D-64) is placed at its vendor's shop.
      key: offer.branchId ?? offer.vendorId,
      branchId: offer.branchId,
      shopName: offer.shopName,
      branchName: offer.branchName,
      address: offer.address,
      latitude: offer.latitude,
      longitude: offer.longitude,
    },
  };
}

/** A query value as a number, or undefined when it is missing; NaN when it is there but not a number. */
function numberParam(value: unknown): number | undefined {
  if (value === undefined || value === '') return undefined;
  return typeof value === 'string' ? Number(value) : Number.NaN;
}

/**
 * GET /listings/nearby?latitude&longitude&radiusKm (FR-RES-01). Without radiusKm the FR-RES-01 default is used.
 * 400 `{"error":"invalid_search","fields":[...]}` for a missing or out-of-range location or distance.
 */
export async function nearbyOffers(query: {
  latitude?: unknown;
  longitude?: unknown;
  radiusKm?: unknown;
}): Promise<{ radius: RadiusSettings & { km: number }; offers: OfferView[] }> {
  const settings = await readRadiusSettings();
  const latitude = numberParam(query.latitude);
  const longitude = numberParam(query.longitude);
  const radiusKm = numberParam(query.radiusKm) ?? settings.defaultKm;
  const fields: string[] = [];
  if (latitude === undefined || !(latitude >= -90 && latitude <= 90)) fields.push('latitude');
  if (longitude === undefined || !(longitude >= -180 && longitude <= 180)) fields.push('longitude');
  if (!(radiusKm >= settings.minKm && radiusKm <= settings.maxKm)) fields.push('radiusKm');
  if (fields.length > 0 || latitude === undefined || longitude === undefined) {
    throw new SrsError(400, { error: 'invalid_search', fields });
  }
  const offers = await findOffersNear({ latitude, longitude }, radiusKm * 1000, clock.now());
  return { radius: { ...settings, km: radiusKm }, offers: offers.map(toView) };
}

async function visibleOffer(id: string): Promise<OfferRecord> {
  const offer = UUID.test(id) ? await findOffer(id, clock.now()) : undefined;
  if (offer === undefined) throw new SrsError(404, { error: 'not_found' });
  return offer;
}

/** GET /listings/nearby/:id: the product page of an offer that a consumer can still buy. */
export async function getOffer(id: string): Promise<OfferView> {
  return toView(await visibleOffer(id));
}

/** GET /listings/nearby/:id/photo: the photo of an offer that a consumer can still buy. */
export async function getOfferPhoto(id: string): Promise<{ data: Buffer; type: PhotoType }> {
  const photo = await getStorage().read((await visibleOffer(id)).photoKey);
  if (photo === undefined) throw new SrsError(404, { error: 'not_found' });
  return photo;
}
