// US-44 Impact numbers (FR-TGI-07, D-118) and US-25 landfill record (FR-RTE-13, D-117). Listed with their roles in
// protectedRoutes.ts.
import type { RequestHandler } from 'express';
import { getImpact } from '../../services/impact/impactService.js';
import { recordLandfillDisposal } from '../../services/routing/landfillService.js';
import { authOf } from '../middleware/auth.js';

/** GET /impact: every logged-in user. */
export const getImpactHandler: RequestHandler = async (_req, res) => {
  res.json(await getImpact(authOf(res).user));
};

/** POST /listings/:id/landfill: the vendor records the bags nobody took (201). */
export const recordLandfillHandler: RequestHandler = async (req, res) => {
  res.status(201).json(await recordLandfillDisposal(authOf(res).user.id, String(req.params.id)));
};
