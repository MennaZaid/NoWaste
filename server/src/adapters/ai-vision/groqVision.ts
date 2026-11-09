// C-20 AI Vision Adapter, Groq provider (decision D-85): an open-weight vision model hosted by Groq, called through
// its OpenAI-compatible chat API with the photo as a data URL. The answer is checked by the Listing Service
// (aiDraft.ts), which treats anything malformed as no draft (E-LST-01). The key is GROQ_API_KEY in server/.env.
import { FOOD_CATEGORIES } from '@nowaste/shared';
import type { IVision, VisionPhoto, VisionResult } from './vision.js';

const URL = 'https://api.groq.com/openai/v1/chat/completions';

/** The default model; GROQ_VISION_MODEL changes it when Groq's model list changes. */
export const DEFAULT_GROQ_VISION_MODEL = 'qwen/qwen3.8-27b';

const PROMPT = `You look at a photo of surplus food from a shop or restaurant in Egypt and draft a listing.
Answer with one JSON object only, with these keys:
foodType (short English name of the food),
foodCategory (one of: ${FOOD_CATEGORIES.join(', ')}, or "unknown"),
quantity (estimated number of portions as a whole number, or null),
nameAr (name in Arabic, at most 80 characters), nameEn (name in English, at most 80 characters),
descriptionAr (Arabic description, at most 300 characters), descriptionEn (English description, at most 300 characters),
confidence (0 to 1, how sure you are of foodCategory).
Describe only what is visible. Never say or suggest the food is safe to eat.`;

interface GroqOptions {
  apiKey: string;
  model: string;
  fetchFn?: (url: string, init: RequestInit) => Promise<Response>;
}

export function createGroqVision({ apiKey, model, fetchFn = fetch }: GroqOptions): IVision {
  return {
    async classify(photo: VisionPhoto): Promise<VisionResult> {
      const response = await fetchFn(URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: PROMPT },
                {
                  type: 'image_url',
                  image_url: { url: `data:${photo.type};base64,${photo.data.toString('base64')}` },
                },
              ],
            },
          ],
        }),
      });
      if (!response.ok) throw new Error(`Groq answered ${String(response.status)}`);
      const data = (await response.json()) as { choices?: { message?: { content?: unknown } }[] };
      const content = data.choices?.[0]?.message?.content;
      if (typeof content !== 'string') throw new Error('Groq gave no answer');
      const answer = JSON.parse(content) as Partial<VisionResult>;
      return {
        foodType: answer.foodType as string,
        foodCategory: answer.foodCategory as VisionResult['foodCategory'],
        quantity: answer.quantity ?? null,
        calorieRange: null,
        nameAr: answer.nameAr as string,
        nameEn: answer.nameEn as string,
        descriptionAr: answer.descriptionAr as string,
        descriptionEn: answer.descriptionEn as string,
        confidence: answer.confidence as number,
      };
    },
  };
}
