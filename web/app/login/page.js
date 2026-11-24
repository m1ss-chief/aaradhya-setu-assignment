import LoginForm from './login-form.js';

export const metadata = { title: 'Sign in · Aaradhya Setu Admin' };

// Only allow redirects back into this app (no "//evil.com" open redirects).
function safeNext(next) {
  return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

export default async function LoginPage({ searchParams }) {
  const { next } = await searchParams;
  // For demos: set DEMO_LOGIN_HINT in .env.local to show the demo credentials under the form.
  return <LoginForm next={safeNext(next)} demoHint={process.env.DEMO_LOGIN_HINT || ''} />;
}
