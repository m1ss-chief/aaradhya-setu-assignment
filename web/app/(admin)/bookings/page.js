'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ALL_STATUSES } from '@/lib/workflow.js';
import { StatusBadge, ConfirmDialog, formatINR, formatDate, ErrorNote, api } from '@/components/ui.js';
import { Icon } from '@/components/icons.js';
import { useAdmin } from '@/components/admin-context.js';

const PAGE_SIZE = 10;

const COLUMNS = [
  { key: 'bookingId', label: 'Booking ID' },
  { key: 'devotee', label: 'Devotee' },
  { key: null, label: 'Puja' },
  { key: 'date', label: 'Puja date' },
  { key: 'amount', label: 'Amount' },
  { key: null, label: 'Status' },
  { key: null, label: 'Actions', className: 'col-actions' },
];

const DEFAULT_FILTERS = { q: '', status: 'all', puja: 'all', sort: 'date', order: 'desc' };

function BookingsTable() {
  const router = useRouter();
  const params = useSearchParams();
  const { can } = useAdmin();
  const [filters, setFilters] = useState({
    ...DEFAULT_FILTERS,
    status: params.get('status') || 'all',
    puja: params.get('puja') || 'all',
  });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [result, setResult] = useState(null); // { bookings, total, page, pages }
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Wait 250 ms after typing stops before searching, so we don't query on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) => (f.q === search ? f : { ...f, q: search }));
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  const loadStats = useCallback(() => api('/api/stats').then(setStats).catch((e) => setError(e.message)), []);
  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const filterQuery = new URLSearchParams(Object.entries(filters).filter(([, v]) => v !== '' && v !== 'all')).toString();

  // Each page is fetched from the server (the database does the paging).
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api(`/api/bookings?${filterQuery}&page=${page}&pageSize=${PAGE_SIZE}`)
      .then((d) => {
        if (cancelled) return;
        setResult(d);
        if (d.page !== page) setPage(d.page); // e.g. the last row of the last page was deleted
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [filterQuery, page, reloadKey]);

  const set = (patch) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  };
  const toggleSort = (key) => set({ sort: key, order: filters.sort === key && filters.order === 'desc' ? 'asc' : 'desc' });
  const arrow = (key) => (filters.sort === key ? (filters.order === 'asc' ? ' ↑' : ' ↓') : '');
  const filtered = filters.q || filters.status !== 'all' || filters.puja !== 'all';
  const bookings = result?.bookings;

  async function confirmDelete() {
    setDeleting(true);
    try {
      const { notificationsDeleted } = await api(`/api/bookings/${toDelete.bookingId}`, { method: 'DELETE' });
      setToast(`Deleted ${toDelete.bookingId}${notificationsDeleted ? ` and ${notificationsDeleted} message(s)` : ''}`);
      setTimeout(() => setToast(''), 3500);
      setToDelete(null);
      setReloadKey((k) => k + 1);
      loadStats();
    } catch (e) {
      setError(e.message);
      setToDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  const stop = (e) => e.stopPropagation();
  const from = result ? (result.page - 1) * PAGE_SIZE + 1 : 0;
  const to = result ? Math.min(result.page * PAGE_SIZE, result.total) : 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Puja bookings</h1>
          <p className="muted">Search, filter, edit and move bookings through the puja workflow.</p>
        </div>
        <div className="head-actions">
          {/* Exported on the server: every matching booking, not just this page. */}
          <a className={`btn ${result?.total ? '' : 'disabled'}`} href={`/api/bookings/export?${filterQuery}`} download>
            <Icon name="download" /> Export CSV
          </a>
          {can('bookings:create') && (
            <Link href="/bookings/new" className="btn btn-primary">
              <Icon name="plus" /> New booking
            </Link>
          )}
        </div>
      </div>

      <ErrorNote error={error} />

      <section className="stats" aria-label="Filter by status">
        <button className={`card stat ${filters.status === 'all' ? 'active' : ''}`} onClick={() => set({ status: 'all' })}>
          <div className="num">{stats ? stats.total : '–'}</div>
          <div className="lbl">All bookings</div>
        </button>
        {ALL_STATUSES.map((s) => (
          <button
            key={s}
            className={`card stat ${filters.status === s ? 'active' : ''} ${s === 'Cancelled' ? 'stat-cancel' : ''}`}
            onClick={() => set({ status: filters.status === s ? 'all' : s })}
          >
            <div className="num">{stats ? stats.byStatus[s] : '–'}</div>
            <div className="lbl">{s}</div>
          </button>
        ))}
      </section>

      <div className="filters">
        <input
          type="search"
          placeholder="Search by booking ID, devotee, puja, temple or phone…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          aria-label="Search bookings"
        />
        <select value={filters.status} onChange={(e) => set({ status: e.target.value })} aria-label="Filter by status">
          <option value="all">All statuses</option>
          {ALL_STATUSES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select value={filters.puja} onChange={(e) => set({ puja: e.target.value })} aria-label="Filter by puja">
          <option value="all">All pujas</option>
          {(stats?.pujas || []).map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <select
          value={`${filters.sort}:${filters.order}`}
          onChange={(e) => {
            const [sort, order] = e.target.value.split(':');
            set({ sort, order });
          }}
          aria-label="Sort"
        >
          <option value="date:desc">Puja date (latest first)</option>
          <option value="date:asc">Puja date (earliest first)</option>
          <option value="amount:desc">Amount (high to low)</option>
          <option value="amount:asc">Amount (low to high)</option>
          <option value="devotee:asc">Devotee (A–Z)</option>
          <option value="created:desc">Recently created</option>
        </select>
        {filtered && (
          <button
            className="btn btn-ghost"
            onClick={() => {
              setSearch('');
              set(DEFAULT_FILTERS);
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      <div className={`table-wrap ${loading && bookings ? 'is-loading' : ''}`}>
        <table>
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th key={c.label} className={c.className}>
                  {c.key ? <button onClick={() => toggleSort(c.key)}>{c.label + arrow(c.key)}</button> : c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!bookings &&
              [0, 1, 2, 3].map((i) => (
                <tr key={i}>
                  <td colSpan={COLUMNS.length}>
                    <div className="skeleton" />
                  </td>
                </tr>
              ))}
            {bookings?.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="empty">
                  No bookings match these filters.
                </td>
              </tr>
            )}
            {bookings?.map((b) => (
              <tr
                key={b.bookingId}
                className={b.status === 'Cancelled' ? 'row-cancelled' : ''}
                onClick={() => router.push(`/bookings/${b.bookingId}`)}
                onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && router.push(`/bookings/${b.bookingId}`)}
                tabIndex={0}
              >
                <td className="mono">{b.bookingId}</td>
                <td>
                  {b.devoteeName}
                  <span className="sub">{b.phone}</span>
                </td>
                <td>
                  {b.pujaName}
                  <span className="sub">{b.templeName}</span>
                </td>
                <td>{formatDate(b.pujaDate)}</td>
                <td className="amount">{formatINR(b.amount)}</td>
                <td>
                  <StatusBadge status={b.status} />
                </td>
                <td className="col-actions" onClick={stop}>
                  <div className="row-actions">
                    <Link href={`/bookings/${b.bookingId}`} className="icon-btn" title="View" aria-label={`View ${b.bookingId}`}>
                      <Icon name="eye" />
                    </Link>
                    {can('bookings:edit') && (
                      <Link href={`/bookings/${b.bookingId}/edit`} className="icon-btn" title="Edit" aria-label={`Edit ${b.bookingId}`}>
                        <Icon name="edit" />
                      </Link>
                    )}
                    {can('bookings:delete') && (
                      <button className="icon-btn danger" title="Delete" aria-label={`Delete ${b.bookingId}`} onClick={() => setToDelete(b)}>
                        <Icon name="trash" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {result && result.total > 0 && (
        <div className="pager">
          <span className="muted small">
            Showing {from}–{to} of {result.total}
          </span>
          <div className="pager-btns">
            <button className="icon-btn" onClick={() => setPage((p) => p - 1)} disabled={result.page <= 1 || loading} aria-label="Previous page">
              <Icon name="chevronLeft" />
            </button>
            <span className="small">
              Page {result.page} of {result.pages}
            </span>
            <button
              className="icon-btn"
              onClick={() => setPage((p) => p + 1)}
              disabled={result.page >= result.pages || loading}
              aria-label="Next page"
            >
              <Icon name="chevronRight" />
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!toDelete}
        title={`Delete booking ${toDelete?.bookingId}?`}
        busy={deleting}
        onCancel={() => setToDelete(null)}
        onConfirm={confirmDelete}
      >
        <p>
          <b>{toDelete?.pujaName}</b> for <b>{toDelete?.devoteeName}</b> ({formatINR(toDelete?.amount)}) and its WhatsApp message
          history will be removed permanently. This cannot be undone.
        </p>
        {['Pending', 'Confirmed', 'In Progress'].includes(toDelete?.status) && (
          <p className="warn-note">
            To keep a record, open the booking and use <b>Cancel booking</b> instead.
          </p>
        )}
      </ConfirmDialog>

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}

// useSearchParams needs a Suspense boundary in the App Router.
export default function BookingsPage() {
  return (
    <Suspense fallback={<div className="card"><div className="skeleton" /></div>}>
      <BookingsTable />
    </Suspense>
  );
}
