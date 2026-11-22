// US-45 Ramadan mode (FR-TGI-08, D-107): GET /ramadan (consumers and the administrator) and PATCH /admin/ramadan
// {iftar, suhoor} (administrator only). Listed with their roles in protectedRoutes.ts.
import type { RequestHandler } from 'express';
import { getRamadan, setRamadanTimes } from '../../services/ramadan/ramadanService.js';

export const getRamadanHandler: RequestHandler = async (_req, res) => {
  res.json(await getRamadan());
};

export const setRamadanHandler: RequestHandler = async (req, res) => {
  res.json(await setRamadanTimes(req.body));
};
