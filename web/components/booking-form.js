'use client';

import { useMemo, useState } from 'react';
import { PUJAS } from '@/lib/seed-data.js';
import { ErrorNote, toDateInput } from './ui.js';

const EMPTY = {
  devoteeName: '',
  phone: '',
  email: '',
  gotra: '',
  pujaName: PUJAS[0].pujaName,
  templeName: PUJAS[0].templeName,
  amount: PUJAS[0].amount,
  pujaDate: '',
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
    pujaDate: toDateInput(b.pujaDate),
  };
}

// Used by both "New booking" and "Edit booking".
// In edit mode, onSubmit receives only the fields that changed.
export default function BookingForm({ booking, submitLabel, savingLabel, onSubmit, onCancel }) {
  const initial = useMemo(() => (booking ? fromBooking(booking) : EMPTY), [booking]);
  const [form, setForm] = useState(initial);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const changed = Object.keys(form).filter((k) => String(form[k]) !== String(initial[k]));
  const pujaOptions = PUJAS.some((p) => p.pujaName === form.pujaName)
    ? PUJAS
    : [{ pujaName: form.pujaName, templeName: form.templeName, amount: form.amount }, ...PUJAS];

  function choosePuja(name) {
    const puja = PUJAS.find((p) => p.pujaName === name);
    // When editing, keep the agreed amount unless the admin changes it.
    set(puja ? { pujaName: name, templeName: puja.templeName, ...(booking ? {} : { amount: puja.amount }) } : { pujaName: name });
  }

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSubmit(booking ? Object.fromEntries(changed.map((k) => [k, form[k]])) : form);
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
        <input required value={form.templeName} onChange={(e) => set({ templeName: e.target.value })} />
      </label>
      <label className="field">
        Puja date *
        <input required type="date" value={form.pujaDate} onChange={(e) => set({ pujaDate: e.target.value })} />
      </label>
      <label className="field">
        Amount (₹) *
        <input required type="number" min="1" value={form.amount} onChange={(e) => set({ amount: e.target.value })} />
      </label>

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
