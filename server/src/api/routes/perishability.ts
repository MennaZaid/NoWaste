// GET /perishability/categories (D-70): the hours behind each perishability category, for every logged-in user.
import type { RequestHandler } from 'express';
import { categoryHours } from '../../services/perishability/perishabilityService.js';

export const categoryHoursHandler: RequestHandler = async (_req, res) => {
  res.json(await categoryHours());
};
