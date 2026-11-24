'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { PUJAS } from '@/lib/seed-data.js';
import { formatPujaDate } from '@/lib/workflow.js';
import { ErrorNote } from './ui.js';
import SlotPicker from './slot-picker.js';

const TEMPLES = [...new Set(PUJAS.map((p) => p.templeName))];

const EMPTY = {
  devoteeName: '',
  phone: '',
  email: '',
  gotra: '',
  pujaName: PUJAS[0].pujaName,
  templeName: PUJAS[0].templeName,
  amount: PUJAS[0].amount,
  slotId: '',
};

function fromBooking(b) {
  return {
    devoteeName: b.devoteeName || '',
    phone: b.phone || '',
    email: b.email || '',
    gotra: b.gotra || '',
    pujaName: b.pujaName || '',
    templeName: b.templeName || '',
    amount: b.amount ?? '',
    slotId: b.slotId || '',
  };
}

// Used by both "New booking" and "Edit booking".
// In edit mode, onSubmit receives only the fields that changed.
export default function BookingForm({ booking, submitLabel, savingLabel, onSubmit, onCancel }) {
  const initial = useMemo(() => (booking ? fromBooking(booking) : EMPTY), [booking]);
  const [form, setForm] = useState(initial);
  const [picked, setPicked] = useState(null); // the chosen slot, for the summary line
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const changed = Object.keys(form).filter((k) => String(form[k]) !== String(initial[k]));
  const pujaOptions = PUJAS.some((p) => p.pujaName === form.pujaName)
    ? PUJAS
    : [{ pujaName: form.pujaName, templeName: form.templeName, amount: form.amount }, ...PUJAS];
  const templeOptions = TEMPLES.includes(form.templeName) ? TEMPLES : [form.templeName, ...TEMPLES];

  const creating = !booking;
  // A booking's slot belongs to one temple; it moves through Reschedule, not here.
  const templeLocked = booking && (booking.slotId || !['Pending', 'Confirmed'].includes(booking.status));
  const reschedulable = booking && ['Pending', 'Confirmed'].includes(booking.status);

  // A slot belongs to one temple, so changing the temple clears the chosen slot.
  function chooseTemple(templeName) {
    if (templeLocked) return;
    set({ templeName, ...(creating ? { slotId: '' } : {}) });
    setPicked(null);
  }

  function choosePuja(name) {
    const puja = PUJAS.find((p) => p.pujaName === name);
    if (!puja) return set({ pujaName: name });
    // When editing, keep the agreed amount unless the admin changes it.
    set({ pujaName: name, ...(booking ? {} : { amount: puja.amount }) });
    chooseTemple(puja.templeName);
  }

  async function submit(e) {
    e.preventDefault();
    if (creating && !form.slotId) return setError('Pick a slot: a day and a time with a free pandit.');
    setSaving(true);
    setError('');
    try {
      await onSubmit(booking ? Object.fromEntries(changed.filter((k) => k !== 'slotId').map((k) => [k, form[k]])) : form);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <form className="card form-grid" onSubmit={submit}>
      <h2 className="section-title span-2">Devotee</h2>
      <label className="field">
        Devotee name *
        <input required value={form.devoteeName} onChange={(e) => set({ devoteeName: e.target.value })} />
      </label>
      <label className="field">
        WhatsApp number *
        <input
          required
          type="tel"
          placeholder="+91 98765 43210"
          value={form.phone}
          onChange={(e) => set({ phone: e.target.value })}
        />
      </label>
      <label className="field">
        Email
        <input type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} />
      </label>
      <label className="field">
        Gotra
        <input value={form.gotra} onChange={(e) => set({ gotra: e.target.value })} />
      </label>

      <h2 className="section-title span-2" style={{ marginTop: 8 }}>
        Puja
      </h2>
      <label className="field">
        Puja *
        <select value={form.pujaName} onChange={(e) => choosePuja(e.target.value)}>
          {pujaOptions.map((p) => (
            <option key={p.pujaName}>{p.pujaName}</option>
          ))}
        </select>
      </label>
      <label className="field">
        Temple *
        <select value={form.templeName} onChange={(e) => chooseTemple(e.target.value)} disabled={templeLocked} title={templeLocked ? 'The temple is fixed by the booking\'s slot' : undefined}>
          {templeOptions.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </label>
      <label className="field">
        Amount (₹) *
        <input required type="number" min="1" value={form.amount} onChange={(e) => set({ amount: e.target.value })} />
      </label>

      <div className="field span-2">
        <span>{creating ? 'Slot *' : 'Slot'}</span>
        {creating ? (
          <>
            <SlotPicker
              templeName={form.templeName}
              value={form.slotId}
              onChange={(slot) => {
                set({ slotId: slot.id });
                setPicked(slot);
              }}
            />
            {picked && form.slotId && (
              <p className="muted small" style={{ margin: '8px 0 0' }}>
                Puja on <b>{formatPujaDate(picked.startsAt)}</b>
              </p>
            )}
          </>
        ) : (
          <p style={{ margin: '4px 0 0' }}>
            {booking.slotId ? formatPujaDate(booking.pujaDate) : <span className="badge badge-slot">Needs a slot</span>}{' '}
            {reschedulable ? (
              <Link href={`/bookings/${booking.bookingId}?reschedule=1`} className="link-sm">
                {booking.slotId ? 'Reschedule…' : 'Assign a slot…'}
              </Link>
            ) : (
              <span className="muted small">A booking that is &ldquo;{booking.status}&rdquo; can&rsquo;t be rescheduled.</span>
            )}
          </p>
        )}
      </div>

      <div className="span-2">
        <ErrorNote error={error} />
        <div className="form-actions">
          <button className="btn btn-primary" disabled={saving || (booking && changed.length === 0)}>
            {saving ? savingLabel : submitLabel}
          </button>
          {onCancel && (
            <button type="button" className="btn" onClick={onCancel} disabled={saving}>
              Cancel
            </button>
          )}
          {booking && <span className="muted small">{changed.length ? `${changed.length} unsaved change(s)` : 'No changes yet'}</span>}
        </div>
      </div>
    </form>
  );
}
