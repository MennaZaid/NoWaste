// US-12 FR-LST-03: the Groq provider behind IVision (decision D-85). Groq is called through a fake fetch, so no key or
// network is needed; a real call is tried by hand with GROQ_API_KEY in server/.env.
import { createGroqVision } from '../src/adapters/ai-vision/groqVision.js';

const PHOTO = { data: Buffer.from([0xff, 0xd8, 0xff, 0x01]), type: 'image/jpeg' as const };

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

function fakeFetch(status: number, content: unknown) {
  return jest.fn((_url: string, _init: RequestInit) =>
    Promise.resolve(
      new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  );
}

describe('FR-LST-03 D-85 the Groq vision provider', () => {
  test('FR-LST-03 sends the photo with the key and model, and returns the draft', async () => {
    const fetchFn = fakeFetch(200, JSON.stringify(ANSWER));
    const vision = createGroqVision({ apiKey: 'test-key', model: 'test-model', fetchFn });

    const result = await vision.classify(PHOTO);

    expect(result).toEqual({ ...ANSWER, calorieRange: null });
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer test-key');
    const body = JSON.parse(init?.body as string) as { model: string; messages: unknown[] };
    expect(body.model).toBe('test-model');
    expect(JSON.stringify(body.messages)).toContain(
      `data:image/jpeg;base64,${PHOTO.data.toString('base64')}`,
    );
  });

  test('FR-LST-03 a quantity the model does not give is null', async () => {
    const vision = createGroqVision({
      apiKey: 'k',
      model: 'm',
      fetchFn: fakeFetch(200, JSON.stringify({ ...ANSWER, quantity: null })),
    });

    expect((await vision.classify(PHOTO)).quantity).toBeNull();
  });

  test('E-LST-01 an error answer from Groq rejects, so the vendor fills the form by hand', async () => {
    const vision = createGroqVision({ apiKey: 'k', model: 'm', fetchFn: fakeFetch(429, '') });

    await expect(vision.classify(PHOTO)).rejects.toThrow();
  });

  test('E-LST-01 an answer that is not JSON rejects', async () => {
    const vision = createGroqVision({ apiKey: 'k', model: 'm', fetchFn: fakeFetch(200, 'a koshari plate') });

    await expect(vision.classify(PHOTO)).rejects.toThrow();
  });
});
