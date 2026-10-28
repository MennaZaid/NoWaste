// GET /users/me and PATCH /users/me {language} (US-04, FR-ACC-09).
import type { RequestHandler } from 'express';
import { getMe, setLanguage } from '../../services/account/accountService.js';
import { authOf } from '../middleware/auth.js';

export const getMeHandler: RequestHandler = (_req, res) => {
  res.json(getMe(authOf(res).user));
};

export const patchMeHandler: RequestHandler = async (req, res) => {
  const body: unknown = req.body;
  const language =
    typeof body === 'object' && body !== null ? (body as { language?: unknown }).language : undefined;
  res.json(await setLanguage(authOf(res).user, language));
};
