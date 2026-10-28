// NFR-09c and IF-COM-04: role checks on every protected route (SDD C-02 API Layer, T-11). The table is built from
// the route list in src/api/routes/protectedRoutes.ts, so a route added later is covered automatically.
// E-ACC-05 and E-ACC-06 status checks use the same middleware.
import express from 'express';
import request from 'supertest';
import { createApp } from '../src/api/app.js';
import { errorHandler } from '../src/api/middleware/errorHandler.js';
import {
  mountProtectedRoutes,
  protectedRoutes,
  type ProtectedRoute,
} from '../src/api/routes/protectedRoutes.js';
import { ROLE_GROUPS, type RoleGroup } from '../src/domain/roles.js';
import { closePool } from '../src/data/db.js';
import { createAccount, tokenFor } from './helpers/accounts.js';
import { deleteAllUsers, setUserStatus } from './helpers/database.js';

const app = createApp();
const tokens = {} as Record<RoleGroup, string>;
const accounts = {} as Record<RoleGroup, { id: string; email: string }>;

/** Fills path parameters such as :userId with a value of the right shape. */
function concretePath(path: string): string {
  return path.replace(/:[A-Za-z]+/g, '00000000-0000-0000-0000-000000000000');
}

function call(route: Pick<ProtectedRoute, 'method' | 'path'>, token: string, target = app) {
  const path = concretePath(route.path);
  const builder = request(target);
  const req =
    route.method === 'get'
      ? builder.get(path)
      : route.method === 'post'
        ? builder.post(path)
        : route.method === 'patch'
          ? builder.patch(path)
          : builder.delete(path);
  return req.set('Authorization', `Bearer ${token}`).send({});
}

beforeAll(async () => {
  await deleteAllUsers();
  for (const group of ROLE_GROUPS) {
    // Vendors and partners are Approved, so only the role decides.
    const status = group === 'vendor' || group === 'partner' ? 'Approved' : undefined;
    accounts[group] = await createAccount(app, group, { status });
  }
  // Tokens are fetched after all accounts exist; logout routes end them, so each test logs in again.
});

beforeEach(async () => {
  for (const group of ROLE_GROUPS) tokens[group] = await tokenFor(app, accounts[group].email);
});

afterAll(async () => {
  await deleteAllUsers();
  await closePool();
});

describe('NFR-09c every protected route refuses every role it does not list', () => {
  test('NFR-09c every protected route declares at least one role, and the route list is not empty', () => {
    expect(protectedRoutes.length).toBeGreaterThan(0);
    for (const route of protectedRoutes) {
      expect(route.roles.length).toBeGreaterThan(0);
      for (const role of route.roles) expect(ROLE_GROUPS).toContain(role);
    }
  });

  const pairs = protectedRoutes.flatMap((route) =>
    ROLE_GROUPS.filter((group) => !route.roles.includes(group)).map((group) => [group, route] as const),
  );

  test.each(
    pairs.map(([group, route]) => [group, `${route.method.toUpperCase()} ${route.path}`, route] as const),
  )('NFR-09c a %s token gets 403 on %s', async (group, _name, route) => {
    const response = await call(route, tokens[group]);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'forbidden' });
  });

  const allowed = protectedRoutes.flatMap((route) => route.roles.map((group) => [group, route] as const));

  test.each(
    allowed.map(([group, route]) => [group, `${route.method.toUpperCase()} ${route.path}`, route] as const),
  )('NFR-09c a %s token is not refused by the role check on %s', async (group, _name, route) => {
    const response = await call(route, tokens[group]);

    expect([401, 403]).not.toContain(response.status);
  });

  test.each(protectedRoutes.map((route) => [`${route.method.toUpperCase()} ${route.path}`, route] as const))(
    'IF-COM-03 %s without a token gets 401',
    async (_name, route) => {
      const path = concretePath(route.path);
      const response = await request(app)[route.method](path);

      expect(response.status).toBe(401);
    },
  );

  test.each(protectedRoutes.map((route) => [`${route.method.toUpperCase()} ${route.path}`, route] as const))(
    'E-ACC-06 a Suspended account gets 403 E-ACC-06 on %s',
    async (_name, route) => {
      const vendor = await createAccount(app, 'vendor', { status: 'Approved' });
      const token = await tokenFor(app, vendor.email);
      await setUserStatus(vendor.id, 'Suspended');
      // The vendor may not even be allowed on the route; the suspension is checked first.
      const response = await call(route, token);

      expect(response.status).toBe(403);
      expect(response.body).toEqual({ error: 'E-ACC-06' });
    },
  );
});

describe('E-ACC-05 Pending and Rejected vendors and partners cannot post or receive food', () => {
  // No food route exists yet (posting food is US-10, receiving it US-19). This app mounts a vendor-only and a
  // partner-only route that need an approved account, through the same mountProtectedRoutes used by the real API.
  const foodRoutes: ProtectedRoute[] = [
    {
      method: 'post',
      path: '/test/post-food',
      roles: ['vendor'],
      approvedOnly: true,
      handler: (_q, r) => r.json({}),
    },
    {
      method: 'post',
      path: '/test/receive-food',
      roles: ['partner'],
      approvedOnly: true,
      handler: (_q, r) => r.json({}),
    },
  ];
  const foodApp = express();
  foodApp.use(express.json());
  mountProtectedRoutes(foodApp, foodRoutes);
  foodApp.use(errorHandler);

  test.each([
    ['vendor', 'Pending', '/test/post-food'],
    ['vendor', 'Rejected', '/test/post-food'],
    ['partner', 'Pending', '/test/receive-food'],
    ['partner', 'Rejected', '/test/receive-food'],
  ] as const)(
    'E-ACC-05 a %s whose application is %s gets 403 E-ACC-05 on %s',
    async (group, status, path) => {
      const account = await createAccount(app, group, { status });
      const token = await tokenFor(app, account.email);

      const response = await call({ method: 'post', path }, token, foodApp);

      expect(response.status).toBe(403);
      expect(response.body).toEqual({ error: 'E-ACC-05' });
    },
  );

  test.each([
    ['vendor', '/test/post-food'],
    ['partner', '/test/receive-food'],
  ] as const)('E-ACC-05 an Approved %s may use %s', async (group, path) => {
    const response = await call({ method: 'post', path }, tokens[group], foodApp);

    expect(response.status).toBe(200);
  });

  test.each(['other', 'composting'])('NFR-09c a %s partner counts as a partner', async (partnerRole) => {
    const partner = await createAccount(app, 'partner', { status: 'Approved', partnerRole });
    const token = await tokenFor(app, partner.email);

    expect((await call({ method: 'post', path: '/test/receive-food' }, token, foodApp)).status).toBe(200);
    expect((await call({ method: 'post', path: '/test/post-food' }, token, foodApp)).status).toBe(403);
  });
});
