'use client';

import { useState } from 'react';
import { MESSAGE_META } from '@/lib/workflow.js';
import { formatDate, api } from './ui.js';
import { Icon } from './icons.js';

// One WhatsApp message with its delivery state. Failed messages get a Resend button;
// the message goes to the booking's current number.
export default function MessageBubble({ message: n, onResent }) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const failed = n.delivery?.status === 'failed';

  async function resend() {
    setSending(true);
    setError('');
    try {
      const { notification } = await api(`/api/notifications/${n.id}/resend`, { method: 'POST' });
      onResent?.(notification);
    } catch (e) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={`bubble ${failed ? 'bubble-failed' : ''}`}>
      {n.message}
      <div className="bubble-meta">
        <span>{MESSAGE_META[n.status]?.stage || n.status}</span>
        <span>
          {formatDate(n.lastAttemptAt || n.createdAt, true)}{' '}
          {failed ? (
            <span className="delivery-failed">
              <Icon name="alert" size={12} /> Not delivered
            </span>
          ) : (
            <span className="ticks" title="Delivered (mock)">
              ✓✓
            </span>
          )}
          {n.attempts > 1 && <span> · {n.attempts} attempts</span>}
        </span>
      </div>
      {failed && (
        <div className="bubble-fail">
          <span>
            {n.delivery.error} <span className="muted">· to {n.to}</span>
          </span>
          {onResent && (
            <button className="btn btn-sm" onClick={resend} disabled={sending}>
              <Icon name="refresh" size={14} /> {sending ? 'Sending…' : 'Resend'}
            </button>
          )}
        </div>
      )}
      {error && <div className="bubble-error">{error}</div>}
    </div>
  );
}
