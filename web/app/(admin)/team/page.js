'use client';

import { useCallback, useEffect, useState } from 'react';
import { ROLES, ROLE_LABELS } from '@/lib/permissions.js';
import { ConfirmDialog, ErrorNote, formatDate, api } from '@/components/ui.js';
import { Icon } from '@/components/icons.js';
import { useAdmin, NoAccess } from '@/components/admin-context.js';

const ROLE_HELP = {
  owner: 'Everything: bookings, cancel & delete, team, message wording.',
  staff: 'View bookings, move them through the workflow, resend failed messages.',
};

const EMPTY = { username: '', name: '', role: 'staff', password: '' };

export default function TeamPage() {
  const { admin: me, can } = useAdmin();
  const [admins, setAdmins] = useState(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [form, setForm] = useState(EMPTY);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [toRemove, setToRemove] = useState(null);
  const [removing, setRemoving] = useState(false);
  const [resetFor, setResetFor] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetError, setResetError] = useState('');

  const flash = (t) => {
    setToast(t);
    setTimeout(() => setToast(''), 3500);
  };

  const load = useCallback(
    () =>
      api('/api/admins')
        .then((d) => setAdmins(d.admins))
        .catch((e) => setError(e.message)),
    [],
  );
  useEffect(() => {
    if (can('admins:manage')) load();
  }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!can('admins:manage')) return <NoAccess what="manage the team" />;

  async function add(e) {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      const { admin } = await api('/api/admins', { method: 'POST', body: JSON.stringify(form) });
      setForm(EMPTY);
      await load();
      flash(`Added ${admin.name} (${ROLE_LABELS[admin.role]}). Share the password with them privately.`);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function changeRole(a, role) {
    setError('');
    try {
      await api(`/api/admins/${a.username}`, { method: 'PATCH', body: JSON.stringify({ role }) });
      await load();
      flash(`${a.name} is now ${ROLE_LABELS[role]}`);
    } catch (err) {
      setError(err.message);
      await load();
    }
  }

  async function resetPassword() {
    setResetError('');
    try {
      await api(`/api/admins/${resetFor.username}`, { method: 'PATCH', body: JSON.stringify({ password: newPassword }) });
      flash(`New password set for ${resetFor.name}`);
      setResetFor(null);
      setNewPassword('');
    } catch (err) {
      setResetError(err.message);
    }
  }

  async function remove() {
    setRemoving(true);
    try {
      await api(`/api/admins/${toRemove.username}`, { method: 'DELETE' });
      flash(`Removed ${toRemove.name}`);
      setToRemove(null);
      await load();
    } catch (err) {
      setError(err.message);
      setToRemove(null);
    } finally {
      setRemoving(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Team</h1>
          <p className="muted">Who can sign in to the admin console, and what they can do.</p>
        </div>
      </div>
      <ErrorNote error={error} />

      <div className="grid-2">
        <section className="card">
          <h2 className="section-title">People ({admins?.length ?? '–'})</h2>
          {!admins && <div className="skeleton" />}
          <ul className="team-list">
            {admins?.map((a) => {
              const self = a.username === me.username;
              return (
                <li key={a.username}>
                  <span className="avatar sm" aria-hidden>
                    {a.name
                      .split(/\s+/)
                      .slice(0, 2)
                      .map((w) => w[0]?.toUpperCase())
                      .join('')}
                  </span>
                  <span className="grow">
                    <b>{a.name}</b> {self && <span className="badge badge-neutral">You</span>}
                    <span className="sub">
                      @{a.username} · {a.lastLoginAt ? `last sign-in ${formatDate(a.lastLoginAt, true)}` : 'never signed in'}
                    </span>
                  </span>
                  <select
                    value={a.role}
                    disabled={self}
                    title={self ? "You can't change your own role" : 'Change role'}
                    onChange={(e) => changeRole(a, e.target.value)}
                    aria-label={`Role for ${a.name}`}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                  <button className="icon-btn" title="Set a new password" aria-label={`Set a new password for ${a.name}`} onClick={() => setResetFor(a)}>
                    <Icon name="lock" />
                  </button>
                  <button
                    className="icon-btn danger"
                    title={self ? "You can't remove yourself" : 'Remove'}
                    aria-label={`Remove ${a.name}`}
                    disabled={self}
                    onClick={() => setToRemove(a)}
                  >
                    <Icon name="trash" />
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="role-help">
            {ROLES.map((r) => (
              <p key={r}>
                <b>{ROLE_LABELS[r]}:</b> {ROLE_HELP[r]}
              </p>
            ))}
          </div>
        </section>

        <form className="card stack" onSubmit={add}>
          <h2 className="section-title">Add a person</h2>
          <label className="field">
            Full name
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Priya Iyer" />
          </label>
          <label className="field">
            Admin ID (used to sign in)
            <input
              required
              value={form.username}
              autoCapitalize="none"
              onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })}
              placeholder="e.g. priya"
            />
          </label>
          <label className="field">
            Role
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]} — {ROLE_HELP[r]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Temporary password
            <input
              required
              type="text"
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="At least 8 characters, letters and numbers"
            />
          </label>
          <p className="muted small" style={{ margin: 0 }}>
            They can change it from Settings after signing in.
          </p>
          <ErrorNote error={formError} />
          <button className="btn btn-primary" disabled={saving}>
            <Icon name="plus" /> {saving ? 'Adding…' : 'Add to team'}
          </button>
        </form>
      </div>

      <ConfirmDialog
        open={!!resetFor}
        title={`Set a new password for ${resetFor?.name}?`}
        tone="primary"
        confirmLabel="Set password"
        confirmDisabled={newPassword.length < 8}
        onCancel={() => {
          setResetFor(null);
          setNewPassword('');
          setResetError('');
        }}
        onConfirm={resetPassword}
      >
        <p>Their current password stops working straight away. Share the new one with them privately.</p>
        <label className="field">
          New password
          <input type="text" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        </label>
        {resetError && <p className="error-note">{resetError}</p>}
      </ConfirmDialog>

      <ConfirmDialog
        open={!!toRemove}
        title={`Remove ${toRemove?.name}?`}
        confirmLabel="Remove"
        busyLabel="Removing…"
        busy={removing}
        onCancel={() => setToRemove(null)}
        onConfirm={remove}
      >
        <p>
          @{toRemove?.username} will be signed out and won't be able to sign in again. Their past actions stay in the booking
          history.
        </p>
      </ConfirmDialog>

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
