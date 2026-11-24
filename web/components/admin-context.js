'use client';

import { createContext, useContext } from 'react';

// The signed-in admin, provided by AdminShell.
const AdminContext = createContext(null);

export const AdminProvider = AdminContext.Provider;

export function useAdmin() {
  return { admin: useContext(AdminContext) };
}
