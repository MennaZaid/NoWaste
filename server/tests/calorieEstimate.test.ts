// US-16 Estimated calorie range (FR-LST-07, IF-UI-04, NFR-05a, NFR-05b, decision D-119). The AI draft (US-12) gives
// an estimated calorie range in kcal per bag when it can; the vendor keeps it or removes it before saving
// (keepCalorieEstimate); a kept range is stored on the listing and shown to consumers, always labelled Estimate in
// the app. The vendor cannot type a range of their own: it only ever comes from the AI draft.
import request from 'supertest';
import { createApp } from '../src/api/app.js';
import { closePool } from '../src/data/db.js';
import { clock } from '../src/domain/clock.js';
import { createGroqVision } from '../src/adapters/ai-vision/groqVision.js';
import {
  createMockVision,
  setVision,
  type IVision,
  type VisionResult,
} from '../src/adapters/ai-vision/vision.js';
import { createAccount, tokenFor } from './helpers/accounts.js';
import { deleteAllUsers, readListingRow } from './helpers/database.js';
import { createVendor, get, jpeg, listingBody, post, quickPostBody, SHOP } from './helpers/listings.js';

const app = createApp();
const NOW = new Date('2026-11-01T10:00:00.000Z');
const realNow = clock.now;
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000).toISOString();

const DRAFT: VisionResult = {
  foodType: 'Koshari',
  foodCategory: 'cooked_meals',
  quantity: 4,
  calorieRange: { min: 600, max: 900 },
  nameAr: 'كشري',
  nameEn: 'Koshari',
  descriptionAr: 'كشري طازج بالبصل المقرمش',
  descriptionEn: 'Fresh koshari with crispy onions',
  confidence: 0.9,
};

const ALL_TEXT_FIELDS = ['name', 'description', 'secondName', 'secondDescription', 'foodCategory'];
const visionReturning = (result: VisionResult): IVision => ({ classify: () => Promise.resolve(result) });

async function uploadWith(token: string, result: VisionResult) {
  setVision(visionReturning(result));
  const response = await request(app)
    .post('/listings/photo?draft=1')
    .set('Authorization', `Bearer ${token}`)
    .set('Content-Type', 'image/jpeg')
    .send(jpeg());
  expect(response.status).toBe(201);
  return response.body as { photoKey: string; draft: Record<string, unknown> | null };
}

/** A full listing from the confirmed draft, with `extra` fields (keepCalorieEstimate). */
async function saveFromDraft(token: string, extra: Record<string, unknown>, result: VisionResult = DRAFT) {
  const { photoKey } = await uploadWith(token, result);
  return post(
    app,
    '/listings',
    token,
    await listingBody(app, token, at, {
      photoKey,
      secondName: 'كشري',
      secondDescription: 'كشري طازج بالبصل المقرمش',
      confirmedAiFields: ALL_TEXT_FIELDS,
      ...extra,
    }),
  );
}

let formal: { id: string; token: string };

beforeAll(async () => {
  await deleteAllUsers();
  formal = await createVendor(app, 'formal');
});

beforeEach(() => {
  clock.now = () => NOW;
});

afterEach(() => {
  clock.now = realNow;
  setVision(createMockVision());
});

afterAll(async () => {
  await deleteAllUsers();
  await closePool();
});

describe('FR-LST-07 the AI estimates a calorie range from the photo', () => {
  test('FR-LST-07 the draft carries the estimated calorie range in kcal per bag', async () => {
    const body = await uploadWith(formal.token, DRAFT);

    expect(body.draft).toMatchObject({ calorieRange: { min: 600, max: 900 } });
  });

  test('FR-LST-07 "when possible": a draft without a range has calorieRange null', async () => {
    const body = await uploadWith(formal.token, { ...DRAFT, calorieRange: null });

    expect(body.draft).toMatchObject({ foodType: 'Koshari', calorieRange: null });
  });

  test.each([
    ['min above max', { min: 900, max: 600 }],
    ['not whole numbers', { min: 600.5, max: 900 }],
    ['zero', { min: 0, max: 900 }],
    ['missing max', { min: 600 }],
  ])(
    'FR-LST-07 D-119 a range that is not valid (%s) is dropped; the rest of the draft is kept',
    async (_n, range) => {
      const body = await uploadWith(formal.token, {
        ...DRAFT,
        calorieRange: range as VisionResult['calorieRange'],
      });

      expect(body.draft).toMatchObject({ nameEn: 'Koshari', calorieRange: null });
    },
  );

  test('FR-LST-07 the mock adapter gives a range so the flow can be tried without a provider', async () => {
    const result = await createMockVision().classify({ data: jpeg(), type: 'image/jpeg' });

    expect(Number.isInteger(result.calorieRange?.min)).toBe(true);
    expect(Number.isInteger(result.calorieRange?.max)).toBe(true);
  });
});

describe('FR-LST-07 the vendor keeps or removes the estimate before publishing', () => {
  test('FR-LST-07 a kept estimate is stored on the listing and returned', async () => {
    const created = await saveFromDraft(formal.token, { keepCalorieEstimate: true });

    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ calorieMin: 600, calorieMax: 900 });
    const row = await readListingRow((created.body as { id: string }).id);
    expect(row).toMatchObject({ calorie_min: 600, calorie_max: 900 });
  });

  test('FR-LST-07 the vendor removed the estimate: the listing is saved without it', async () => {
    const created = await saveFromDraft(formal.token, { keepCalorieEstimate: false });

    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ calorieMin: null, calorieMax: null });
  });

  test('FR-LST-07 NFR-05b without keepCalorieEstimate the estimate is not published', async () => {
    const created = await saveFromDraft(formal.token, {});

    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ calorieMin: null, calorieMax: null });
  });

  test('E-LST-04 D-119 keeping an estimate when the draft has none is refused', async () => {
    const created = await saveFromDraft(
      formal.token,
      { keepCalorieEstimate: true },
      { ...DRAFT, calorieRange: null },
    );

    expect(created.status).toBe(400);
    expect(created.body).toEqual({ error: 'E-LST-04', fields: ['keepCalorieEstimate'] });
  });

  test('E-LST-04 D-119 keeping an estimate without any AI draft is refused', async () => {
    const created = await post(
      app,
      '/listings',
      formal.token,
      await listingBody(app, formal.token, at, { keepCalorieEstimate: true }),
    );

    expect(created.status).toBe(400);
    expect(created.body).toEqual({ error: 'E-LST-04', fields: ['keepCalorieEstimate'] });
  });

  test('E-LST-04 keepCalorieEstimate that is not true or false is refused', async () => {
    const created = await saveFromDraft(formal.token, { keepCalorieEstimate: 'yes' });

    expect(created.status).toBe(400);
    expect(created.body).toEqual({ error: 'E-LST-04', fields: ['keepCalorieEstimate'] });
  });

  test('FR-LST-07 D-119 a Quick Post keeps the estimate from its draft too', async () => {
    const informal = await createVendor(app, 'informal');
    const { photoKey } = await uploadWith(informal.token, DRAFT);
    const body = {
      ...(await quickPostBody(app, informal.token, at)),
      photoKey,
      name: 'Koshari',
      description: 'Fresh koshari with crispy onions',
      secondName: 'كشري',
      secondDescription: 'كشري طازج بالبصل المقرمش',
      foodCategory: 'cooked_meals',
      confirmedAiFields: ALL_TEXT_FIELDS,
      keepCalorieEstimate: true,
    };

    const created = await post(app, '/listings/quick', informal.token, body);

    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ calorieMin: 600, calorieMax: 900 });
  });
});

describe('FR-LST-07 consumers see the estimate', () => {
  test('FR-LST-07 the offer list and the product page carry the calorie range', async () => {
    const informal = await createVendor(app, 'informal');
    const { photoKey } = await uploadWith(informal.token, DRAFT);
    const created = await post(app, '/listings/quick', informal.token, {
      ...(await quickPostBody(app, informal.token, at)),
      photoKey,
      name: 'Koshari',
      description: 'Fresh koshari with crispy onions',
      secondName: 'كشري',
      secondDescription: 'كشري طازج بالبصل المقرمش',
      foodCategory: 'cooked_meals',
      confirmedAiFields: ALL_TEXT_FIELDS,
      keepCalorieEstimate: true,
    });
    const id = (created.body as { id: string }).id;
    const consumer = await createAccount(app, 'consumer');
    const token = await tokenFor(app, consumer.email);

    const list = await get(
      app,
      `/listings/nearby?latitude=${String(SHOP.latitude)}&longitude=${String(SHOP.longitude)}`,
      token,
    );
    const one = await get(app, `/listings/nearby/${id}`, token);

    const offer = (list.body as { offers: { id: string }[] }).offers.find((o) => o.id === id);
    expect(offer).toMatchObject({ calorieMin: 600, calorieMax: 900 });
    expect(one.body).toMatchObject({ calorieMin: 600, calorieMax: 900 });
  });

  test('FR-LST-07 a listing without an estimate shows none', async () => {
    const informal = await createVendor(app, 'informal');
    const created = await post(
      app,
      '/listings/quick',
      informal.token,
      await quickPostBody(app, informal.token, at),
    );
    const consumer = await createAccount(app, 'consumer');

    const one = await get(
      app,
      `/listings/nearby/${(created.body as { id: string }).id}`,
      await tokenFor(app, consumer.email),
    );

    expect(one.body).toMatchObject({ calorieMin: null, calorieMax: null });
  });
});

describe('FR-LST-07 D-119 the Groq provider asks for the calorie range', () => {
  const ANSWER = {
    foodType: 'Baladi bread',
    foodCategory: 'bread_and_baked_goods',
    quantity: 10,
    nameAr: 'عيش بلدي',
    nameEn: 'Baladi bread',
    descriptionAr: 'عيش بلدي طازج',
    descriptionEn: 'Fresh baladi bread',
    confidence: 0.82,
  };
  const fetchAnswer = (content: unknown) =>
    jest.fn((_url: string, _init: RequestInit) =>
      Promise.resolve(
        new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }), {
          status: 200,
        }),
      ),
    );

  test('FR-LST-07 the prompt asks for an estimated calorie range per bag', async () => {
    const fetchFn = fetchAnswer(ANSWER);
    await createGroqVision({ apiKey: 'k', model: 'm', fetchFn }).classify({
      data: jpeg(),
      type: 'image/jpeg',
    });

    const sent = fetchFn.mock.calls[0]?.[1].body;
    const body = typeof sent === 'string' ? sent : '';
    expect(body).toContain('calorieRange');
    expect(body).toContain('kcal');
  });

  test('FR-LST-07 the range in the answer is returned', async () => {
    const fetchFn = fetchAnswer({ ...ANSWER, calorieRange: { min: 1200, max: 1500 } });

    const result = await createGroqVision({ apiKey: 'k', model: 'm', fetchFn }).classify({
      data: jpeg(),
      type: 'image/jpeg',
    });

    expect(result.calorieRange).toEqual({ min: 1200, max: 1500 });
  });

  test('FR-LST-07 an answer with no range or a malformed one gives null', async () => {
    for (const calorieRange of [undefined, null, 'about 500', [1, 2]]) {
      const fetchFn = fetchAnswer({ ...ANSWER, calorieRange });
      const result = await createGroqVision({ apiKey: 'k', model: 'm', fetchFn }).classify({
        data: jpeg(),
        type: 'image/jpeg',
      });
      expect(result.calorieRange).toBeNull();
    }
  });
});
