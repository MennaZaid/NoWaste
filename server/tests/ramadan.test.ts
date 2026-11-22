// US-45 Ramadan mode (FR-TGI-08, decision D-107): the administrator sets the iftar and suhoor times; consumers get the
// next iftar and suhoor moments (Cairo time). Runs against nowaste_test.
import request from 'supertest';
import { createApp } from '../src/api/app.js';
import { closePool } from '../src/data/db.js';
import { getSetting, setSettingValue } from '../src/data/settingsRepository.js';
import { clock } from '../src/domain/clock.js';
import { nextOccurrence } from '../src/domain/ramadan.js';
import { createAccount, tokenFor } from './helpers/accounts.js';
import { deleteAllUsers } from './helpers/database.js';

const app = createApp();
const realNow = clock.now;
let original: unknown;
let adminToken: string;
let consumerToken: string;

beforeAll(async () => {
  original = (await getSetting('FR-TGI-08'))?.value;
});

beforeEach(async () => {
  await deleteAllUsers();
  await setSettingValue('FR-TGI-08', original);
  const admin = await createAccount(app, 'admin');
  const consumer = await createAccount(app, 'consumer');
  adminToken = await tokenFor(app, admin.email);
  consumerToken = await tokenFor(app, consumer.email);
});

afterEach(() => {
  clock.now = realNow;
});

afterAll(async () => {
  await setSettingValue('FR-TGI-08', original);
  await deleteAllUsers();
  await closePool();
});

const setTimes = (token: string, body: object) =>
  request(app).patch('/admin/ramadan').set('Authorization', `Bearer ${token}`).send(body);
const readTimes = (token: string) => request(app).get('/ramadan').set('Authorization', `Bearer ${token}`);

describe('FR-TGI-08 Ramadan times set by the administrator', () => {
  test('FR-TGI-08 the settings row starts with no times and a 120 minute lead in Cairo time', () => {
    expect(original).toEqual({ iftar: null, suhoor: null, lead_minutes: 120, time_zone: 'Africa/Cairo' });
  });

  test('FR-TGI-08 before the administrator sets them, consumers are told the times are not set', async () => {
    const res = await readTimes(consumerToken);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ set: false, leadMinutes: 120 });
  });

  test('FR-TGI-08 the administrator sets iftar and suhoor; consumers get the next moments', async () => {
    // 21 Nov 2026, 14:00 in Cairo (UTC+2).
    clock.now = () => new Date('2026-11-21T12:00:00Z');
    const saved = await setTimes(adminToken, { iftar: '17:05', suhoor: '٠٣:٣٠' });
    expect(saved.status).toBe(200);

    const res = await readTimes(consumerToken);
    expect(res.body).toEqual({
      set: true,
      iftar: '17:05',
      suhoor: '03:30',
      leadMinutes: 120,
      iftarAt: '2026-11-21T15:05:00.000Z',
      suhoorAt: '2026-11-22T01:30:00.000Z',
    });
    expect((await getSetting('FR-TGI-08'))?.value).toEqual({
      iftar: '17:05',
      suhoor: '03:30',
      lead_minutes: 120,
      time_zone: 'Africa/Cairo',
    });
  });

  test.each([
    [{}, ['iftar', 'suhoor']],
    [{ iftar: '25:00', suhoor: '03:30' }, ['iftar']],
    [{ iftar: '17:05', suhoor: 'dawn' }, ['suhoor']],
    [{ iftar: '17:05', suhoor: '17:05' }, ['suhoor']],
  ])('FR-TGI-08 invalid times %j are refused naming %j', async (body, fields) => {
    const res = await setTimes(adminToken, body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_input', fields });
    expect((await getSetting('FR-TGI-08'))?.value).toEqual(original);
  });

  test('NFR-09c only the administrator may set the times', async () => {
    const res = await setTimes(consumerToken, { iftar: '17:05', suhoor: '03:30' });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'forbidden' });
  });

  test('IF-COM-03 reading the times needs a login', async () => {
    expect((await request(app).get('/ramadan')).status).toBe(401);
  });
});

describe('FR-TGI-08 next iftar and suhoor in Cairo time', () => {
  const cairo = 'Africa/Cairo';

  test('FR-TGI-08 iftar still ahead today is today', () => {
    expect(nextOccurrence(new Date('2026-11-21T12:00:00Z'), '17:05', cairo).toISOString()).toBe(
      '2026-11-21T15:05:00.000Z',
    );
  });

  test('FR-TGI-08 iftar already passed today is tomorrow', () => {
    expect(nextOccurrence(new Date('2026-11-21T16:00:00Z'), '17:05', cairo).toISOString()).toBe(
      '2026-11-22T15:05:00.000Z',
    );
  });

  test('FR-TGI-08 exactly at iftar the next one is tomorrow', () => {
    expect(nextOccurrence(new Date('2026-11-21T15:05:00Z'), '17:05', cairo).toISOString()).toBe(
      '2026-11-22T15:05:00.000Z',
    );
  });

  test('FR-TGI-08 Egypt summer time (UTC+3) is respected', () => {
    // 1 July 2026, 10:00 Cairo summer time = 07:00 UTC.
    expect(nextOccurrence(new Date('2026-07-01T07:00:00Z'), '19:59', cairo).toISOString()).toBe(
      '2026-07-01T16:59:00.000Z',
    );
  });
});
