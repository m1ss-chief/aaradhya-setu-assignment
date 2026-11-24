'use client';

import { useEffect, useRef } from 'react';
import { STATUSES, STATUS_META } from '../lib/workflow.js';

export function formatINR(amount) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(
    Number(amount) || 0,
  );
}

export function formatDate(date, withTime = false) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
    timeZone: 'Asia/Kolkata',
  });
}

export function StatusBadge({ status }) {
  const tone = STATUS_META[status]?.tone || 'neutral';
  return <span className={`badge badge-${tone}`}>{status}</span>;
}

// Horizontal workflow: Booking Received -> Confirmed -> Puja Started -> Puja Completed -> Video Available
// For a cancelled booking, the steps it reached are shown as done and the rest as skipped.
export function WorkflowStepper({ status, history = [] }) {
  const cancelled = status === 'Cancelled';
  const reachedIndex = Math.max(0, ...history.map((h) => STATUSES.indexOf(h.status)));
  const currentIndex = cancelled ? reachedIndex : STATUSES.indexOf(status);
  const finished = currentIndex === STATUSES.length - 1;
  const reachedAt = Object.fromEntries(history.map((h) => [h.status, h.at]));
  return (
    <ol className={`stepper ${cancelled ? 'stepper-cancelled' : ''}`} aria-label="Booking workflow">
      {STATUSES.map((s, i) => {
        const state = cancelled
          ? i <= reachedIndex
            ? 'done'
            : 'skipped'
          : i < currentIndex || finished
            ? 'done'
            : i === currentIndex
              ? 'current'
              : 'todo';
        return (
          <li key={s} className={`step step-${state}`} aria-current={state === 'current' ? 'step' : undefined}>
            <span className="step-dot">{state === 'done' ? '✓' : i + 1}</span>
            <span className="step-label">{STATUS_META[s].stage}</span>
            <span className="step-time">{reachedAt[s] ? formatDate(reachedAt[s], true) : ''}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function ErrorNote({ error }) {
  if (!error) return null;
  return (
    <p className="error-note" role="alert">
      {error}
    </p>
  );
}

export async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && typeof window !== 'undefined') {
    // Session expired: back to the sign-in page, then return here.
    window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
  }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// "YYYY-MM-DD" in India time, for <input type="date">.
export function toDateInput(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

// Modal confirmation for destructive actions. Esc or the backdrop cancels.
// tone: 'danger' (red, for deletes) or 'primary' (for other irreversible actions).
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = 'Delete',
  busyLabel = 'Deleting…',
  tone = 'danger',
  busy = false,
  confirmDisabled = false,
  cancelLabel = 'Cancel',
  wide = false,
  onConfirm,
  onCancel,
}) {
  const cancelRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    cancelRef.current?.focus();
    const onKey = (e) => e.key === 'Escape' && !busy && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !busy && onCancel()}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="alertdialog" aria-modal="true" aria-labelledby="modal-title">
        <h2 id="modal-title">{title}</h2>
        <div className="modal-body">{children}</div>
        <div className="modal-actions">
          <button ref={cancelRef} className="btn" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            className={`btn ${tone === 'danger' ? 'btn-danger' : 'btn-primary'}`}
            onClick={onConfirm}
            disabled={busy || confirmDisabled}
          >
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// Single-series horizontal bar chart: label, bar, value. One hue (magnitude only),
// rounded data-end, value printed in text ink, full row is the hover/click target.
export function BarList({ rows, format = (v) => v, onSelect, label }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="barlist" aria-label={label}>
      {rows.map((r) => {
        const content = (
          <>
            <span className="bl-label">{r.label}</span>
            <span className="bl-track">
              <span className="bl-bar" style={{ width: `${Math.max(r.value ? 2 : 0, (r.value / max) * 100)}%` }} />
            </span>
            <span className="bl-value">{format(r.value)}</span>
          </>
        );
        return (
          <li key={r.label} title={r.title || `${r.label}: ${format(r.value)}`}>
            {onSelect ? (
              <button type="button" className="bl-row" onClick={() => onSelect(r)}>
                {content}
              </button>
            ) : (
              <div className="bl-row">{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
