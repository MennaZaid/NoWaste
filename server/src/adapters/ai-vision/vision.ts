// C-20 AI Vision Adapter (SDD 3.2.1, IVision): classify(photo) → food type, food category, estimated quantity,
// calorie range, draft text in Arabic and English and a confidence (FR-LST-03). Services use only IVision.
// The provider is not chosen yet (SRS TBD-2, SDD: chosen on the labelled photo set), so Sprint 2 has two modes
// (decision D-80): "mock" returns a fixed draft so the whole flow can be built and tested, "off" behaves like an
// unavailable AI service (E-LST-01, NFR-03). Groq is the first real provider (D-85, groqVision.ts).
// The 10-second limit (BR-12) is applied by the Listing Service, not here, so every provider gets the same limit.
import type { FoodCategory } from '@nowaste/shared';
import { createGroqVision, DEFAULT_GROQ_VISION_MODEL } from './groqVision.js';

export interface VisionPhoto {
  data: Buffer;
  type: 'image/jpeg' | 'image/png';
}

export interface VisionResult {
  foodType: string;
  foodCategory: FoodCategory | 'unknown';
  /** Estimated quantity (portions); shown to the vendor as an Estimate only (D-82). null when not estimated. */
  quantity: number | null;
  /** Estimated calorie range; not used before US-38. */
  calorieRange: { min: number; max: number } | null;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
  /** 0 to 1. Below the AI-CONFIDENCE setting the category counts as uncertain (NFR-05d, D-80). */
  confidence: number;
}

export interface IVision {
  /** Rejects when the service fails or is unavailable. */
  classify(photo: VisionPhoto): Promise<VisionResult>;
}

/** Mock mode: always the same draft, so the app and the tests can use the draft flow without a provider. */
export function createMockVision(): IVision {
  return {
    classify: () =>
      Promise.resolve({
        foodType: 'Koshari',
        foodCategory: 'cooked_meals',
        quantity: 4,
        calorieRange: null,
        nameAr: 'كشري',
        nameEn: 'Koshari',
        descriptionAr: 'كشري بالعدس والأرز والمكرونة والبصل المقرمش',
        descriptionEn: 'Koshari with lentils, rice, pasta and crispy onions',
        confidence: 0.9,
      }),
  };
}

/** Off mode: the AI service is unavailable; the vendor fills the form by hand (E-LST-01). */
export function createOffVision(): IVision {
  return { classify: () => Promise.reject(new Error('AI vision is off (AI_VISION_MODE)')) };
}

let vision: IVision | undefined;

/**
 * The adapter the services use: AI_VISION_MODE=groq with GROQ_API_KEY gives Groq (D-85), mock gives the mock, anything
 * else (default) is off.
 */
export function getVision(): IVision {
  vision ??= chooseVision();
  return vision;
}

function chooseVision(): IVision {
  const mode = process.env.AI_VISION_MODE;
  const apiKey = process.env.GROQ_API_KEY;
  if (mode === 'groq' && apiKey !== undefined && apiKey !== '') {
    const model = process.env.GROQ_VISION_MODEL;
    return createGroqVision({
      apiKey,
      model: model !== undefined && model !== '' ? model : DEFAULT_GROQ_VISION_MODEL,
    });
  }
  return mode === 'mock' ? createMockVision() : createOffVision();
}

/** Replaces the adapter (tests, or a real provider later). */
export function setVision(replacement: IVision): void {
  vision = replacement;
}
