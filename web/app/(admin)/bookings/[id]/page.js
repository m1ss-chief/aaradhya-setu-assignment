'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ALL_STATUSES, STATUS_META, nextStatus, messageForStatus, canCancel } from '@/lib/workflow.js';
import { StatusBadge, WorkflowStepper, ConfirmDialog, formatINR, formatDate, ErrorNote, api } from '@/components/ui.js';
import { Icon } from '@/components/icons.js';
import MessageBubble from '@/components/message-bubble.js';
import { useAdmin } from '@/components/admin-context.js';

export default function BookingDetailsPage() {
  return (
    <Suspense fallback={null}>
      <BookingDetails />
    </Suspense>
  );
}

function preview(status, booking, templates, extra) {
  try {
    return messageForStatus(status, booking, templates || undefined, extra) || '';
  } catch {
    return '';
  }
}

function BookingDetails() {
  const { id } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { can } = useAdmin();

  const [data, setData] = useState(null);
  const [templates, setTemplates] = useState(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const [videoUrl, setVideoUrl] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmAdvance, setConfirmAdvance] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [notifyDevotee, setNotifyDevotee] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState('');

  const flash = (text) => {
    setToast(text);
    setTimeout(() => setToast(''), 3500);
  };

  const load = () =>
    api(`/api/bookings/${id}`)
      .then(setData)
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
    // The previews use the wording owners saved in Settings, not just the defaults.
    api('/api/templates')
      .then((d) => setTemplates(d.templates))
      .catch(() => {});
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Coming back from the edit page.
  useEffect(() => {
    if (searchParams.get('saved')) {
      flash('Booking details saved');
      router.replace(`/bookings/${id}`, { scroll: false });
    }
  }, [searchParams, id, router]);

  const booking = data?.booking;
  const upcoming = booking ? nextStatus(booking.status) : null;
  const cancelled = booking?.status === 'Cancelled';

  // Live preview of the WhatsApp message the next step will send.
  const nextMessage = useMemo(
    () => (booking && upcoming ? preview(upcoming, { ...booking, videoUrl: videoUrl || '<video link>' }, templates) : ''),
    [booking, upcoming, videoUrl, templates],
  );
  const cancelMessage = useMemo(
    () => (booking ? preview('Cancelled', booking, templates, { reason: cancelReason.trim() || '<reason>' }) : ''),
    [booking, templates, cancelReason],
  );

  async function advance() {
    setConfirmAdvance(false);
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
      const d = result.notification?.delivery;
      flash(
        !result.notification
          ? `Moved to ${upcoming}`
          : d?.status === 'failed'
            ? `Moved to ${upcoming} · WhatsApp message failed: ${d.error}`
            : `Moved to ${upcoming} · WhatsApp message sent (mock)`,
      );
    } catch (e) {
      setError(e.message);
      await load(); // pick up a change made by someone else
    } finally {
      setSaving(false);
    }
  }

  async function cancelBooking() {
    setCancelling(true);
    setCancelError('');
    try {
      await api(`/api/bookings/${id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: cancelReason, notifyDevotee }),
      });
      setCancelOpen(false);
      setCancelReason('');
      await load();
      flash(notifyDevotee ? 'Booking cancelled · devotee messaged (mock)' : 'Booking cancelled');
    } catch (e) {
      setCancelError(e.message);
    } finally {
      setCancelling(false);
    }
  }

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

  if (!data) {
    return (
      <>
        <ErrorNote error={error} />
        {!error && (
          <div className="card">
            <div className="skeleton" />
            <div className="skeleton" />
          </div>
        )}
      </>
    );
  }

  const failedCount = data.notifications.filter((n) => n.delivery?.status === 'failed').length;

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
          {can('bookings:edit') && (
            <Link href={`/bookings/${id}/edit`} className="btn btn-sm">
              <Icon name="edit" size={16} /> Edit
            </Link>
          )}
          {can('bookings:cancel') && canCancel(booking.status) && (
            <button className="btn btn-sm btn-warn-outline" onClick={() => setCancelOpen(true)}>
              <Icon name="ban" size={16} /> Cancel booking
            </button>
          )}
          {can('bookings:delete') && (
            <button className="btn btn-sm btn-danger-outline" onClick={() => setConfirmDelete(true)}>
              <Icon name="trash" size={16} /> Delete
            </button>
          )}
        </div>
      </div>

      {cancelled && (
        <div className="cancel-banner" role="status">
          <Icon name="ban" />
          <div>
            <b>Cancelled</b> on {formatDate(booking.cancelledAt, true)}
            {booking.cancelledBy && <> by {booking.cancelledBy}</>}.<br />
            <span>Reason: {booking.cancelReason}</span>
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <WorkflowStepper status={booking.status} history={booking.statusHistory} />
      </div>

      <ErrorNote error={error} />

      <div className="grid-2">
        <div className="stack">
          {upcoming ? (
            <section className="card action">
              <h2 className="section-title">Next step: {STATUS_META[upcoming].stage}</h2>
              {can('workflow:advance') ? (
                <div className="stack">
                  {upcoming === 'Video Available' && (
                    <label className="field">
                      Puja video link
                      <input type="url" placeholder="https://…" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} required />
                    </label>
                  )}
                  <label className="field">
                    Internal note (optional)
                    <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Pandit ji confirmed by phone" />
                  </label>
                  {nextMessage && (
                    <div>
                      <p className="muted" style={{ fontSize: 13, margin: '0 0 6px' }}>
                        This WhatsApp message will be sent to {booking.phone}:
                      </p>
                      <div className="chat">
                        <div className="bubble preview">{nextMessage}</div>
                      </div>
                    </div>
                  )}
                  <button
                    className="btn btn-primary"
                    onClick={() => setConfirmAdvance(true)}
                    disabled={saving || (upcoming === 'Video Available' && !/^https?:\/\/\S+$/i.test(videoUrl))}
                  >
                    {saving ? 'Updating…' : `Move to "${upcoming}"`}
                  </button>
                </div>
              ) : (
                <p className="muted">Your role can view this booking but not move it forward.</p>
              )}
            </section>
          ) : cancelled ? (
            <section className="card">
              <h2 className="section-title">Booking cancelled</h2>
              <p className="muted">
                Cancelled bookings stay here for the record but can't move forward. Create a new booking if the devotee
                reschedules.
              </p>
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
            <h2 className="section-title">
              WhatsApp notifications ({data.notifications.length})
              {failedCount > 0 && <span className="badge badge-danger" style={{ marginLeft: 8 }}>{failedCount} failed</span>}
            </h2>
            {failedCount > 0 && (
              <p className="muted small" style={{ marginTop: 0 }}>
                A message failed. Check the WhatsApp number{can('bookings:edit') ? ' (Edit)' : ''}, then press Resend.
              </p>
            )}
            {data.notifications.length === 0 ? (
              <p className="muted">No messages yet. The first one is sent when the booking is confirmed.</p>
            ) : (
              <div className="chat">
                {[...data.notifications]
                  .sort((a, b) => ALL_STATUSES.indexOf(a.status) - ALL_STATUSES.indexOf(b.status))
                  .map((n) => (
                    <MessageBubble
                      key={n.id}
                      message={n}
                      canResend={can('notifications:resend')}
                      onResent={(updated) => {
                        load();
                        flash(updated.delivery.status === 'sent' ? 'Message delivered (mock)' : `Still failing: ${updated.delivery.error}`);
                      }}
                    />
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

      {upcoming && (
        <ConfirmDialog
          open={confirmAdvance}
          title={`Move ${booking.bookingId} to "${upcoming}"?`}
          tone="primary"
          confirmLabel={nextMessage ? 'Yes, update & send' : 'Yes, update status'}
          busyLabel="Updating…"
          busy={saving}
          onCancel={() => setConfirmAdvance(false)}
          onConfirm={advance}
        >
          <p className="status-change">
            <StatusBadge status={booking.status} /> <span aria-hidden>→</span> <StatusBadge status={upcoming} />
          </p>
          {nextMessage && (
            <>
              <p>
                {booking.devoteeName} will get this WhatsApp message at <b>{booking.phone}</b>:
              </p>
              <div className="chat">
                <div className="bubble preview">{nextMessage}</div>
              </div>
            </>
          )}
          <p className="warn-note">
            <b>This can't be rolled back.</b> Bookings only move forward, and a message that has been sent can't be taken
            back.
          </p>
        </ConfirmDialog>
      )}

      <ConfirmDialog
        open={cancelOpen}
        title={`Cancel booking ${booking.bookingId}?`}
        confirmLabel="Cancel booking"
        busyLabel="Cancelling…"
        busy={cancelling}
        onCancel={() => {
          setCancelOpen(false);
          setCancelError('');
        }}
        onConfirm={cancelBooking}
        confirmDisabled={!cancelReason.trim()}
        cancelLabel="Keep booking"
      >
        <p>
          <b>{booking.pujaName}</b> for <b>{booking.devoteeName}</b> will be marked as cancelled. The booking and its history are
          kept.
        </p>
        <label className="field">
          Reason (required)
          <textarea
            value={cancelReason}
            maxLength={300}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="e.g. Devotee asked to reschedule"
          />
        </label>
        <label className="check">
          <input type="checkbox" checked={notifyDevotee} onChange={(e) => setNotifyDevotee(e.target.checked)} />
          Send a WhatsApp message to {booking.devoteeName}
        </label>
        {notifyDevotee && cancelMessage && (
          <div className="chat" style={{ marginTop: 10 }}>
            <div className="bubble preview">{cancelMessage}</div>
          </div>
        )}
        <p className="warn-note">
          <b>This can't be undone.</b> A cancelled booking can't move forward again.
        </p>
        {cancelError && <p className="error-note">{cancelError}</p>}
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete booking ${booking.bookingId}?`}
        busy={deleting}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={remove}
      >
        <p>
          <b>{booking.pujaName}</b> for <b>{booking.devoteeName}</b> and its {data.notifications.length} WhatsApp message(s) will be
          removed permanently. This cannot be undone.
        </p>
        {canCancel(booking.status) && <p className="warn-note">To keep a record, use <b>Cancel booking</b> instead.</p>}
      </ConfirmDialog>

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
