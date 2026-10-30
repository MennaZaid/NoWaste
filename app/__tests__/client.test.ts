// The API client for US-04 and US-07 (IF-COM-03, E-ACC-03, E-ACC-06, FR-ACC-07): what it sends and how it reads the
// answers. fetch is mocked.
import {
  decideApplication,
  getMe,
  getMyListings,
  downloadListingPhoto,
  listApplications,
  login,
  logout,
} from '@/api/client';

const mockDownload = jest.fn<Promise<unknown>, unknown[]>();

jest.mock('expo-file-system', () => ({
  Paths: { cache: 'cache-dir' },
  File: class {
    static downloadFileAsync(...args: unknown[]): Promise<unknown> {
      return mockDownload(...args);
    }
    parts: unknown[];
    constructor(...parts: unknown[]) {
      this.parts = parts;
    }
  },
}));

const mockedFetch = jest.fn();

function answer(status: number, body?: unknown) {
  mockedFetch.mockResolvedValueOnce({
    status,
    ok: status >= 200 && status < 300,
    json: () => (body === undefined ? Promise.reject(new Error('no body')) : Promise.resolve(body)),
  });
}

function sent(index = 0) {
  const [url, init] = mockedFetch.mock.calls[index] as [string, RequestInit];
  return { url, init, headers: new Headers(init.headers) };
}

beforeEach(() => {
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test/';
  mockedFetch.mockReset();
  global.fetch = mockedFetch as unknown as typeof fetch;
});

describe('FR-ACC-04 E-ACC-03 login', () => {
  test('FR-ACC-04 login posts emailOrPhone and password as JSON and returns the token and user', async () => {
    const user = { id: 'u1', role: 'consumer', status: 'Active', language: 'ar' };
    answer(200, { token: 'tok', user });

    expect(await login('mona@example.com', 'abcd1234')).toEqual({ kind: 'ok', token: 'tok', user });
    const { url, init, headers } = sent();
    expect(url).toBe('http://api.test/auth/login');
    expect(init.method).toBe('POST');
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('Authorization')).toBeNull();
    expect(JSON.parse(String(init.body))).toEqual({ emailOrPhone: 'mona@example.com', password: 'abcd1234' });
  });

  test('E-ACC-03 a 401 E-ACC-03 answer is read as invalid credentials', async () => {
    answer(401, { error: 'E-ACC-03' });

    expect(await login('x@example.com', 'bad')).toEqual({ kind: 'invalid' });
  });

  test('FR-ACC-04 a network failure is read as unreachable', async () => {
    mockedFetch.mockRejectedValueOnce(new Error('offline'));

    expect(await login('x@example.com', 'abcd1234')).toEqual({ kind: 'unreachable' });
  });
});

describe('IF-COM-03 E-ACC-06 protected calls', () => {
  test('IF-COM-03 logout and getMe send the token as a Bearer header', async () => {
    answer(204);
    answer(200, { id: 'u1', role: 'vendor', status: 'Pending', language: 'en' });

    await logout('tok-1');
    const me = await getMe('tok-1');

    expect(sent(0).url).toBe('http://api.test/auth/logout');
    expect(sent(0).headers.get('Authorization')).toBe('Bearer tok-1');
    expect(sent(1).headers.get('Authorization')).toBe('Bearer tok-1');
    expect(me).toMatchObject({ kind: 'ok', user: { status: 'Pending' } });
  });

  test('IF-COM-03 a 401 answer means the session ended', async () => {
    answer(401, { error: 'unauthorized' });

    expect(await getMe('old')).toEqual({ kind: 'unauthorized' });
  });

  test('E-ACC-06 a 403 E-ACC-06 answer means the account is suspended', async () => {
    answer(403, { error: 'E-ACC-06' });

    expect(await getMe('tok')).toEqual({ kind: 'suspended' });
  });

  test('FR-ACC-04 logout offline does not throw', async () => {
    mockedFetch.mockRejectedValueOnce(new Error('offline'));

    await expect(logout('tok')).resolves.toBeUndefined();
  });
});

describe('FR-ACC-07 admin calls', () => {
  test('FR-ACC-07 listApplications asks for the status and returns the list', async () => {
    answer(200, []);

    expect(await listApplications('admin', 'Pending')).toEqual({ kind: 'ok', applications: [] });
    expect(sent().url).toBe('http://api.test/admin/applications?status=Pending');
  });

  test('FR-ACC-07 decideApplication posts to approve or reject and reads 200 and 409', async () => {
    answer(200, { userId: 'v1', status: 'Approved' });
    answer(409, { error: 'not_pending', status: 'Rejected' });

    expect(await decideApplication('admin', 'v1', 'approve')).toEqual({ kind: 'ok', status: 'Approved' });
    expect(await decideApplication('admin', 'v1', 'reject')).toEqual({
      kind: 'conflict',
      status: 'Rejected',
    });
    expect(sent(0).url).toBe('http://api.test/admin/applications/v1/approve');
    expect(sent(1).url).toBe('http://api.test/admin/applications/v1/reject');
    expect(sent(1).init.method).toBe('POST');
  });
});

describe('FR-LST-06 my listings and the listing photo', () => {
  beforeEach(() => {
    mockDownload.mockReset();
  });

  test('FR-LST-06 getMyListings asks GET /listings with the token and returns the list', async () => {
    const listings = [{ id: 'l2' }, { id: 'l1' }];
    answer(200, listings);

    expect(await getMyListings('vendor-token')).toEqual({ kind: 'ok', listings });
    const { url, init, headers } = sent();
    expect(url).toBe('http://api.test/listings');
    expect(init.method).toBeUndefined();
    expect(headers.get('Authorization')).toBe('Bearer vendor-token');
  });

  test('FR-LST-06 no connection is unreachable and an answer that is not a list is unexpected', async () => {
    mockedFetch.mockRejectedValueOnce(new TypeError('Network request failed'));
    answer(200, { id: 'l1' });

    expect(await getMyListings('vendor-token')).toEqual({ kind: 'unreachable' });
    expect(await getMyListings('vendor-token')).toEqual({ kind: 'unexpected' });
  });

  // The phone's Image component drops request headers on Android (seen in phone testing: every photo request reached
  // the server without the token and got 401), so the app downloads the photo with the token into its cache (D-51).
  test('FR-LST-01 the photo is downloaded from GET /listings/:id/photo with the token into the cache', async () => {
    mockDownload.mockResolvedValueOnce({ uri: 'file:///cache/listing-photo-l1.jpg' });

    expect(await downloadListingPhoto('vendor-token', 'l1')).toBe('file:///cache/listing-photo-l1.jpg');
    const [url, destination, options] = mockDownload.mock.calls[0] as [string, { parts: unknown[] }, object];
    expect(url).toBe('http://api.test/listings/l1/photo');
    expect(destination.parts).toEqual(['cache-dir', 'listing-photo-l1.jpg']);
    expect(options).toEqual({ headers: { Authorization: 'Bearer vendor-token' }, idempotent: true });
  });

  test('FR-LST-01 a photo that cannot be downloaded gives null, so the screen keeps the empty box', async () => {
    mockDownload.mockRejectedValueOnce(new Error('HTTP 401'));

    expect(await downloadListingPhoto('vendor-token', 'l1')).toBeNull();
  });
});
