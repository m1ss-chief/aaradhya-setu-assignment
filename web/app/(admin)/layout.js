import { redirect } from 'next/navigation';
import { currentAdmin } from '@/lib/current-admin.js';
import AdminShell from '@/components/admin-shell.js';

// Every page in this group needs a signed-in admin. The middleware already
// redirects signed-out visitors; this check is the second line of defence.
export default async function AdminLayout({ children }) {
  const session = await currentAdmin();
  if (!session) redirect('/login');
  return <AdminShell admin={{ username: session.sub, name: session.name, role: session.role }}>{children}</AdminShell>;
}
