'use client';

import { useEffect, useMemo, useState } from 'react';
import { messageForStatus, formatPujaDate, RESCHEDULED } from '@/lib/workflow.js';
import { ConfirmDialog, ErrorNote, formatDate, api } from './ui.js';
import SlotPicker from './slot-picker.js';

// Move a booking to another slot at the same temple, or give a "needs a slot"
// booking its first one. Shows exactly what changes and what the devotee will be sent.
export default function RescheduleDialog({ open, booking, templates, onClose, onDone }) {
  const [slot, setSlot] = useState(null);
  const [reason, setReason] = useState('');
  const [notifyDevotee, setNotifyDevotee] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setSlot(null);
    setReason('');
    setNotifyDevotee(true);
    setError('');
  }, [open]);

  const hasSlot = !!booking?.slotId;
  const confirmed = booking?.status === 'Confirmed';
  const message = useMemo(() => {
    if (!booking || !slot || !confirmed) return '';
    try {
      return messageForStatus(RESCHEDULED, { ...booking, pujaDate: slot.startsAt }, templates || undefined) || '';
    } catch {
      return '';
    }
  }, [booking, slot, confirmed, templates]);

  async function submit() {
    setBusy(true);
    setError('');
    try {
      const result = await api(`/api/bookings/${booking.bookingId}/reschedule`, {
        method: 'POST',
        body: JSON.stringify({ slotId: slot.id, reason, notifyDevotee }),
      });
      onDone(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!booking) return null;
  return (
    <ConfirmDialog
      open={open}
      wide
      title={hasSlot ? `Reschedule ${booking.bookingId}` : `Assign a slot to ${booking.bookingId}`}
      tone="primary"
      confirmLabel={!slot ? 'Pick a new time' : message && notifyDevotee ? 'Reschedule & send' : hasSlot ? 'Reschedule' : 'Assign slot'}
      busyLabel="Saving…"
      busy={busy}
      confirmDisabled={!slot}
      onCancel={onClose}
      onConfirm={submit}
    >
      <p style={{ margin: '4px 0 10px' }}>
        {booking.pujaName} for <b>{booking.devoteeName}</b> at {booking.templeName}.{' '}
        {hasSlot ? (
          <>
            Now on <b>{formatPujaDate(booking.pujaDate)}</b>.
          </>
        ) : (
          <>{booking.slotNote || `Requested for ${formatDate(booking.pujaDate)}.`}</>
        )}
      </p>
      <SlotPicker templeName={booking.templeName} value={slot?.id} currentSlotId={booking.slotId} currentSelectable={false} onChange={setSlot} />

      {slot && (
        <p className="move-summary">
          {hasSlot && (
            <>
              <b>{formatPujaDate(booking.pujaDate)}</b> <span className="arrow">→</span>
            </>
          )}
          <b>{formatPujaDate(slot.startsAt)}</b>
        </p>
      )}

      <label className="field">
        Reason (optional, kept in the booking&rsquo;s history)
        <input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Devotee asked for a later date" />
      </label>

      {confirmed ? (
        <>
          <label className="check">
            <input type="checkbox" checked={notifyDevotee} onChange={(e) => setNotifyDevotee(e.target.checked)} />
            Tell {booking.devoteeName} the new time on WhatsApp ({booking.phone})
          </label>
          {message && notifyDevotee && (
            <div className="chat">
              <div className="bubble preview">{message}</div>
            </div>
          )}
        </>
      ) : (
        <p className="muted small" style={{ marginTop: 12 }}>
          {booking.devoteeName} hasn&rsquo;t been sent a time yet, so no message goes out now. The confirmation will carry the new time.
        </p>
      )}
      <p className="warn-note">
        The new seat is reserved first; {hasSlot ? 'the current one is then released for other devotees.' : 'the booking can then be confirmed.'}
      </p>
      <ErrorNote error={error} />
    </ConfirmDialog>
  );
}
