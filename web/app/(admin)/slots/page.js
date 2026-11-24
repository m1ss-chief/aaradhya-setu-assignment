'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { PUJAS } from '@/lib/seed-data.js';
import { ConfirmDialog, ErrorNote, api } from '@/components/ui.js';
import { Icon } from '@/components/icons.js';
import { istDayOf, timeOf, dayLabel } from '@/components/slot-picker.js';

const TEMPLES = [...new Set(PUJAS.map((p) => p.templeName))];
const DAY = 24 * 60 * 60 * 1000;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const STATE_BADGE = {
  open: ['badge-success', 'Open'],
  full: ['badge-warn', 'Full'],
  closed: ['badge-neutral', 'Closed'],
  past: ['badge-neutral', 'Past'],
};
const addDays = (day, n) => istDayOf(new Date(`${day}T00:00:00+05:30`).getTime() + n * DAY);

// ───────────────────────── Create slots ─────────────────────────

function CreateSlots({ defaultTemple, onCreated, onClose }) {
  const today = istDayOf(Date.now());
  const [form, setForm] = useState({
    templeName: defaultTemple || TEMPLES[0],
    from: addDays(today, 1),
    to: addDays(today, 14),
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    times: ['07:00', '10:00'],
    durationMinutes: 120,
    capacity: 2,
    note: '',
  });
  const [newTime, setNewTime] = useState('17:00');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  // Live count, so the admin sees what they are about to create.
  const count = useMemo(() => {
    if (!form.from || !form.to || form.to < form.from) return 0;
    let n = 0;
    for (let d = form.from; d <= form.to && n < 10000; d = addDays(d, 1)) {
      if (form.weekdays.includes(new Date(`${d}T00:00:00Z`).getUTCDay())) n += form.times.length;
    }
    return n;
  }, [form]);

  const toggleDay = (d) => set({ weekdays: form.weekdays.includes(d) ? form.weekdays.filter((x) => x !== d) : [...form.weekdays, d].sort() });
  const addTime = () => newTime && !form.times.includes(newTime) && set({ times: [...form.times, newTime].sort() });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await api('/api/slots', { method: 'POST', body: JSON.stringify(form) });
      onCreated(result, form.templeName);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card form-grid create-slots" onSubmit={submit}>
      <div className="span-2 card-head">
        <h2 className="section-title">Create slots</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
          <Icon name="close" />
        </button>
      </div>
      <label className="field">
        Temple
        <select value={form.templeName} onChange={(e) => set({ templeName: e.target.value })}>
          {TEMPLES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </label>
      <div className="grid-dates">
        <label className="field">
          From
          <input type="date" required min={today} value={form.from} onChange={(e) => set({ from: e.target.value })} />
        </label>
        <label className="field">
          To
          <input type="date" required min={form.from} value={form.to} onChange={(e) => set({ to: e.target.value })} />
        </label>
      </div>
      <div className="field">
        <span>On these days</span>
        <div className="chip-row">
          {WEEKDAYS.map((w, i) => (
            <button key={w} type="button" className={`pill ${form.weekdays.includes(i) ? 'on' : ''}`} aria-pressed={form.weekdays.includes(i)} onClick={() => toggleDay(i)}>
              {w}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span>Start times (India time)</span>
        <div className="chip-row">
          {form.times.map((t) => (
            <span key={t} className="pill on">
              {t}
              <button type="button" aria-label={`Remove ${t}`} onClick={() => set({ times: form.times.filter((x) => x !== t) })}>
                ×
              </button>
            </span>
          ))}
          <span className="add-time">
            <input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} aria-label="Add a start time" />
            <button type="button" className="btn btn-sm" onClick={addTime}>
              Add
            </button>
          </span>
        </div>
      </div>
      <label className="field">
        Duration
        <select value={form.durationMinutes} onChange={(e) => set({ durationMinutes: Number(e.target.value) })}>
          {[60, 90, 120, 180, 240].map((m) => (
            <option key={m} value={m}>
              {m >= 60 ? `${m / 60} hour${m > 60 ? 's' : ''}`.replace('1.5 hours', '1½ hours') : `${m} min`}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Pandits available (pujas at once)
        <input type="number" min="1" max="50" required value={form.capacity} onChange={(e) => set({ capacity: e.target.value })} />
      </label>
      <label className="field span-2">
        Note (optional, shown to admins)
        <input value={form.note} maxLength={200} placeholder="e.g. Pandit Sharma and Pandit Joshi" onChange={(e) => set({ note: e.target.value })} />
      </label>
      <div className="span-2">
        <ErrorNote error={error} />
        <div className="form-actions">
          <button className="btn btn-primary" disabled={busy || !count}>
            {busy ? 'Creating…' : `Create ${count} slot${count === 1 ? '' : 's'}`}
          </button>
          <span className="muted small">Times that overlap an existing slot at this temple are skipped, so pandits are never double-booked.</span>
        </div>
      </div>
    </form>
  );
}

// ───────────────────────── One slot ─────────────────────────

function SlotRow({ slot, showTemple, onChange, onAsk }) {
  const [busy, setBusy] = useState(false);
  const past = slot.state === 'past';
  const [cls, label] = STATE_BADGE[slot.state];

  async function patch(changes) {
    setBusy(true);
    try {
      onChange(await api(`/api/slots/${slot.id}`, { method: 'PATCH', body: JSON.stringify(changes) }));
    } catch (e) {
      onChange(null, e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className={`slot-row ${past ? 'is-past' : ''}`}>
      <div className="slot-time">
        <b>{timeOf(slot.startsAt)}</b>
        <span className="muted small">to {timeOf(slot.endsAt)}</span>
      </div>
      <div className="slot-main">
        {showTemple && <div className="slot-temple">{slot.templeName}</div>}
        <div className="meter" role="img" aria-label={`${slot.booked} of ${slot.capacity} booked`}>
          {Array.from({ length: slot.capacity }, (_, i) => (
            <span key={i} className={i < slot.booked ? 'seat taken' : 'seat'} />
          ))}
        </div>
        <div className="small muted">
          {slot.booked} of {slot.capacity} booked{slot.note ? ` · ${slot.note}` : ''}
        </div>
      </div>
      <span className={`badge ${cls}`}>{label}</span>
      <div className="slot-actions">
        {slot.booked > 0 && (
          <Link className="btn btn-sm" href={`/bookings?slot=${slot.id}`}>
            Bookings ({slot.booked})
          </Link>
        )}
        {!past && (
          <>
            <div className="stepper-ctl" aria-label="Pandits available">
              <button type="button" disabled={busy || slot.capacity <= Math.max(1, slot.booked)} onClick={() => patch({ capacity: slot.capacity - 1 })} aria-label="One pandit fewer" title={slot.capacity <= slot.booked ? "Can't go below the bookings already made" : 'One pandit fewer'}>
                −
              </button>
              <span title="Pandits available">{slot.capacity}</span>
              <button type="button" disabled={busy || slot.capacity >= 50} onClick={() => patch({ capacity: slot.capacity + 1 })} aria-label="One more pandit">
                +
              </button>
            </div>
            {slot.status === 'open' ? (
              <button type="button" className="btn btn-sm" disabled={busy} onClick={() => onAsk('close', slot)}>
                Close
              </button>
            ) : (
              <button type="button" className="btn btn-sm" disabled={busy} onClick={() => patch({ status: 'open' })}>
                Reopen
              </button>
            )}
            <button
              type="button"
              className="icon-btn danger"
              disabled={busy || slot.booked > 0}
              title={slot.booked > 0 ? 'Bookings hold seats in this slot: move or cancel them first, or close the slot' : 'Delete slot'}
              aria-label="Delete slot"
              onClick={() => onAsk('delete', slot)}
            >
              <Icon name="trash" />
            </button>
          </>
        )}
      </div>
    </li>
  );
}

// ───────────────────────── Page ─────────────────────────

function SlotsPage() {
  const params = useSearchParams();
  const today = istDayOf(Date.now());
  const [temple, setTemple] = useState(params.get('temple') || 'all');
  const [start, setStart] = useState(today);
  const [slots, setSlots] = useState(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [skipped, setSkipped] = useState([]);
  const [creating, setCreating] = useState(params.has('temple') && params.get('new') === '1');
  const [ask, setAsk] = useState(null); // { kind: 'close' | 'delete', slot }
  const [busy, setBusy] = useState(false);
  const end = addDays(start, 6);

  const flash = (text) => {
    setToast(text);
    setTimeout(() => setToast(''), 3500);
  };

  const load = useCallback(() => {
    setError('');
    api(`/api/slots?temple=${encodeURIComponent(temple)}&from=${start}&to=${end}`)
      .then((d) => setSlots(d.slots))
      .catch((e) => setError(e.message));
  }, [temple, start, end]);
  useEffect(() => {
    load();
  }, [load]);

  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const byDay = useMemo(() => {
    const map = Object.fromEntries(days.map((d) => [d, []]));
    for (const s of slots || []) map[istDayOf(s.startsAt)]?.push(s);
    return map;
  }, [slots, start]); // eslint-disable-line react-hooks/exhaustive-deps

  const upcoming = (slots || []).filter((s) => s.state !== 'past');
  const summary = {
    seats: upcoming.filter((s) => s.status === 'open').reduce((n, s) => n + s.capacity, 0),
    booked: upcoming.reduce((n, s) => n + s.booked, 0),
    full: upcoming.filter((s) => s.state === 'full').length,
    closed: upcoming.filter((s) => s.state === 'closed').length,
  };

  function replace(updated, message) {
    if (message) return setError(message);
    setSlots((list) => list.map((s) => (s.id === updated.slot.id ? updated.slot : s)));
  }

  async function confirmAsk() {
    setBusy(true);
    try {
      if (ask.kind === 'delete') {
        await api(`/api/slots/${ask.slot.id}`, { method: 'DELETE' });
        setSlots((list) => list.filter((s) => s.id !== ask.slot.id));
        flash('Slot deleted');
      } else {
        replace(await api(`/api/slots/${ask.slot.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'closed' }) }));
        flash('Slot closed to new bookings');
      }
      setAsk(null);
    } catch (e) {
      setError(e.message);
      setAsk(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Puja slots</h1>
          <p className="muted">When each temple can perform pujas, and how many at once. Bookings can only take a free seat.</p>
        </div>
        <div className="head-actions">
          <button className="btn btn-primary" onClick={() => setCreating((c) => !c)} aria-expanded={creating}>
            <Icon name="plus" /> Create slots
          </button>
        </div>
      </div>

      {creating && (
        <CreateSlots
          defaultTemple={temple !== 'all' ? temple : ''}
          onClose={() => setCreating(false)}
          onCreated={(result, createdFor) => {
            setCreating(false);
            setSkipped(result.skipped);
            flash(`Created ${result.created.length} slot(s)${result.skipped.length ? `, skipped ${result.skipped.length}` : ''}`);
            if (result.created[0]) {
              setTemple(createdFor);
              setStart(istDayOf(result.created[0].startsAt));
            }
            load();
          }}
        />
      )}

      {skipped.length > 0 && (
        <div className="info-note skipped">
          <b>{skipped.length} time(s) were not created:</b>
          <ul>
            {skipped.slice(0, 8).map((s) => (
              <li key={s.reason}>{s.reason}</li>
            ))}
            {skipped.length > 8 && <li>…and {skipped.length - 8} more</li>}
          </ul>
          <button className="link-sm as-link" onClick={() => setSkipped([])}>
            Dismiss
          </button>
        </div>
      )}

      <div className="filters slot-filters">
        <select value={temple} onChange={(e) => setTemple(e.target.value)} aria-label="Temple">
          <option value="all">All temples</option>
          {TEMPLES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <div className="week-nav">
          <button className="icon-btn" onClick={() => setStart(addDays(start, -7))} aria-label="Previous week">
            <Icon name="chevronLeft" />
          </button>
          <b>
            {dayLabel(start, { day: 'numeric', month: 'short' })} – {dayLabel(end, { day: 'numeric', month: 'short', year: 'numeric' })}
          </b>
          <button className="icon-btn" onClick={() => setStart(addDays(start, 7))} aria-label="Next week">
            <Icon name="chevronRight" />
          </button>
          {start !== today && (
            <button className="btn btn-sm" onClick={() => setStart(today)}>
              Today
            </button>
          )}
        </div>
      </div>

      <div className="slot-summary">
        <span>
          <b>{summary.booked}</b> of <b>{summary.seats}</b> seats booked
        </span>
        <span>
          <b>{summary.full}</b> full
        </span>
        <span>
          <b>{summary.closed}</b> closed
        </span>
      </div>

      <ErrorNote error={error} />
      {!slots ? (
        <div className="card">
          <div className="skeleton" />
          <div className="skeleton" />
        </div>
      ) : (
        <div className="slot-days">
          {days.map((d) => (
            <section key={d} className={`card slot-day ${d === today ? 'is-today' : ''}`}>
              <h2 className="section-title">
                {dayLabel(d, { weekday: 'long', day: 'numeric', month: 'short' })}
                {d === today && <span className="badge badge-info">Today</span>}
              </h2>
              {byDay[d].length ? (
                <ul className="slot-list">
                  {byDay[d].map((s) => (
                    <SlotRow key={s.id} slot={s} showTemple={temple === 'all'} onChange={replace} onAsk={(kind, slot) => setAsk({ kind, slot })} />
                  ))}
                </ul>
              ) : (
                <p className="muted small">No slots. Devotees can&rsquo;t book this day{temple === 'all' ? '' : ` at ${temple}`}.</p>
              )}
            </section>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!ask}
        title={ask?.kind === 'delete' ? 'Delete this slot?' : 'Close this slot?'}
        confirmLabel={ask?.kind === 'delete' ? 'Delete slot' : 'Close slot'}
        busyLabel={ask?.kind === 'delete' ? 'Deleting…' : 'Closing…'}
        tone={ask?.kind === 'delete' ? 'danger' : 'primary'}
        busy={busy}
        onConfirm={confirmAsk}
        onCancel={() => setAsk(null)}
      >
        {ask && (
          <p>
            {ask.slot.templeName}, {dayLabel(istDayOf(ask.slot.startsAt), { weekday: 'short', day: 'numeric', month: 'short' })} at {timeOf(ask.slot.startsAt)}.{' '}
            {ask.kind === 'delete'
              ? 'No one is booked in it. Devotees will no longer be able to choose this time.'
              : ask.slot.booked
                ? `The ${ask.slot.booked} booking(s) already in it stay as they are; no new bookings can take this time. Reopen it any time.`
                : 'No new bookings can take this time. Reopen it any time.'}
          </p>
        )}
      </ConfirmDialog>
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <SlotsPage />
    </Suspense>
  );
}
