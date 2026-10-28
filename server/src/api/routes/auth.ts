// SDD IApi: POST /auth/register (US-01, US-02, US-03), POST /auth/login and POST /auth/logout (US-04).
// The routes check the body shape and call the Account Service. Logout is protected, so it is listed in
// protectedRoutes.ts with its roles.
import { Router, type RequestHandler } from 'express';
import { signUp } from '../../services/account/accountService.js';
import { logIn, logOut } from '../../services/account/authService.js';
import { authOf } from '../middleware/auth.js';

function bodyOf(body: unknown): Record<string, unknown> {
  return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
}

export function authRouter(): Router {
  const router = Router();

  router.post('/auth/register', async (req, res) => {
    const { email, phone, password, language, role, vendorProfile, partnerProfile } = bodyOf(req.body);
    // Only these fields are read; anything else in the body is ignored.
    const user = await signUp({ email, phone, password, language, role, vendorProfile, partnerProfile });
    res.status(201).json(user);
  });

  router.post('/auth/login', async (req, res) => {
    const { emailOrPhone, password } = bodyOf(req.body);
    res.status(200).json(await logIn(emailOrPhone, password));
  });

  return router;
}

/** POST /auth/logout: ends the session of the token used (IF-COM-03). */
export const logoutHandler: RequestHandler = async (_req, res) => {
  await logOut(authOf(res).jti);
  res.status(204).end();
};
