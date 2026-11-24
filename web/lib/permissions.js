// Who may do what. One table, used by the API (enforcement) and the UI (hiding buttons).
//
// owner: runs the operation — everything, including deleting bookings, managing the team
//        and editing message wording.
// staff: day-to-day temple work — view bookings, move them through the workflow and
//        resend failed WhatsApp messages.

export const ROLES = ['owner', 'staff'];

export const ROLE_LABELS = { owner: 'Owner', staff: 'Staff' };

const PERMISSIONS = {
  owner: [
    'bookings:create',
    'bookings:edit',
    'bookings:cancel',
    'bookings:delete',
    'workflow:advance',
    'notifications:resend',
    'admins:manage',
    'templates:edit',
  ],
  staff: ['workflow:advance', 'notifications:resend'],
};

export function can(role, permission) {
  return (PERMISSIONS[role] || []).includes(permission);
}
