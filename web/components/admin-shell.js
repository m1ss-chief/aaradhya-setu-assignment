'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from './icons.js';
import { AdminProvider } from './admin-context.js';
import { can } from '@/lib/permissions.js';
import { ROLE_LABELS } from '@/lib/permissions.js';

const NAV = [
  { href: '/', label: 'Overview', icon: 'overview', match: (p) => p === '/' },
  { href: '/bookings', label: 'Bookings', icon: 'bookings', match: (p) => p.startsWith('/bookings') && p !== '/bookings/new' },
  { href: '/bookings/new', label: 'New booking', icon: 'plus', match: (p) => p === '/bookings/new', permission: 'bookings:create' },
  { href: '/notifications', label: 'Notifications', icon: 'bell', match: (p) => p.startsWith('/notifications') },
  { href: '/team', label: 'Team', icon: 'users', match: (p) => p.startsWith('/team'), permission: 'admins:manage' },
  { href: '/settings', label: 'Settings', icon: 'settings', match: (p) => p.startsWith('/settings') },
];

function initials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

export default function AdminShell({ admin, children }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => setOpen(false), [pathname]); // close the mobile menu after navigating

  async function signOut() {
    setSigningOut(true);
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    window.location.assign('/login');
  }

  return (
    <AdminProvider value={admin}>
      <div className="shell">
        <aside className={`sidebar ${open ? 'open' : ''}`}>
          <div className="sidebar-top">
            <Link href="/" className="side-brand">
              <span className="om-tile" aria-hidden>
                ॐ
              </span>
              <span>
                Aaradhya Setu
                <small>आराध्य सेतु · Admin</small>
              </span>
            </Link>
            <button className="menu-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Menu">
              <Icon name={open ? 'close' : 'menu'} size={22} />
            </button>
          </div>

          <nav className="side-nav" aria-label="Admin">
            {NAV.filter((item) => !item.permission || can(admin.role, item.permission)).map((item) => {
              const active = item.match(pathname);
              return (
                <Link key={item.href} href={item.href} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined}>
                  <Icon name={item.icon} />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="side-user">
            <span className="avatar" aria-hidden>
              {initials(admin.name) || 'A'}
            </span>
            <span className="who">
              {admin.name}
              <small>
                @{admin.username} · {ROLE_LABELS[admin.role] || admin.role}
              </small>
            </span>
            <button className="icon-btn on-dark" onClick={signOut} disabled={signingOut} title="Sign out" aria-label="Sign out">
              <Icon name="logout" />
            </button>
          </div>
        </aside>

        <main className="shell-main">{children}</main>
      </div>
    </AdminProvider>
  );
}
