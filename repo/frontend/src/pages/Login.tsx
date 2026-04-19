import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Input } from '../components/Input';

export function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!username) return setError('Username is required');
    if (!password) return setError('Password is required');
    setSubmitting(true);
    try {
      await login(username, password);
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <form onSubmit={onSubmit} aria-label="login">
        <h1>ClinicOps Sign In</h1>
        <Input label="Username" value={username} onChange={setUsername} testId="login-username" required />
        <Input
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          testId="login-password"
          required
        />
        {error ? (
          <div className="error" role="alert" data-testid="login-error">
            {error}
          </div>
        ) : null}
        <button type="submit" data-testid="login-submit" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign In'}
        </button>
        <p className="muted">Offline authentication. Minimum 12-character passwords required.</p>
      </form>
    </div>
  );
}
