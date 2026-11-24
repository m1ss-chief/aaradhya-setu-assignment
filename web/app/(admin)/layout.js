import { redirect } from 'next/navigation';
import { currentAdmin } from '@/lib/current-admin.js';
import AdminShell from '@/components/admin-shell.js';

// Every page in this group needs a signed-in admin. The middleware already
// redirects signed-out visitors; this check also catches removed accounts and
// reads the CURRENT role from the database.
export default async function AdminLayout({ children }) {
  const admin = await currentAdmin();
  if (!admin) redirect('/login');
  return <AdminShell admin={{ username: admin.username, name: admin.name, role: admin.role }}>{children}</AdminShell>;
}
