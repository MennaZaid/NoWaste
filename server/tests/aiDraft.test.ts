// US-12 AI draft listing (SDD C-20 AI Vision Adapter behind IVision, C-05 Listing Service, C-06 Perishability).
// Tests come from FR-LST-03, E-LST-01, NFR-02 / BR-12 (10-second limit), NFR-03 (AI optional), NFR-05b (every
// AI-filled field confirmed) and NFR-05d (uncertain AI estimate = Highly perishable). Decisions D-80 to D-83.
// The vision provider is not chosen yet (TBD-2), so the tests replace the adapter with fakes through setVision.
import request from 'supertest';
import { createApp } from '../src/api/app.js';
import { closePool } from '../src/data/db.js';
import { clock } from '../src/domain/clock.js';
import {
  createMockVision,
  setVision,
  type IVision,
  type VisionResult,
} from '../src/adapters/ai-vision/vision.js';
import { deleteAllUsers, readListingRow, readSettingValue, setSettingValue } from './helpers/database.js';
import { createVendor, jpeg, listingBody, post } from './helpers/listings.js';

const app = createApp();
const NOW = new Date('2026-11-01T10:00:00.000Z');
const realNow = clock.now;
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000).toISOString();

const DRAFT: VisionResult = {
  foodType: 'Koshari',
  foodCategory: 'cooked_meals',
  quantity: 4,
  calorieRange: null,
  nameAr: 'كشري',
  nameEn: 'Koshari',
  descriptionAr: 'كشري طازج بالبصل المقرمش',
  descriptionEn: 'Fresh koshari with crispy onions',
  confidence: 0.9,
};

const visionReturning = (result: VisionResult): IVision => ({ classify: () => Promise.resolve(result) });

function upload(token: string) {
  return request(app)
    .post('/listings/photo')
    .set('Authorization', `Bearer ${token}`)
    .set('Content-Type', 'image/jpeg')
    .send(jpeg());
}

/** Uploads a photo with `vision` in place and returns the response body. */
async function uploadWith(token: string, vision: IVision) {
  setVision(vision);
  const response = await upload(token);
  expect(response.status).toBe(201);
  return response.body as { photoKey: string; draft: Record<string, unknown> | null; draftError?: string };
}

const ALL_TEXT_FIELDS = ['name', 'description', 'secondName', 'secondDescription', 'foodCategory'];

let formal: { id: string; token: string };
let savedLimit: unknown;
let savedConfidence: unknown;

beforeAll(async () => {
  await deleteAllUsers();
  formal = await createVendor(app, 'formal');
  savedLimit = await readSettingValue('BR-12');
  savedConfidence = await readSettingValue('AI-CONFIDENCE');
  // Restoring a missing row would write null over it.
  if (savedLimit == null || savedConfidence == null) throw new Error('BR-12 or AI-CONFIDENCE row is missing');
});

beforeEach(() => {
  clock.now = () => NOW;
});

afterEach(async () => {
  clock.now = realNow;
  setVision(createMockVision());
  await setSettingValue('BR-12', savedLimit);
  await setSettingValue('AI-CONFIDENCE', savedConfidence);
});

afterAll(async () => {
  await deleteAllUsers();
  await closePool();
});

describe('FR-LST-03 the AI drafts a listing from the photo', () => {
  test('FR-LST-03 the photo upload returns a draft: food type, category, quantity and Arabic and English text', async () => {
    const body = await uploadWith(formal.token, visionReturning(DRAFT));

    expect(body.photoKey).toEqual(expect.any(String));
    expect(body.draft).toEqual({
      foodType: 'Koshari',
      foodCategory: 'cooked_meals',
      quantity: 4,
      nameAr: 'كشري',
      nameEn: 'Koshari',
      descriptionAr: 'كشري طازج بالبصل المقرمش',
      descriptionEn: 'Fresh koshari with crispy onions',
      confidence: 0.9,
    });
  });

  test('FR-LST-03 the mock adapter (no provider chosen, TBD-2) gives a draft so the flow can be tested', async () => {
    const body = await uploadWith(formal.token, createMockVision());

    expect(typeof body.draft?.foodCategory).toBe('string');
    expect(typeof body.draft?.nameAr).toBe('string');
  });

  test('FR-LST-03 D-81 the vendor accepts the draft: both languages are stored', async () => {
    const { photoKey } = await uploadWith(formal.token, visionReturning(DRAFT));
    const body = await listingBody(app, formal.token, at, {
      photoKey,
      name: 'Koshari',
      description: 'Fresh koshari with crispy onions',
      language: 'en',
      secondName: 'كشري',
      secondDescription: 'كشري طازج بالبصل المقرمش',
      confirmedAiFields: ALL_TEXT_FIELDS,
    });

    const created = await post(app, '/listings', formal.token, body);

    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      nameEn: 'Koshari',
      descriptionEn: 'Fresh koshari with crispy onions',
      nameAr: 'كشري',
      descriptionAr: 'كشري طازج بالبصل المقرمش',
      sourceLanguage: 'en',
    });
  });

  test('FR-LST-03 the vendor edits a draft field: the edited value is stored', async () => {
    const { photoKey } = await uploadWith(formal.token, visionReturning(DRAFT));
    const body = await listingBody(app, formal.token, at, {
      photoKey,
      name: 'Koshari with extra lentils',
      secondName: 'كشري بعدس زيادة',
      secondDescription: 'كشري طازج',
      confirmedAiFields: ALL_TEXT_FIELDS,
    });

    const created = await post(app, '/listings', formal.token, body);

    expect(created.status).toBe(201);
    const row = await readListingRow((created.body as { id: string }).id);
    expect(row).toMatchObject({ name_en: 'Koshari with extra lentils', name_ar: 'كشري بعدس زيادة' });
  });

  test('E-LST-04 D-81 a second-language name over 80 characters is refused', async () => {
    const body = await listingBody(app, formal.token, at, { secondName: 'ك'.repeat(81) });

    const created = await post(app, '/listings', formal.token, body);

    expect(created.status).toBe(400);
    expect(created.body).toEqual({ error: 'E-LST-04', fields: ['secondName'] });
  });
});

describe('E-LST-01 NFR-03 when the AI fails or is too slow, the vendor fills the form by hand', () => {
  test('E-LST-01 the AI call fails: the photo is kept and there is no draft', async () => {
    const body = await uploadWith(formal.token, { classify: () => Promise.reject(new Error('down')) });

    expect(body.photoKey).toEqual(expect.any(String));
    expect(body.draft).toBeNull();
    expect(body.draftError).toBe('E-LST-01');
  });

  test('E-LST-01 BR-12 the AI takes longer than the limit in settings: no draft', async () => {
    await setSettingValue('BR-12', { ai_draft_time_limit_seconds: 0.05 });
    const slow: IVision = {
      classify: () =>
        new Promise((resolve) =>
          setTimeout(() => {
            resolve(DRAFT);
          }, 300),
        ),
    };

    const body = await uploadWith(formal.token, slow);

    expect(body.draft).toBeNull();
    expect(body.draftError).toBe('E-LST-01');
  });

  test('NFR-02 BR-12 an answer inside the limit is used', async () => {
    await setSettingValue('BR-12', { ai_draft_time_limit_seconds: 1 });
    const quick: IVision = {
      classify: () =>
        new Promise((resolve) =>
          setTimeout(() => {
            resolve(DRAFT);
          }, 20),
        ),
    };

    const body = await uploadWith(formal.token, quick);

    expect(body.draft).toMatchObject({ nameEn: 'Koshari' });
  });

  test('NFR-03 with the AI unavailable the vendor still saves a listing by hand', async () => {
    const { photoKey } = await uploadWith(formal.token, {
      classify: () => Promise.reject(new Error('down')),
    });

    const created = await post(
      app,
      '/listings',
      formal.token,
      await listingBody(app, formal.token, at, { photoKey }),
    );

    expect(created.status).toBe(201);
  });

  test('E-LST-01 a draft that is not valid (unknown category, empty text) is treated as no draft', async () => {
    const body = await uploadWith(
      formal.token,
      visionReturning({ ...DRAFT, foodCategory: 'pizza' as never, nameEn: '' }),
    );

    expect(body.draft).toBeNull();
    expect(body.draftError).toBe('E-LST-01');
  });
});

describe('NFR-05b every AI-filled field is confirmed or edited before the listing is saved', () => {
  test('NFR-05b a listing with an AI-filled field that was not confirmed is refused, naming the field', async () => {
    const { photoKey } = await uploadWith(formal.token, visionReturning(DRAFT));
    const body = await listingBody(app, formal.token, at, {
      photoKey,
      secondName: 'كشري',
      secondDescription: 'كشري طازج بالبصل المقرمش',
      confirmedAiFields: ['name', 'description', 'secondName'],
    });

    const created = await post(app, '/listings', formal.token, body);

    expect(created.status).toBe(400);
    expect(created.body).toEqual({
      error: 'E-LST-04',
      fields: ['secondDescription', 'foodCategory'],
      unconfirmedAi: true,
    });
  });

  test('NFR-05b without a draft nothing needs confirming', async () => {
    const { photoKey } = await uploadWith(formal.token, {
      classify: () => Promise.reject(new Error('down')),
    });

    const created = await post(
      app,
      '/listings',
      formal.token,
      await listingBody(app, formal.token, at, { photoKey }),
    );

    expect(created.status).toBe(201);
  });

  test('NFR-05b confirmedAiFields that is not a list of field names is refused', async () => {
    const body = await listingBody(app, formal.token, at, { confirmedAiFields: 'all' });

    const created = await post(app, '/listings', formal.token, body);

    expect(created.status).toBe(400);
    expect(created.body).toEqual({ error: 'E-LST-04', fields: ['confirmedAiFields'] });
  });
});

describe('NFR-05d an uncertain AI category gives Highly perishable', () => {
  const packaged: VisionResult = {
    ...DRAFT,
    foodType: 'Biscuits',
    foodCategory: 'packaged_and_dry_food',
    nameEn: 'Biscuits',
    nameAr: 'بسكويت',
  };

  async function saveKeepingAiCategory(confidence: number) {
    const { photoKey } = await uploadWith(formal.token, visionReturning({ ...packaged, confidence }));
    const body = await listingBody(app, formal.token, at, {
      photoKey,
      foodCategory: 'packaged_and_dry_food',
      storage: 'room_temperature',
      confirmedAiFields: ['name', 'description', 'foodCategory'],
    });
    return post(app, '/listings', formal.token, body);
  }

  test('NFR-05d D-80 confidence below the AI-CONFIDENCE setting: Highly perishable', async () => {
    await setSettingValue('AI-CONFIDENCE', { min_confidence: 0.7 });

    const created = await saveKeepingAiCategory(0.69);

    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ perishabilityCategory: 'Highly perishable' });
  });

  test('NFR-05d D-80 confidence at the setting is confident: the shelf-life decides (Long-life)', async () => {
    await setSettingValue('AI-CONFIDENCE', { min_confidence: 0.7 });

    const created = await saveKeepingAiCategory(0.7);

    expect(created.body).toMatchObject({ perishabilityCategory: 'Long-life' });
  });

  test('NFR-05d D-80 the threshold comes from settings: raising it makes the same draft uncertain', async () => {
    await setSettingValue('AI-CONFIDENCE', { min_confidence: 0.95 });

    const created = await saveKeepingAiCategory(0.9);

    expect(created.body).toMatchObject({ perishabilityCategory: 'Highly perishable' });
  });

  test("NFR-05d D-80 a category the vendor changed is the vendor's, so it is confident", async () => {
    await setSettingValue('AI-CONFIDENCE', { min_confidence: 0.7 });
    const { photoKey } = await uploadWith(formal.token, visionReturning({ ...DRAFT, confidence: 0.2 }));
    const body = await listingBody(app, formal.token, at, {
      photoKey,
      foodCategory: 'packaged_and_dry_food',
      storage: 'room_temperature',
      confirmedAiFields: ['name', 'description', 'foodCategory'],
    });

    const created = await post(app, '/listings', formal.token, body);

    expect(created.body).toMatchObject({ perishabilityCategory: 'Long-life' });
  });

  test('NFR-05d D-80 the pick-by preview gives the same answer as saving', async () => {
    await setSettingValue('AI-CONFIDENCE', { min_confidence: 0.7 });
    const { photoKey } = await uploadWith(formal.token, visionReturning({ ...packaged, confidence: 0.3 }));
    const body = await listingBody(app, formal.token, at, {
      photoKey,
      foodCategory: 'packaged_and_dry_food',
      storage: 'room_temperature',
    });

    const preview = await post(app, '/listings/pick-by', formal.token, {
      photoKey,
      foodCategory: body.foodCategory,
      storage: body.storage,
      pickupStart: body.pickupStart,
      branchId: body.branchId,
    });

    expect(preview.status).toBe(200);
    expect(preview.body).toMatchObject({ category: 'Highly perishable' });
  });
});
