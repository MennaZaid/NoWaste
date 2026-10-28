// SRS 2.7: administrator accounts are created by the team with `npm run seed:admin -- --email x --password y`.
// The script calls createAdmin (C-03 Account Service); these tests check that function and the argument parsing.
import request from 'supertest';
import { createApp } from '../src/api/app.js';
import { closePool } from '../src/data/db.js';
import { parseSeedAdminArgs } from '../src/seedAdmin.js';
import { createAdmin } from '../src/services/account/accountService.js';
import { SrsError } from '../src/domain/errors.js';
import { deleteAllUsers } from './helpers/database.js';

const app = createApp();

beforeEach(async () => {
  await deleteAllUsers();
});

afterAll(async () => {
  await deleteAllUsers();
  await closePool();
});

describe('SRS 2.7 seed:admin creates administrator accounts', () => {
  test('SRS 2.7 createAdmin makes an Active admin who can log in', async () => {
    const admin = await createAdmin({ email: 'admin@nowaste.example', password: 'abcd1234' });

    expect(admin).toMatchObject({ role: 'admin', status: 'Active' });
    const login = await request(app)
      .post('/auth/login')
      .send({ emailOrPhone: 'admin@nowaste.example', password: 'abcd1234' });
    expect(login.status).toBe(200);
    expect(login.body).toMatchObject({ user: { role: 'admin', status: 'Active', language: 'en' } });
  });

  test('E-ACC-02 createAdmin refuses an invalid email or a weak password', async () => {
    await expect(createAdmin({ email: 'not-an-email', password: 'short' })).rejects.toEqual(
      new SrsError(400, { error: 'E-ACC-02', fields: ['email', 'password'] }),
    );
  });

  test('E-ACC-01 createAdmin refuses an email that is already registered', async () => {
    await createAdmin({ email: 'admin@nowaste.example', password: 'abcd1234' });

    await expect(createAdmin({ email: 'admin@nowaste.example', password: 'abcd1234' })).rejects.toEqual(
      new SrsError(409, { error: 'E-ACC-01', field: 'email' }),
    );
  });

  test('SRS 2.7 the script reads --email, --password and an optional --language', () => {
    expect(parseSeedAdminArgs(['--email', 'a@b.co', '--password', 'abcd1234'])).toEqual({
      email: 'a@b.co',
      password: 'abcd1234',
      language: 'en',
    });
    expect(
      parseSeedAdminArgs(['--email', 'a@b.co', '--password', 'abcd1234', '--language', 'ar']),
    ).toMatchObject({
      language: 'ar',
    });
    expect(parseSeedAdminArgs(['--email', 'a@b.co'])).toBeNull();
  });
});
