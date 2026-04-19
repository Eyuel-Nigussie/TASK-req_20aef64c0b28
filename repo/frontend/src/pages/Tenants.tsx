import React, { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Input } from '../components/Input';

export function TenantsPage() {
  const { api } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState('America/Chicago');
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  async function load() {
    try {
      const r = await (api as any).tenants.list();
      setItems(r.items || []);
    } catch (err: any) {
      setError(err.message);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name) { setError('Name is required'); return; }
    try {
      await (api as any).tenants.create({ name, timezone });
      setName(''); setTimezone('America/Chicago');
      await load();
    } catch (err: any) { setError(err.message); }
  }

  async function saveEdit(id: string) {
    try {
      await (api as any).tenants.update(id, { name: editName });
      setEditing(null);
      await load();
    } catch (err: any) { setError(err.message); }
  }

  return (
    <section aria-labelledby="tenants-h">
      <h2 id="tenants-h">Tenant Management</h2>
      {error && <p role="alert" style={{ color: 'red' }}>{error}</p>}

      <form onSubmit={create} data-testid="tenant-form">
        <h3>Create Tenant</h3>
        <Input label="Name" value={name} onChange={setName} testId="tenant-name" required />
        <label>
          Timezone
          <input
            type="text"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            data-testid="tenant-tz"
          />
        </label>
        <button type="submit" data-testid="tenant-submit">Create Tenant</button>
      </form>

      <table data-testid="tenants-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Timezone</th>
            <th>Active</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((t) => (
            <tr key={t.id} data-testid={`tenant-${t.id}`}>
              <td>
                {editing === t.id ? (
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    data-testid="tenant-edit-name"
                  />
                ) : t.name}
              </td>
              <td>{t.timezone || '—'}</td>
              <td>{t.active ? 'Yes' : 'No'}</td>
              <td>
                {editing === t.id ? (
                  <>
                    <button onClick={() => saveEdit(t.id)}>Save</button>
                    <button onClick={() => setEditing(null)}>Cancel</button>
                  </>
                ) : (
                  <button onClick={() => { setEditing(t.id); setEditName(t.name); }}>Edit</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
