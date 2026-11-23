// SDD IApi: Zakat donation and receipts (US-43, FR-TGI-05, FR-TGI-06, E-TGI-02). The routes read the request and call
// the Zakat & Receipt Service; roles are checked by protectedRoutes.ts.
import type { RequestHandler } from 'express';
import { donate, getReceipt, listCharities, myReceipts } from '../../services/zakat-receipt/zakatService.js';
import { authOf } from '../middleware/auth.js';

const bodyOf = (body: unknown): Record<string, unknown> =>
  typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};

/** GET /listings/nearby/:id/charities */
export const zakatCharitiesHandler: RequestHandler = async (req, res) => {
  res.json(await listCharities(String(req.params.id)));
};

/** POST /listings/nearby/:id/zakat {charityId, bags, paymentToken} */
export const donateZakatHandler: RequestHandler = async (req, res) => {
  const { charityId, bags, paymentToken } = bodyOf(req.body);
  res
    .status(201)
    .json(await donate(authOf(res).user.id, String(req.params.id), { charityId, bags, paymentToken }));
};

/** GET /zakat */
export const myZakatHandler: RequestHandler = async (_req, res) => {
  res.json(await myReceipts(authOf(res).user.id));
};

/** GET /zakat/:id */
export const zakatReceiptHandler: RequestHandler = async (req, res) => {
  res.json(await getReceipt(authOf(res).user.id, String(req.params.id)));
};
