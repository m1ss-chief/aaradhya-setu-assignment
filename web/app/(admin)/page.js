'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { STATUSES, STATUS_META } from '@/lib/workflow.js';
import { StatusBadge, BarList, formatINR, formatDate, ErrorNote, api } from '@/components/ui.js';
import { Icon } from '@/components/icons.js';

function greeting() {
  const h = Number(new Date().toLocaleString('en-IN', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }));
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default function OverviewPage() {
  const router = useRouter();
  const [stats, setStats] = useState(null);
  const [admin, setAdmin] = useState(null);
  const [messages, setMessages] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/api/stats').then(setStats).catch((e) => setError(e.message));
    api('/api/auth/me').then((d) => setAdmin(d.admin)).catch(() => {});
    api('/api/notifications').then((d) => setMessages(d.notifications.slice(0, 5))).catch(() => setMessages([]));
  }, []);

  const kpis = [
    { label: 'Total bookings', value: stats?.total, icon: 'bookings', hint: 'All time' },
    { label: 'Booking value', value: stats && formatINR(stats.revenue), icon: 'rupee', hint: stats ? `Avg ${formatINR(stats.averageAmount)} / booking` : '' },
    { label: 'Awaiting confirmation', value: stats?.byStatus.Pending, icon: 'clock', hint: 'Pending bookings', href: '/bookings?status=Pending', tone: stats?.byStatus.Pending ? 'attention' : '' },
    { label: 'Pujas in next 7 days', value: stats?.upcomingCount, icon: 'calendar', hint: 'Pending or confirmed' },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">{greeting()}{admin ? `, ${admin.name}` : ''} 🙏</p>
          <h1>Overview</h1>
        </div>
        <Link href="/bookings/new" className="btn btn-primary">
          <Icon name="plus" /> New booking
        </Link>
      </div>

      <ErrorNote error={error} />

      <section className="kpis" aria-label="Key figures">
        {kpis.map((k) => {
          const body = (
            <>
              <span className="kpi-icon">
                <Icon name={k.icon} />
              </span>
              <span className="kpi-label">{k.label}</span>
              <span className="kpi-value">{k.value ?? '–'}</span>
              <span className="kpi-hint">{k.hint}</span>
            </>
          );
          return k.href ? (
            <Link key={k.label} href={k.href} className={`card kpi ${k.tone || ''}`}>
              {body}
            </Link>
          ) : (
            <div key={k.label} className="card kpi">
              {body}
            </div>
          );
        })}
      </section>

      <div className="overview-grid">
        <section className="card">
          <div className="card-head">
            <h2 className="section-title">Bookings by stage</h2>
            <Link href="/bookings" className="link-sm">
              View all
            </Link>
          </div>
          {stats ? (
            <BarList
              label="Bookings by workflow stage"
              rows={STATUSES.map((s) => ({ label: `${s}`, value: stats.byStatus[s], title: `${STATUS_META[s].stage}: ${stats.byStatus[s]} booking(s)`, status: s }))}
              format={(v) => v}
              onSelect={(r) => router.push(`/bookings?status=${encodeURIComponent(r.status)}`)}
            />
          ) : (
            <div className="skeleton" />
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <h2 className="section-title">Booking value by puja</h2>
          </div>
          {stats ? (
            <BarList
              label="Booking value by puja"
              rows={stats.revenueByPuja.map((p) => ({ label: p.puja, value: p.revenue, title: `${p.puja}: ${formatINR(p.revenue)} from ${p.count} booking(s)`, puja: p.puja }))}
              format={formatINR}
              onSelect={(r) => router.push(`/bookings?puja=${encodeURIComponent(r.puja)}`)}
            />
          ) : (
            <div className="skeleton" />
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <h2 className="section-title">Coming up this week</h2>
          </div>
          {stats?.upcoming.length === 0 && <p className="muted">No pujas scheduled in the next 7 days.</p>}
          <ul className="mini-list">
            {stats?.upcoming.map((b) => (
              <li key={b.bookingId}>
                <Link href={`/bookings/${b.bookingId}`}>
                  <span className="date-chip">
                    <b>{new Date(b.pujaDate).toLocaleDateString('en-IN', { day: 'numeric', timeZone: 'Asia/Kolkata' })}</b>
                    {new Date(b.pujaDate).toLocaleDateString('en-IN', { month: 'short', timeZone: 'Asia/Kolkata' })}
                  </span>
                  <span className="grow">
                    {b.pujaName}
                    <span className="sub">
                      {b.devoteeName} · {b.templeName}
                    </span>
                  </span>
                  <StatusBadge status={b.status} />
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="card">
          <div className="card-head">
            <h2 className="section-title">Latest WhatsApp updates</h2>
            <Link href="/notifications" className="link-sm">
              View all
            </Link>
          </div>
          {messages?.length === 0 && <p className="muted">No messages yet.</p>}
          <ul className="mini-list">
            {messages?.map((n) => (
              <li key={n.id}>
                <Link href={`/bookings/${n.bookingId}`}>
                  <span className="msg-dot" aria-hidden>
                    <Icon name="bell" size={16} />
                  </span>
                  <span className="grow">
                    {n.devoteeName} <span className="muted">· {STATUS_META[n.status]?.stage}</span>
                    <span className="sub clamp">{n.message}</span>
                  </span>
                  <span className="muted small nowrap">{formatDate(n.createdAt, true)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
