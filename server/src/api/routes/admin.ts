// US-07: GET /admin/applications?status=… and POST /admin/applications/:userId/approve or /reject (FR-ACC-07).
import type { RequestHandler } from 'express';
import {
  decideApplication,
  getApplications,
  type Decision,
} from '../../services/admin-approval/approvalService.js';

export const listApplicationsHandler: RequestHandler = async (req, res) => {
  res.json(await getApplications(req.query.status));
};

export function decideHandler(decision: Decision): RequestHandler {
  return async (req, res) => {
    res.json(await decideApplication(String(req.params.userId), decision));
  };
}
