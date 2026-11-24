'use client';

import { createContext, useContext } from 'react';
import { can } from '@/lib/permissions.js';

// The signed-in admin, provided by AdminShell. Used to hide buttons a role can't use.
// (The API enforces the same rules; hiding is only for a clean interface.)
const AdminContext = createContext(null);

export const AdminProvider = AdminContext.Provider;

export function useAdmin() {
  const admin = useContext(AdminContext);
  return { admin, can: (permission) => !!admin && can(admin.role, permission) };
}

// Shown when someone opens a page their role can't use.
export function NoAccess({ what = 'do this' }) {
  return (
    <div className="card empty-state">
      <h2 className="section-title">Owners only</h2>
      <p className="muted">Your role doesn't allow you to {what}. Ask an owner if you need this.</p>
    </div>
  );
}
