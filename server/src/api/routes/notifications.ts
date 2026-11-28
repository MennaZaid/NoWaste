// SDD IApi: the user's notifications shown in the app (US-34, FR-RES-11, IF-SW-06, D-121). Roles are checked by
// protectedRoutes.ts.
import type { RequestHandler } from 'express';
import { myNotifications, readAll } from '../../services/notification/notificationService.js';
import { authOf } from '../middleware/auth.js';

/** GET /notifications */
export const myNotificationsHandler: RequestHandler = async (_req, res) => {
  res.json(await myNotifications(authOf(res).user.id));
};

/** POST /notifications/read */
export const readNotificationsHandler: RequestHandler = async (_req, res) => {
  res.json(await readAll(authOf(res).user.id));
};
