import React from 'react';
import { useAuth } from '../hooks/useAuth';
import { validatePasswordPolicy } from '../utils/format';

export function SettingsPage() {
  const { session, api } = useAuth();
  const [error, setError] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState(false);
  const [currentPw, setCurrentPw] = React.useState('');
  const [newPw, setNewPw] = React.useState('');

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(false);
    const errs = validatePasswordPolicy(newPw);
    if (errs.length) { setError(`Password ${errs[0]}`); return; }
    try {
      await api.auth.changePassword(newPw, currentPw);
      setOk(true);
      setCurrentPw('');
      setNewPw('');
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <section aria-labelledby="settings-h">
      <h2 id="settings-h">Settings</h2>
      <p>Logged in as: <strong>{session?.user?.username}</strong> ({session?.user?.role})</p>

      <h3>Change Password</h3>
      <form onSubmit={changePassword}>
        {error && <p role="alert" style={{ color: 'red' }}>{error}</p>}
        {ok && <p style={{ color: 'green' }}>Password changed successfully.</p>}
        <label>
          Current Password
          <input
            type="password"
            value={currentPw}
            onChange={(e) => setCurrentPw(e.target.value)}
            data-testid="settings-currentpw"
            required
          />
        </label>
        <label>
          New Password
          <input
            type="password"
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
            data-testid="settings-newpw"
            required
            minLength={12}
          />
        </label>
        <button type="submit" data-testid="settings-save">Update Password</button>
      </form>
    </section>
  );
}
