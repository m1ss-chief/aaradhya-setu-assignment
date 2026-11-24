'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from './ui.js';

const DAY = 24 * 60 * 60 * 1000;
export const istDayOf = (d) => new Date(new Date(d).getTime() + 330 * 60 * 1000).toISOString().slice(0, 10);
export const timeOf = (d) => new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
export const dayLabel = (day, opts = { weekday: 'short', day: 'numeric', month: 'short' }) =>
  new Date(`${day}T00:00:00+05:30`).toLocaleDateString('en-IN', { ...opts, timeZone: 'Asia/Kolkata' });

// Pick a day, then a time. Full and closed slots are shown but can't be chosen,
// so the admin sees why a time is missing. `currentSlotId` (edit mode) is the
// seat the booking already holds: it is marked "Current" (and stays selectable when
// `currentSelectable`, e.g. while editing other details).
export default function SlotPicker({ templeName, value, onChange, currentSlotId, currentSelectable = true, days = 30 }) {
  const [slots, setSlots] = useState(null);
  const [error, setError] = useState('');
  const [day, setDay] = useState('');

  useEffect(() => {
    if (!templeName) return;
    let live = true;
    setSlots(null);
    setError('');
    const from = istDayOf(Date.now());
    const to = istDayOf(Date.now() + days * DAY);
    api(`/api/slots?temple=${encodeURIComponent(templeName)}&from=${from}&to=${to}`)
      .then((d) => live && setSlots(d.slots.filter((s) => s.state !== 'past')))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [templeName, days]);

  const byDay = useMemo(() => {
    const map = new Map();
    for (const s of slots || []) {
      const key = istDayOf(s.startsAt);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(s);
    }
    return map;
  }, [slots]);

  // Start on the day of the chosen (or current) slot, else the first day with a free seat.
  // After that, keep whatever day the admin opened.
  useEffect(() => {
    if (!slots) return;
    const selected = slots.find((s) => s.id === value) || (!value && slots.find((s) => s.id === currentSlotId));
    const firstFree = [...byDay.entries()].find(([, list]) => list.some((s) => s.bookable))?.[0];
    setDay((d) => (byDay.has(d) ? d : selected ? istDayOf(selected.startsAt) : firstFree || [...byDay.keys()][0] || ''));
  }, [slots, byDay, value, currentSlotId]);

  if (!templeName) return <p className="muted small">Choose the temple first.</p>;
  if (error) return <p className="error-note">{error}</p>;
  if (!slots) return <div className="skeleton" style={{ height: 88 }} />;
  if (!slots.length) {
    return (
      <div className="slot-empty">
        No slots at {templeName} in the next {days} days.{' '}
        <Link href={`/slots?temple=${encodeURIComponent(templeName)}&new=1`} className="link-sm">
          Create slots
        </Link>
      </div>
    );
  }

  const usable = (s) => (s.id === currentSlotId ? currentSelectable : s.bookable);
  const times = byDay.get(day) || [];

  return (
    <div className="slot-picker">
      <div className="day-strip" role="listbox" aria-label="Day">
        {[...byDay.entries()].map(([d, list]) => {
          const free = list.filter((s) => s.bookable).reduce((n, s) => n + s.remaining, 0);
          const holdsCurrent = list.some((s) => s.id === currentSlotId);
          const allClosed = list.every((s) => s.state === 'closed');
          return (
            <button
              key={d}
              type="button"
              role="option"
              aria-selected={d === day}
              className={`day-chip ${d === day ? 'on' : ''} ${free || holdsCurrent ? '' : 'none'}`}
              onClick={() => setDay(d)}
            >
              <b>{dayLabel(d, { weekday: 'short' })}</b>
              <span>{dayLabel(d, { day: 'numeric', month: 'short' })}</span>
              <small>{allClosed ? 'Closed' : free ? `${free} free` : holdsCurrent ? 'Current' : 'Full'}</small>
            </button>
          );
        })}
      </div>
      <div className="time-grid" role="radiogroup" aria-label="Time">
        {times.map((s) => {
          const label = s.state === 'closed' ? 'Closed' : s.id === currentSlotId ? 'Current slot' : s.remaining ? `${s.remaining} of ${s.capacity} pandits free` : 'Full';
          return (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={value === s.id}
              disabled={!usable(s)}
              className={`time-chip ${value === s.id ? 'on' : ''}`}
              onClick={() => onChange(s)}
              title={s.note || undefined}
            >
              <b>
                {timeOf(s.startsAt)} – {timeOf(s.endsAt)}
              </b>
              <small>{label}</small>
            </button>
          );
        })}
      </div>
    </div>
  );
}
