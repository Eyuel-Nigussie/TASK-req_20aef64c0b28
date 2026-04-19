import React, { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Input } from '../components/Input';
import { validatePasswordPolicy } from '../utils/format';

export function UsersPage() {
  const { api, permit } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('FRONT_DESK');
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const r = await api.users.list();
    setItems(r.items);
  }
  useEffect(() => { load(); }, []); // eslint-disable-line

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const pw = validatePasswordPolicy(password);
    if (pw.length) { setError(`Password ${pw[0]}`); return; }
    try {
      await api.users.create({ username, password, role, displayName: username });
      setUsername(''); setPassword('');
      await load();
    } catch (err: any) { setError(err.message); }
  }

  async function blacklist(id: string) {
    const reason = prompt('Reason?') || '';
    await api.users.blacklist(id, reason);
    await load();
  }

  async function flag(id: string) {
    const reason = prompt('Why flag?') || '';
    await api.users.flagRisky(id, reason);
    await load();
  }

  async function deactivate(id: string) {
    if (!confirm('Deactivate this user?')) return;
    await api.users.deactivate(id);
    await load();
  }

  async function reactivate(id: string) {
    await api.users.reactivate(id);
    await load();
  }

  return (
    <section aria-labelledby="users-h">
      <h2 id="users-h">User Management</h2>
      {permit('user:create') ? (
        <form onSubmit={submit}>
          <Input label="Username" value={username} onChange={setUsername} testId="u-username" required />
          <Input label="Password" value={password} onChange={setPassword} testId="u-password" type="password" required />
          <label>
            Role
            <select data-testid="u-role" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="FRONT_DESK">Front Desk</option>
              <option value="FINANCE_SPECIALIST">Finance Specialist</option>
              <option value="CLINIC_MANAGER">Clinic Manager</option>
              <option value="READ_ONLY_AUDITOR">Auditor</option>
            </select>
          </label>
          <button type="submit" data-testid="u-save">Create User</button>
          {error ? <p className="error" data-testid="u-error">{error}</p> : null}
        </form>
      ) : null}
      <table data-testid="u-table">
        <thead>
          <tr>
            <th>Username</th>
            <th>Role</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((u) => (
            <tr key={u.id}>
              <td>{u.username}</td>
              <td>{u.role}</td>
              <td>
                {u.blacklisted ? 'Blacklisted' : u.active ? 'Active' : 'Deactivated'}
                {u.risky ? ' · Risky' : ''}
                {u.realNameVerified ? ' · Verified' : ''}
              </td>
              <td>
                {permit('user:blacklist') ? (
                  <button onClick={() => blacklist(u.id)}>Blacklist</button>
                ) : null}
                {permit('user:flag_risky') ? (
                  <button onClick={() => flag(u.id)}>Flag Risky</button>
                ) : null}
                {permit('user:deactivate') && u.active && !u.blacklisted ? (
                  <button onClick={() => deactivate(u.id)}>Deactivate</button>
                ) : null}
                {permit('user:update') && !u.active && !u.blacklisted ? (
                  <button onClick={() => reactivate(u.id)}>Reactivate</button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
