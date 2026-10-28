// US-07 Approve/reject: GET /admin/applications, POST /admin/applications/:userId/approve and /reject
// (SDD C-04 Admin & Approval Service, account states Pending -> Approved or Rejected). Tests come from FR-ACC-07,
// E-ACC-05 and NFR-09c.
import request from 'supertest';
import { createApp } from '../src/api/app.js';
import { closePool } from '../src/data/db.js';
import { createAccount, tokenFor } from './helpers/accounts.js';
import { deleteAllUsers, readUserStatus, setUserStatus } from './helpers/database.js';

const app = createApp();
let adminToken: string;

function decide(userId: string, decision: 'approve' | 'reject', token = adminToken) {
  return request(app)
    .post(`/admin/applications/${userId}/${decision}`)
    .set('Authorization', `Bearer ${token}`);
}

function list(query = '?status=Pending', token = adminToken) {
  return request(app).get(`/admin/applications${query}`).set('Authorization', `Bearer ${token}`);
}

beforeEach(async () => {
  await deleteAllUsers();
  const admin = await createAccount(app, 'admin');
  adminToken = await tokenFor(app, admin.email);
});

afterAll(async () => {
  await deleteAllUsers();
  await closePool();
});

describe('FR-ACC-07 list of applications', () => {
  test('FR-ACC-07 GET /admin/applications?status=Pending lists vendors and partners with profile, address and pin', async () => {
    const vendor = await createAccount(app, 'vendor', { email: 'shop@example.com' });
    const partner = await createAccount(app, 'partner', { email: 'org@example.com', partnerRole: 'other' });
    await createAccount(app, 'consumer');
    await createAccount(app, 'vendor', { status: 'Approved' });

    const response = await list();

    expect(response.status).toBe(200);
    const items = response.body as Record<string, unknown>[];
    expect(items).toHaveLength(2);
    const { createdAt, ...first } = items[0] ?? {};
    expect(typeof createdAt).toBe('string');
    expect(first).toEqual({
      userId: vendor.id,
      role: 'vendor',
      status: 'Pending',
      email: 'shop@example.com',
      phone: null,
      vendorProfile: {
        shopName: 'Fatma Bakery',
        vendorType: 'formal',
        contact: '+201012345678',
        description: null,
        address: '12 Tahrir Street, Dokki, Giza',
        latitude: 30.0381,
        longitude: 31.2122,
      },
      partnerProfile: null,
    });
    expect(items[1]).toMatchObject({
      userId: partner.id,
      role: 'other',
      vendorProfile: null,
      partnerProfile: {
        organisationName: 'Giza Food Bank',
        otherPartnerType: 'Mosque',
        acceptedFoodTypes: ['cooked_meals'],
        otherFoodType: null,
        address: '5 Nile Corniche, Giza',
        latitude: 30.0131,
        longitude: 31.2089,
      },
    });
  });

  test('FR-ACC-07 without a status the Pending applications are listed', async () => {
    await createAccount(app, 'vendor');
    await createAccount(app, 'vendor', { status: 'Rejected' });

    const response = await list('');

    expect((response.body as { status: string }[]).map((item) => item.status)).toEqual(['Pending']);
  });

  test.each(['Approved', 'Rejected'])('FR-ACC-07 ?status=%s lists only that status', async (status) => {
    await createAccount(app, 'vendor');
    await createAccount(app, 'partner', { status });

    const response = await list(`?status=${status}`);

    expect((response.body as { status: string }[]).map((item) => item.status)).toEqual([status]);
  });

  test.each(['Active', 'Suspended', 'pending', 'x'])(
    'FR-ACC-07 ?status=%s is refused with 400',
    async (status) => {
      const response = await list(`?status=${status}`);

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'invalid_input', fields: ['status'] });
    },
  );
});

describe('FR-ACC-07 state transitions', () => {
  test('FR-ACC-07 Pending to Approved is allowed and the applicant sees Approved at the next login', async () => {
    const vendor = await createAccount(app, 'vendor');

    const response = await decide(vendor.id, 'approve');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ userId: vendor.id, status: 'Approved' });
    expect(await readUserStatus(vendor.id)).toBe('Approved');
    const login = await request(app)
      .post('/auth/login')
      .send({ emailOrPhone: vendor.email, password: 'abcd1234' });
    expect(login.body).toMatchObject({ user: { status: 'Approved' } });
  });

  test('FR-ACC-07 Pending to Rejected is allowed', async () => {
    const partner = await createAccount(app, 'partner');

    const response = await decide(partner.id, 'reject');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ userId: partner.id, status: 'Rejected' });
    expect(await readUserStatus(partner.id)).toBe('Rejected');
  });

  test.each([
    ['Approved', 'approve'],
    ['Rejected', 'approve'],
    ['Approved', 'reject'],
    ['Rejected', 'reject'],
    ['Suspended', 'approve'],
  ] as const)('FR-ACC-07 %s cannot be changed by %s (409)', async (status, decision) => {
    const vendor = await createAccount(app, 'vendor', { status });

    const response = await decide(vendor.id, decision);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'not_pending', status });
    expect(await readUserStatus(vendor.id)).toBe(status);
  });

  test('FR-ACC-07 approving a consumer is refused (409) and the consumer stays Active', async () => {
    const consumer = await createAccount(app, 'consumer');

    const response = await decide(consumer.id, 'approve');

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'not_pending', status: 'Active' });
    expect(await readUserStatus(consumer.id)).toBe('Active');
  });

  test('FR-ACC-07 approving an administrator is refused (409)', async () => {
    const other = await createAccount(app, 'admin');
    await setUserStatus(other.id, 'Pending');

    expect((await decide(other.id, 'approve')).status).toBe(409);
  });

  test.each(['00000000-0000-0000-0000-000000000000', 'not-a-uuid'])(
    'FR-ACC-07 an unknown user id %s gives 404',
    async (userId) => {
      const response = await decide(userId, 'approve');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'not_found' });
    },
  );

  test.each(['consumer', 'vendor', 'partner'] as const)(
    'NFR-09c a %s cannot approve or reject (403) and nothing changes',
    async (group) => {
      const caller = await createAccount(app, group, {
        status: group === 'consumer' ? undefined : 'Approved',
      });
      const token = await tokenFor(app, caller.email);
      const applicant = await createAccount(app, 'vendor');

      expect((await decide(applicant.id, 'approve', token)).status).toBe(403);
      expect((await decide(applicant.id, 'reject', token)).status).toBe(403);
      expect((await list('', token)).status).toBe(403);
      expect(await readUserStatus(applicant.id)).toBe('Pending');
    },
  );
});
