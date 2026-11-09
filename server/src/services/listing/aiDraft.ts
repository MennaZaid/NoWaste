// US-12 AI draft listing, part of the C-05 Listing Service (SDD 3.2.5.2): asks the AI Vision Adapter for a draft
// after the photo upload, within the BR-12 limit (E-LST-01, NFR-02); keeps it so the server knows which fields the
// AI filled (NFR-05b, D-81) and whether its category is uncertain (NFR-05d, D-80).
import { FOOD_CATEGORIES, TEXT_LIMITS, type FoodCategory, type ListingFoodCategory } from '@nowaste/shared';
import { getVision, type VisionPhoto, type VisionResult } from '../../adapters/ai-vision/vision.js';
import { findAiDraft, saveAiDraft } from '../../data/aiDraftRepository.js';
import { getSetting } from '../../data/settingsRepository.js';
import { SrsError } from '../../domain/errors.js';

/** The draft as the API returns it. Every value is a Draft or an Estimate for the vendor to confirm (NFR-05a). */
export interface AiDraft {
  foodType: string;
  foodCategory: FoodCategory | 'unknown';
  quantity: number | null;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
  confidence: number;
}

/** The listing fields an AI draft can fill (D-81). */
export const AI_FIELDS = ['name', 'description', 'secondName', 'secondDescription', 'foodCategory'] as const;
export type AiField = (typeof AI_FIELDS)[number];

async function settingNumber(key: string, name: string): Promise<number> {
  const value = ((await getSetting(key))?.value as Record<string, unknown> | null | undefined)?.[name];
  if (typeof value !== 'number' || value < 0) throw new Error(`Settings row ${key} is missing or invalid`);
  return value;
}

const text = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.trim().length > 0 && Array.from(value.trim()).length <= max;

/** Only a complete, well-formed answer is a draft; anything else is treated like a failed call (E-LST-01). */
function toDraft(result: VisionResult): AiDraft | null {
  const category = result.foodCategory as string;
  const quantity = result.quantity;
  const ok =
    text(result.foodType, TEXT_LIMITS.name) &&
    (category === 'unknown' || (FOOD_CATEGORIES as readonly string[]).includes(category)) &&
    (quantity === null || (Number.isInteger(quantity) && quantity > 0)) &&
    text(result.nameAr, TEXT_LIMITS.name) &&
    text(result.nameEn, TEXT_LIMITS.name) &&
    text(result.descriptionAr, TEXT_LIMITS.description) &&
    text(result.descriptionEn, TEXT_LIMITS.description) &&
    typeof result.confidence === 'number' &&
    result.confidence >= 0 &&
    result.confidence <= 1;
  if (!ok) return null;
  return {
    foodType: result.foodType.trim(),
    foodCategory: result.foodCategory,
    quantity,
    nameAr: result.nameAr.trim(),
    nameEn: result.nameEn.trim(),
    descriptionAr: result.descriptionAr.trim(),
    descriptionEn: result.descriptionEn.trim(),
    confidence: result.confidence,
  };
}

function withinLimit<T>(work: Promise<T>, milliseconds: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error('AI draft time limit (BR-12)'));
    }, milliseconds);
  });
  return Promise.race([work, timeout]).finally(() => {
    clearTimeout(timer);
  });
}

/**
 * FR-LST-03: the draft for an uploaded photo, or E-LST-01 when the AI fails, is off, answers badly or takes longer
 * than BR-12. The photo is kept either way (NFR-03).
 */
export async function draftForPhoto(
  photoKey: string,
  photo: VisionPhoto,
): Promise<{ draft: AiDraft | null; draftError?: 'E-LST-01' }> {
  const seconds = await settingNumber('BR-12', 'ai_draft_time_limit_seconds');
  let draft: AiDraft | null = null;
  try {
    draft = toDraft(await withinLimit(getVision().classify(photo), seconds * 1000));
  } catch {
    draft = null;
  }
  if (draft === null) return { draft: null, draftError: 'E-LST-01' };
  await saveAiDraft(photoKey, draft);
  return { draft };
}

/** The draft kept for a photo, if the AI gave one. */
export async function draftOf(photoKey: string): Promise<AiDraft | undefined> {
  return (await findAiDraft(photoKey)) as AiDraft | undefined;
}

/** Reads `confirmedAiFields` from the request: a list of AI field names (missing = none). */
export function parseConfirmed(value: unknown): AiField[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every((f) => (AI_FIELDS as readonly unknown[]).includes(f))) {
    throw new SrsError(400, { error: 'E-LST-04', fields: ['confirmedAiFields'] });
  }
  return value as AiField[];
}

/**
 * NFR-05b (D-81): with a draft, the form starts filled with it, so the name, description, any second-language text
 * and a known category are AI-filled; each must be confirmed or edited (the app sends edited fields as confirmed).
 */
export function checkConfirmed(
  draft: AiDraft | undefined,
  listing: { secondName: string | null; secondDescription: string | null },
  confirmed: AiField[],
): void {
  if (draft === undefined) return;
  const filled = AI_FIELDS.filter(
    (field) =>
      (field !== 'secondName' || listing.secondName !== null) &&
      (field !== 'secondDescription' || listing.secondDescription !== null) &&
      (field !== 'foodCategory' || draft.foodCategory !== 'unknown'),
  );
  const unconfirmed = filled.filter((field) => !confirmed.includes(field));
  if (unconfirmed.length > 0) {
    throw new SrsError(400, { error: 'E-LST-04', fields: unconfirmed, unconfirmedAi: true });
  }
}

/**
 * NFR-05d (D-80): the category is uncertain when it is the AI's (the vendor kept the draft category) and the AI's
 * confidence is below the AI-CONFIDENCE setting. A category the vendor chose or changed is confident (D-54).
 */
export async function isAiConfident(
  draft: AiDraft | undefined,
  foodCategory: ListingFoodCategory,
): Promise<boolean> {
  if (draft === undefined || draft.foodCategory === 'unknown' || draft.foodCategory !== foodCategory)
    return true;
  return draft.confidence >= (await settingNumber('AI-CONFIDENCE', 'min_confidence'));
}
