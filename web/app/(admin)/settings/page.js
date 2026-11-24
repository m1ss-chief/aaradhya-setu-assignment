'use client';

import { useEffect, useMemo, useState } from 'react';
import { MESSAGE_META, messageForStatus } from '@/lib/workflow.js';
import { ErrorNote, formatDate, api } from '@/components/ui.js';
import { Icon } from '@/components/icons.js';
import { useAdmin } from '@/components/admin-context.js';

// Sample booking used for the live template preview.
const SAMPLE = {
  devoteeName: 'Ananya Sharma',
  pujaName: 'Rudrabhishek',
  templeName: 'Kashi Vishwanath, Varanasi',
  bookingId: 'AS-2026-0001',
  pujaDate: '2026-12-05T04:30:00.000Z',
  videoUrl: 'https://example.com/puja-videos/AS-2026-0001',
  cancelReason: 'Devotee asked to reschedule',
};

function PasswordCard() {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setDone(false);
    if (form.newPassword !== form.confirm) return setError("The new passwords don't match");
    setSaving(true);
    try {
      await api('/api/auth/password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: form.currentPassword, newPassword: form.newPassword }),
      });
      setForm({ currentPassword: '', newPassword: '', confirm: '' });
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card stack" onSubmit={submit}>
      <h2 className="section-title">Change password</h2>
      <label className="field">
        Current password
        <input type="password" autoComplete="current-password" required value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} />
      </label>
      <label className="field">
        New password
        <input type="password" autoComplete="new-password" required minLength={8} value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} />
      </label>
      <label className="field">
        Confirm new password
        <input type="password" autoComplete="new-password" required value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
      </label>
      <p className="muted small" style={{ margin: 0 }}>
        At least 8 characters, with letters and numbers.
      </p>
      <ErrorNote error={error} />
      {done && (
        <p className="ok-note" role="status">
          <Icon name="check" size={16} /> Password changed. Use it next time you sign in.
        </p>
      )}
      <button className="btn btn-primary" disabled={saving}>
        {saving ? 'Saving…' : 'Change password'}
      </button>
    </form>
  );
}

function TemplateEditor({ status, value, defaultValue, rules, meta, onSaved }) {
  const [text, setText] = useState(value);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => setText(value), [value]);

  const changed = text !== value;
  const customised = value !== defaultValue;
  const preview = useMemo(() => {
    try {
      return messageForStatus(status, SAMPLE, { [status]: text });
    } catch (e) {
      return null;
    }
  }, [status, text]);

  async function save() {
    setBusy(true);
    setError('');
    try {
      onSaved(await api(`/api/templates/${encodeURIComponent(status)}`, { method: 'PUT', body: JSON.stringify({ body: text }) }), 'saved');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    setBusy(true);
    setError('');
    try {
      onSaved(await api(`/api/templates/${encodeURIComponent(status)}`, { method: 'DELETE' }), 'reset');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const insert = (p) => setText((t) => `${t}${t.endsWith(' ') || !t ? '' : ' '}{{${p}}}`);

  return (
    <article className="template">
      <div className="template-head">
        <h3>
          {MESSAGE_META[status].stage} <span className="muted small">({status})</span>
        </h3>
        {customised ? (
          <span className="badge badge-info" title={meta ? `Edited by ${meta.updatedBy} on ${formatDate(meta.updatedAt, true)}` : ''}>
            Customised
          </span>
        ) : (
          <span className="badge badge-neutral">Default</span>
        )}
      </div>
      <div className="template-grid">
        <div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            aria-label={`Message for ${status}`}
          />
          <div className="chips" aria-label="Insert a placeholder">
            {rules.allowed.map((p) => (
              <button key={p} type="button" className={`chip ${rules.required.includes(p) ? 'req' : ''}`} onClick={() => insert(p)}>
                {`{{${p}}}`}
              </button>
            ))}
          </div>
        </div>
        <div className="chat">
          {preview ? <div className="bubble preview">{preview}</div> : <p className="muted small">Fix the placeholders to see a preview.</p>}
        </div>
      </div>
      {error && <p className="error-note">{error}</p>}
      <div className="form-actions">
        <button className="btn btn-primary btn-sm" onClick={save} disabled={busy || !changed}>
          Save
        </button>
        {changed && (
          <button className="btn btn-sm" onClick={() => setText(value)} disabled={busy}>
            Discard changes
          </button>
        )}
        {customised && (
          <button className="btn btn-ghost btn-sm" onClick={reset} disabled={busy}>
            Reset to default
          </button>
        )}
        {meta && customised && (
          <span className="muted small">
            Last edited by {meta.updatedBy} · {formatDate(meta.updatedAt, true)}
          </span>
        )}
      </div>
    </article>
  );
}

export default function SettingsPage() {
  const { admin } = useAdmin();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  useEffect(() => {
    api('/api/templates')
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p className="muted">Your account, and the WhatsApp messages devotees receive.</p>
        </div>
      </div>
      <ErrorNote error={error} />

      <div className="grid-2">
        <section className="card">
          <h2 className="section-title">Your account</h2>
          <dl className="kv">
            <dt>Name</dt>
            <dd>{admin.name}</dd>
            <dt>Admin ID</dt>
            <dd className="mono">{admin.username}</dd>
          </dl>
        </section>
        <PasswordCard />
      </div>

      <section className="card" style={{ marginTop: 16 }}>
        <h2 className="section-title">WhatsApp message templates</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Change the wording without a code change. Placeholders like {'{{devoteeName}}'} are filled in for each booking;
          required ones are highlighted. New wording applies to the next message sent.
        </p>
        {!data && <div className="skeleton" />}
        <div className="stack">
          {data &&
            Object.keys(data.defaults).map((status) => (
              <TemplateEditor
                key={status}
                status={status}
                value={data.templates[status]}
                defaultValue={data.defaults[status]}
                rules={data.rules[status]}
                meta={data.meta[status]}
                onSaved={(next, how) => {
                  setData((d) => ({ ...d, templates: next.templates, meta: next.meta }));
                  setToast(how === 'reset' ? `"${status}" message reset to default` : `"${status}" message saved`);
                  setTimeout(() => setToast(''), 3000);
                }}
              />
            ))}
        </div>
      </section>
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
