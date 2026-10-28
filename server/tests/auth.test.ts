// US-04 Log in/out: POST /auth/login, POST /auth/logout, GET and PATCH /users/me (SDD C-02 API Layer, C-03 Account
// Service). Tests come from FR-ACC-04, FR-ACC-09, E-ACC-03, E-ACC-05, E-ACC-06, IF-COM-03 and NFR-09d.
// They run against the real nowaste_test database; the lockout tests move a fake clock (domain/clock).
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { createApp } from '../src/api/app.js';
import { closePool } from '../src/data/db.js';
import { getSetting } from '../src/data/settingsRepository.js';
import { clock } from '../src/domain/clock.js';
import { createAccount, PASSWORD, tokenFor } from './helpers/accounts.js';
import { countLoginAttempts, deleteAllUsers, readSession, setUserStatus } from './helpers/database.js';

const app = createApp();

function login(emailOrPhone: unknown, password: unknown = PASSWORD) {
  return request(app).post('/auth/login').send({ emailOrPhone, password });
}

function me(token: string) {
  return request(app).get('/users/me').set('Authorization', `Bearer ${token}`);
}

beforeEach(async () => {
  await deleteAllUsers();
});

afterEach(() => {
  jest.restoreAllMocks();
});

afterAll(async () => {
  await deleteAllUsers();
  await closePool();
});

describe('FR-ACC-04 log in and log out', () => {
  test('FR-ACC-04 log in with email returns a token and the user', async () => {
    const consumer = await createAccount(app, 'consumer', { email: 'mona@example.com' });

    const response = await login('Mona@Example.com');

    expect(response.status).toBe(200);
    const body = response.body as { token: string; user: Record<string, unknown> };
    expect(body.user).toEqual({ id: consumer.id, role: 'consumer', status: 'Active', language: 'ar' });
    expect(typeof body.token).toBe('string');
  });

  test('FR-ACC-04 log in with phone (local form or Arabic-Indic digits) returns a token', async () => {
    const consumer = await createAccount(app, 'consumer', { phone: '01012345678' });

    const local = await login('01012345678');
    const arabic = await login('٠١٠١٢٣٤٥٦٧٨');

    expect(local.status).toBe(200);
    expect((local.body as { user: { id: string } }).user.id).toBe(consumer.id);
    expect(arabic.status).toBe(200);
  });

  test('FR-ACC-04 the token is a JWT with a unique id (jti), the user id and the role', async () => {
    const vendor = await createAccount(app, 'vendor', { status: 'Approved' });

    const first = jwt.decode(await tokenFor(app, vendor.email)) as jwt.JwtPayload;
    const second = jwt.decode(await tokenFor(app, vendor.email)) as jwt.JwtPayload;

    expect(first.sub).toBe(vendor.id);
    expect(first.role).toBe('vendor');
    expect(first.jti).toEqual(expect.any(String));
    expect(second.jti).not.toBe(first.jti);
    expect((await readSession(String(first.jti)))?.userId).toBe(vendor.id);
  });

  test('FR-ACC-04 IF-COM-03 log out ends the token and the old token is refused afterwards', async () => {
    const consumer = await createAccount(app, 'consumer');
    const token = await tokenFor(app, consumer.email);
    expect((await me(token)).status).toBe(200);

    const logout = await request(app).post('/auth/logout').set('Authorization', `Bearer ${token}`);

    expect(logout.status).toBe(204);
    const { jti } = jwt.decode(token) as jwt.JwtPayload;
    expect((await readSession(String(jti)))?.endedAt).toBeInstanceOf(Date);
    const after = await me(token);
    expect(after.status).toBe(401);
    expect(after.body).toEqual({ error: 'unauthorized' });
    expect((await request(app).post('/auth/logout').set('Authorization', `Bearer ${token}`)).status).toBe(
      401,
    );
  });

  test('FR-ACC-04 logging out one device leaves the other session working', async () => {
    const consumer = await createAccount(app, 'consumer');
    const phone = await tokenFor(app, consumer.email);
    const tablet = await tokenFor(app, consumer.email);

    await request(app).post('/auth/logout').set('Authorization', `Bearer ${phone}`);

    expect((await me(tablet)).status).toBe(200);
  });

  test.each([
    ['no header', undefined],
    ['not a bearer token', 'Basic abc'],
    ['a malformed token', 'Bearer not-a-jwt'],
    [
      'a token signed with another key',
      `Bearer ${jwt.sign({ role: 'admin' }, 'wrong', { jwtid: 'x', subject: 'y' })}`,
    ],
  ])('IF-COM-03 a request with %s is refused with 401', async (_label, header) => {
    const call = request(app).get('/users/me');
    const response = await (header === undefined ? call : call.set('Authorization', header));

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'unauthorized' });
  });

  test('E-ACC-06 a Removed account can no longer log in and its old token is refused', async () => {
    const vendor = await createAccount(app, 'vendor', { status: 'Approved' });
    const token = await tokenFor(app, vendor.email);
    await setUserStatus(vendor.id, 'Removed');

    expect((await login(vendor.email)).body).toEqual({ error: 'E-ACC-03' });
    expect((await me(token)).status).toBe(401);
  });
});

describe('E-ACC-03 invalid credentials', () => {
  test('E-ACC-03 wrong password and unknown email give identical status and body', async () => {
    await createAccount(app, 'consumer', { email: 'mona@example.com' });

    const wrongPassword = await login('mona@example.com', 'wrong-pass1');
    const unknownEmail = await login('nobody@example.com', PASSWORD);

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(wrongPassword.status);
    expect(wrongPassword.body).toEqual({ error: 'E-ACC-03' });
    expect(unknownEmail.body).toEqual(wrongPassword.body);
  });

  test.each([
    ['an unknown phone', '01199999999', PASSWORD],
    ['text that is neither email nor phone', 'mona', PASSWORD],
    ['a missing identifier', undefined, PASSWORD],
    ['a password that is not text', 'mona@example.com', 12345678],
  ])('E-ACC-03 %s gives the same 401 answer', async (_label, emailOrPhone, password) => {
    const response = await login(emailOrPhone, password);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'E-ACC-03' });
  });

  test('E-ACC-03 the password and its hash are never returned', async () => {
    const consumer = await createAccount(app, 'consumer');

    const response = await login(consumer.email);

    expect(JSON.stringify(response.body)).not.toMatch(/password|\$2[aby]\$/i);
  });
});

describe('NFR-09d login lockout after repeated failures', () => {
  const start = new Date('2026-10-27T10:00:00Z');
  const minutes = (n: number) => new Date(start.getTime() + n * 60_000);
  let at = start;

  beforeEach(() => {
    at = start;
    jest.spyOn(clock, 'now').mockImplementation(() => at);
  });

  async function failTimes(email: string, count: number, stepMinutes = 1) {
    for (let i = 0; i < count; i++) {
      const response = await login(email, 'wrong-pass1');
      expect(response.status).toBe(401);
      at = new Date(at.getTime() + stepMinutes * 60_000);
    }
  }

  test('NFR-09d the limits are read from the settings table', async () => {
    const row = await getSetting('NFR-09d');

    expect(row?.value).toEqual({ max_failed_logins: 5, within_minutes: 15, lock_minutes: 15 });
    expect(row?.source).toContain('NFR-09d');
  });

  test('NFR-09d 4 failures, then the right password is accepted', async () => {
    const consumer = await createAccount(app, 'consumer');
    await failTimes(consumer.email, 4);

    expect((await login(consumer.email)).status).toBe(200);
  });

  test('NFR-09d 5 failures, then the right password within 15 minutes is refused with E-ACC-03', async () => {
    const consumer = await createAccount(app, 'consumer');
    await failTimes(consumer.email, 5); // failures at 0..4 minutes

    at = minutes(4 + 14);
    const refused = await login(consumer.email);

    expect(refused.status).toBe(401);
    expect(refused.body).toEqual({ error: 'E-ACC-03' });
  });

  test('NFR-09d after the 15 minute lock the right password is accepted', async () => {
    const consumer = await createAccount(app, 'consumer');
    await failTimes(consumer.email, 5); // the 5th failure is at minute 4

    at = minutes(4 + 15);
    expect((await login(consumer.email)).status).toBe(200);
  });

  test.each([
    ['14:59', 14 * 60 + 59, 401],
    ['15:00', 15 * 60, 200],
    ['15:01', 15 * 60 + 1, 200],
  ])('NFR-09d D-33 a login %s after the 5th failure gets %d', async (_label, seconds, status) => {
    const consumer = await createAccount(app, 'consumer');
    await failTimes(consumer.email, 5); // the 5th failure is at minute 4

    at = new Date(minutes(4).getTime() + seconds * 1000);
    expect((await login(consumer.email)).status).toBe(status);
  });

  test('NFR-09d D-33 a 6th wrong password during the lock gets the same E-ACC-03 answer', async () => {
    const consumer = await createAccount(app, 'consumer');
    await failTimes(consumer.email, 5);

    const sixth = await login(consumer.email, 'wrong-pass1');

    expect(sixth.status).toBe(401);
    expect(sixth.body).toEqual({ error: 'E-ACC-03' });
  });

  test('NFR-09d logins refused during the lock do not extend it', async () => {
    const consumer = await createAccount(app, 'consumer');
    await failTimes(consumer.email, 5);
    const attempts = await countLoginAttempts(consumer.id);

    at = minutes(10);
    await login(consumer.email);
    await login(consumer.email, 'wrong-pass1');

    expect(await countLoginAttempts(consumer.id)).toBe(attempts);
    at = minutes(4 + 15);
    expect((await login(consumer.email)).status).toBe(200);
  });

  test('NFR-09d failures more than 15 minutes apart do not add up', async () => {
    const consumer = await createAccount(app, 'consumer');
    await failTimes(consumer.email, 5, 4); // 0, 4, 8, 12, 16: the first and the fifth are 16 minutes apart

    expect((await login(consumer.email)).status).toBe(200);
  });

  test('NFR-09d a successful login starts the count again', async () => {
    const consumer = await createAccount(app, 'consumer');
    await failTimes(consumer.email, 4);
    expect((await login(consumer.email)).status).toBe(200);
    await failTimes(consumer.email, 4);

    expect((await login(consumer.email)).status).toBe(200);
  });

  test('NFR-09d the lock is per account: another account still logs in', async () => {
    const locked = await createAccount(app, 'consumer');
    const other = await createAccount(app, 'consumer');
    await failTimes(locked.email, 5);

    expect((await login(other.email)).status).toBe(200);
  });
});

describe('E-ACC-05 E-ACC-06 account status at login', () => {
  test.each(['Pending', 'Rejected'])(
    'E-ACC-05 a %s vendor can log in and sees the application status',
    async (status) => {
      const vendor = await createAccount(app, 'vendor', { status });

      const response = await login(vendor.email);

      expect(response.status).toBe(200);
      expect((response.body as { user: { status: string } }).user.status).toBe(status);
      const token = (response.body as { token: string }).token;
      expect((await me(token)).body).toMatchObject({ role: 'vendor', status });
    },
  );

  test('E-ACC-06 a Suspended account gets 403 E-ACC-06 on protected routes', async () => {
    const vendor = await createAccount(app, 'vendor', { status: 'Approved' });
    const token = await tokenFor(app, vendor.email);
    await setUserStatus(vendor.id, 'Suspended');

    const response = await me(token);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'E-ACC-06' });
  });
});

describe('FR-ACC-09 the saved language on the account', () => {
  test('FR-ACC-09 GET /users/me returns the user with the saved language', async () => {
    const partner = await createAccount(app, 'partner', { email: 'org@example.com' });
    const token = await tokenFor(app, partner.email);

    const response = await me(token);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: partner.id,
      role: 'charity',
      status: 'Pending',
      language: 'ar',
      email: 'org@example.com',
      phone: null,
    });
  });

  test('FR-ACC-09 PATCH /users/me saves the language, and the next login returns it', async () => {
    const consumer = await createAccount(app, 'consumer');
    const token = await tokenFor(app, consumer.email);

    const response = await request(app)
      .patch('/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ language: 'en' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ language: 'en' });
    expect((await login(consumer.email)).body).toMatchObject({ user: { language: 'en' } });
  });

  test.each([undefined, 'fr', 3])(
    'FR-ACC-09 PATCH /users/me with language %p is refused',
    async (language) => {
      const consumer = await createAccount(app, 'consumer');
      const token = await tokenFor(app, consumer.email);

      const response = await request(app)
        .patch('/users/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ language });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'invalid_input', fields: ['language'] });
    },
  );
});
