// SDD IApi: POST /auth/register (US-01, US-02, US-03). The route checks the body shape and calls the Account Service.
import { Router } from 'express';
import { signUp } from '../../services/account/accountService.js';

export function authRouter(): Router {
  const router = Router();

  router.post('/auth/register', async (req, res) => {
    const body: unknown = req.body;
    const { email, phone, password, language, role, vendorProfile, partnerProfile } =
      typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
    // Only these fields are read; anything else in the body is ignored.
    const user = await signUp({ email, phone, password, language, role, vendorProfile, partnerProfile });
    res.status(201).json(user);
  });

  return router;
}
