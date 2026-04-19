import React, { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';

export function IdentityPage() {
  const { api, permit } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const r = await api.users.listIdentity();
      setItems(r.items || []);
    } catch (err: any) {
      setError(err.message);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line

  async function review(id: string, decision: 'APPROVED' | 'REJECTED') {
    const note = decision === 'REJECTED' ? (prompt('Rejection note (optional):') ?? '') : undefined;
    try {
      await api.users.reviewIdentity(id, decision, note);
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <section aria-labelledby="identity-h">
      <h2 id="identity-h">Identity Verification</h2>
      {error && <p role="alert" style={{ color: 'red' }}>{error}</p>}
      {items.length === 0 ? (
        <p>No identity records found.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>User</th>
              <th>Legal Name</th>
              <th>ID Number</th>
              <th>Status</th>
              {permit('identity:review') && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {items.map((rec) => (
              <tr key={rec.id}>
                <td>{rec.userId}</td>
                <td>{rec.legalName}</td>
                <td>{rec.maskedIdNumber}</td>
                <td>{rec.status}</td>
                {permit('identity:review') && rec.status === 'PENDING' && (
                  <td>
                    <button onClick={() => review(rec.id, 'APPROVED')}>Approve</button>
                    <button onClick={() => review(rec.id, 'REJECTED')}>Reject</button>
                  </td>
                )}
                {permit('identity:review') && rec.status !== 'PENDING' && <td>—</td>}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
