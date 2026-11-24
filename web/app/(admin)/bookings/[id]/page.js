'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { STATUSES, STATUS_META, nextStatus, messageForStatus } from '@/lib/workflow.js';
import { StatusBadge, WorkflowStepper, ConfirmDialog, formatINR, formatDate, ErrorNote, api } from '@/components/ui.js';
import { Icon } from '@/components/icons.js';

export default function BookingDetailsPage() {
  return (
    <Suspense fallback={null}>
      <BookingDetails />
    </Suspense>
  );
}

function BookingDetails() {
  const { id } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  const load = () =>
    api(`/api/bookings/${id}`)
      .then(setData)
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Coming back from the edit page.
  useEffect(() => {
    if (searchParams.get('saved')) {
      setToast('Booking details saved');
      router.replace(`/bookings/${id}`, { scroll: false });
      const t = setTimeout(() => setToast(''), 3000);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [searchParams, id, router]);

  async function remove() {
    setDeleting(true);
    try {
      await api(`/api/bookings/${id}`, { method: 'DELETE' });
      router.push('/bookings');
    } catch (e) {
      setError(e.message);
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  const booking = data?.booking;
  const upcoming = booking ? nextStatus(booking.status) : null;

  // Live preview of the WhatsApp message the next step will send.
  const preview = useMemo(() => {
    if (!booking || !upcoming) return '';
    try {
      return messageForStatus(upcoming, { ...booking, videoUrl: videoUrl || '<video link>' }) || '';
    } catch {
      return '';
    }
  }, [booking, upcoming, videoUrl]);

  async function advance() {
    setSaving(true);
    setError('');
    try {
      const result = await api(`/api/bookings/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: upcoming, videoUrl: videoUrl || undefined, note: note || undefined }),
      });
      setVideoUrl('');
      setNote('');
      await load();
      setToast(result.notification ? `Moved to ${upcoming} · WhatsApp message sent (mock)` : `Moved to ${upcoming}`);
      setTimeout(() => setToast(''), 3500);
    } catch (e) {
      setError(e.message);
      await load(); // pick up a change made by someone else
    } finally {
      setSaving(false);
    }
  }

  if (!data) {
    return (
      <>
        <ErrorNote error={error} />
        {!error && <div className="card"><div className="skeleton" /><div className="skeleton" /></div>}
      </>
    );
  }

  return (
    <>
      <Link href="/bookings" className="back-link">
        <Icon name="arrowLeft" size={16} /> All bookings
      </Link>
      <div className="page-head">
        <div>
          <h1>
            {booking.pujaName} <span className="muted">for</span> {booking.devoteeName}
          </h1>
          <p className="muted mono">
            {booking.bookingId} · created {formatDate(booking.createdAt, true)} · via {booking.source}
          </p>
        </div>
        <div className="head-actions">
          <StatusBadge status={booking.status} />
          <Link href={`/bookings/${id}/edit`} className="btn btn-sm">
            <Icon name="edit" size={16} /> Edit
          </Link>
          <button className="btn btn-sm btn-danger-outline" onClick={() => setConfirmDelete(true)}>
            <Icon name="trash" size={16} /> Delete
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <WorkflowStepper status={booking.status} history={booking.statusHistory} />
      </div>

      <ErrorNote error={error} />

      <div className="grid-2">
        <div className="stack">
          {upcoming ? (
            <section className="card action">
              <h2 className="section-title">Next step: {STATUS_META[upcoming].stage}</h2>
              <div className="stack">
                {upcoming === 'Video Available' && (
                  <label className="field">
                    Puja video link
                    <input
                      type="url"
                      placeholder="https://…"
                      value={videoUrl}
                      onChange={(e) => setVideoUrl(e.target.value)}
                      required
                    />
                  </label>
                )}
                <label className="field">
                  Internal note (optional)
                  <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Pandit ji confirmed by phone" />
                </label>
                {preview && (
                  <div>
                    <p className="muted" style={{ fontSize: 13, margin: '0 0 6px' }}>
                      This WhatsApp message will be sent to {booking.phone}:
                    </p>
                    <div className="chat">
                      <div className="bubble preview">{preview}</div>
                    </div>
                  </div>
                )}
                <button
                  className="btn btn-primary"
                  onClick={advance}
                  disabled={saving || (upcoming === 'Video Available' && !videoUrl)}
                >
                  {saving ? 'Updating…' : `Move to "${upcoming}"`}
                </button>
              </div>
            </section>
          ) : (
            <section className="card action">
              <h2 className="section-title">Workflow complete 🙏</h2>
              <p className="muted">
                The devotee has received their puja video{' '}
                {booking.videoUrl && (
                  <a href={booking.videoUrl} target="_blank" rel="noreferrer">
                    (open video)
                  </a>
                )}
                .
              </p>
            </section>
          )}

          <section className="card">
            <h2 className="section-title">WhatsApp notifications ({data.notifications.length})</h2>
            {data.notifications.length === 0 ? (
              <p className="muted">No messages yet. The first one is sent when the booking is confirmed.</p>
            ) : (
              <div className="chat">
                {[...data.notifications]
                  .sort((a, b) => STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status))
                  .map((n) => (
                  <div key={n.id} className="bubble">
                    {n.message}
                    <div className="bubble-meta">
                      <span>{n.status}</span>
                      <span>
                        {formatDate(n.createdAt, true)} <span className="ticks">✓✓</span> {n.delivery?.provider}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="stack">
          <section className="card">
            <h2 className="section-title">Booking details</h2>
            <dl className="kv">
              <dt>Devotee</dt>
              <dd>{booking.devoteeName}</dd>
              <dt>WhatsApp</dt>
              <dd>{booking.phone}</dd>
              {booking.email && (
                <>
                  <dt>Email</dt>
                  <dd>{booking.email}</dd>
                </>
              )}
              {booking.gotra && (
                <>
                  <dt>Gotra</dt>
                  <dd>{booking.gotra}</dd>
                </>
              )}
              <dt>Puja</dt>
              <dd>{booking.pujaName}</dd>
              <dt>Temple</dt>
              <dd>{booking.templeName}</dd>
              <dt>Puja date</dt>
              <dd>{formatDate(booking.pujaDate)}</dd>
              <dt>Amount</dt>
              <dd className="amount">{formatINR(booking.amount)}</dd>
              {booking.addOns?.length > 0 && (
                <>
                  <dt>Add-ons</dt>
                  <dd>{booking.addOns.map((a) => `${a.name} (${formatINR(a.price)})`).join(', ')}</dd>
                </>
              )}
              {booking.shopifyOrderId && (
                <>
                  <dt>Shopify order</dt>
                  <dd className="mono">#{booking.shopifyOrderId}</dd>
                </>
              )}
            </dl>
          </section>

          <section className="card">
            <h2 className="section-title">Status history</h2>
            <ul className="timeline">
              {booking.statusHistory.map((h, i) => (
                <li key={i}>
                  <span>
                    <StatusBadge status={h.status} /> {h.note && <span className="muted"> · {h.note}</span>}
                    {h.by && !String(h.note || '').includes(h.by) && <span className="muted"> · by {h.by}</span>}
                  </span>
                  <span className="muted">{formatDate(h.at, true)}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      {(booking.updatedBy || booking.createdBy) && (
        <p className="muted small" style={{ marginTop: 16 }}>
          {booking.createdBy && <>Created by {booking.createdBy}. </>}
          {booking.updatedBy && <>Last edited by {booking.updatedBy} on {formatDate(booking.updatedAt, true)}.</>}
        </p>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete booking ${booking.bookingId}?`}
        busy={deleting}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={remove}
      >
        <p>
          <b>{booking.pujaName}</b> for <b>{booking.devoteeName}</b> and its {data.notifications.length} WhatsApp message(s) will
          be removed permanently. This cannot be undone.
        </p>
      </ConfirmDialog>

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
