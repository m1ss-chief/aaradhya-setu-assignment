'use client';

import { useRef, useState } from 'react';
import { Icon } from '@/components/icons.js';

const HIGHLIGHTS = ['Every puja booking in one place', 'One-click workflow with WhatsApp updates', 'Full booking history & audit trail'];

export default function LoginForm({ next, demoHint }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const userRef = useRef(null);
  const passRef = useRef(null);

  const ready = username.trim() && password;
  const step = username.trim() ? 2 : 1;

  async function submit(e) {
    e.preventDefault();
    if (!username.trim()) return userRef.current?.focus();
    if (!password) return passRef.current?.focus();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Sign in failed');
      window.location.assign(next || '/'); // full load so the server sees the new session cookie
    } catch (err) {
      setError(err.message);
      setPassword('');
      setLoading(false);
      passRef.current?.focus();
    }
  }

  return (
    <div className="login-page">
      <header className="login-header">
        <span className="login-logo">
          <span className="lotus" aria-hidden>
            🪷
          </span>
          <span>
            Aaradhya Setu
            <small>आराध्य सेतु</small>
          </span>
        </span>
        <span className="login-header-tag">Admin console</span>
      </header>

      <main className="login-wrap">
        <div className="login-card">
          <section className="login-brand" aria-hidden="true">
            <div className="login-brand-top">
              <span className="om-tile lg">ॐ</span>
              <span className="login-brand-name">
                Aaradhya Setu
                <small>आराध्य सेतु</small>
              </span>
            </div>
            <h1>Sign In</h1>
            <p>
              Admin access to Aaradhya Setu operations — puja bookings, the booking workflow and devotee WhatsApp
              updates.
            </p>
            <ul>
              {HIGHLIGHTS.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
            <span className="login-om-watermark">ॐ</span>
          </section>

          <section className="login-form-side">
            <span className="login-mini-logo" aria-hidden>
              🪷
              <small>AARADHYA SETU</small>
            </span>
            <h2>Sign in to Aaradhya Setu</h2>
            <p className="login-sub">Enter your admin ID and password to manage puja bookings.</p>

            <ol className="login-steps" aria-hidden="true">
              <li className={step >= 1 ? 'on' : ''}>
                <span>1</span> Admin ID
              </li>
              <li className="line" />
              <li className={step >= 2 ? 'on' : ''}>
                <span>2</span> Password
              </li>
            </ol>

            <form onSubmit={submit} noValidate>
              <label className="login-label" htmlFor="username">
                Admin ID
              </label>
              <div className={`login-input ${error ? 'invalid' : ''}`}>
                <span className="addon">
                  <Icon name="user" />
                </span>
                <input
                  id="username"
                  ref={userRef}
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="e.g. admin"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoFocus
                />
              </div>

              <label className="login-label" htmlFor="password">
                Password
              </label>
              <div className={`login-input ${error ? 'invalid' : ''}`}>
                <span className="addon">
                  <Icon name="lock" />
                </span>
                <input
                  id="password"
                  ref={passRef}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="reveal"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  <Icon name={showPassword ? 'eyeOff' : 'eye'} />
                </button>
              </div>

              <p className="login-help" role={error ? 'alert' : undefined}>
                {error ? <span className="login-error">{error}</span> : 'Admin accounts are created by the operations team.'}
              </p>

              <button className={`login-btn ${ready ? 'ready' : ''}`} disabled={loading}>
                {loading ? 'Signing in…' : 'Sign in'} <Icon name="arrowRight" />
              </button>
            </form>

            {demoHint && (
              <p className="login-demo">
                Demo credentials: <code>{demoHint}</code>
              </p>
            )}
            <p className="login-legal">Authorised Aaradhya Setu admins only. Sign-ins and booking changes are logged.</p>
          </section>
        </div>
      </main>
    </div>
  );
}
