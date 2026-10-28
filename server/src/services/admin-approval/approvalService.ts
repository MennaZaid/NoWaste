// C-04 Admin & Approval Service (US-07, FR-ACC-07): lists vendor and partner applications and moves them from
// Pending to Approved or Rejected (SDD account states). Any other move is refused with 409.
// Telling the applicant (INotification, C-18) comes with push notifications; for now they see the status at login.
import { SrsError } from '../../domain/errors.js';
import { listApplications, type ApplicationRecord } from '../../data/profileRepository.js';
import { findUserById, updateApplicantStatus, type AccountStatus } from '../../data/userRepository.js';

const LISTABLE: readonly AccountStatus[] = ['Pending', 'Approved', 'Rejected'];

/** GET /admin/applications?status=…; without a status the Pending applications are listed. */
export async function getApplications(status: unknown): Promise<ApplicationRecord[]> {
  const wanted = status === undefined ? 'Pending' : status;
  if (!LISTABLE.includes(wanted as AccountStatus)) {
    throw new SrsError(400, { error: 'invalid_input', fields: ['status'] });
  }
  return listApplications(wanted as AccountStatus);
}

export type Decision = 'approve' | 'reject';

export async function decideApplication(
  userId: string,
  decision: Decision,
): Promise<{ userId: string; status: AccountStatus }> {
  const to: AccountStatus = decision === 'approve' ? 'Approved' : 'Rejected';
  const updated = await updateApplicantStatus(userId, 'Pending', to);
  if (updated !== undefined) return { userId: updated.id, status: updated.status };

  const user = await findUserById(userId);
  if (user === undefined) throw new SrsError(404, { error: 'not_found' });
  // Only a Pending vendor or partner can be decided; consumers and administrators never have an application.
  throw new SrsError(409, { error: 'not_pending', status: user.status });
}
