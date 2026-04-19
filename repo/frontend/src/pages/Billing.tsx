import React, { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { formatMoney, formatDate } from '../utils/format';

export function BillingPage() {
  const { api, permit } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Create form state
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [billingType, setBillingType] = useState('AMOUNT');
  const [unitPrice, setUnitPrice] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [effectiveTo, setEffectiveTo] = useState('');

  async function load() {
    try {
      const r = await api.packages.listPricing();
      setItems(r.items || []);
    } catch (err: any) {
      setError(err.message);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.packages.createPricing({
        name,
        code,
        billingType,
        unitPrice: Number(unitPrice),
        effectiveFrom,
        effectiveTo: effectiveTo || undefined,
      });
      setName(''); setCode(''); setUnitPrice(''); setEffectiveFrom(''); setEffectiveTo('');
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  const byType: Record<string, any[]> = {};
  for (const s of items) {
    const t = s.billingType || 'AMOUNT';
    if (!byType[t]) byType[t] = [];
    byType[t].push(s);
  }

  return (
    <section aria-labelledby="billing-h">
      <h2 id="billing-h">Billing &amp; Pricing Strategies</h2>

      {permit('package:manage') && (
        <details>
          <summary>Add Pricing Strategy</summary>
          <form onSubmit={create}>
            {error && <p role="alert" style={{ color: 'red' }}>{error}</p>}
            <label>Name <input value={name} onChange={(e) => setName(e.target.value)} required /></label>
            <label>Code <input value={code} onChange={(e) => setCode(e.target.value)} required /></label>
            <label>
              Billing Type
              <select value={billingType} onChange={(e) => setBillingType(e.target.value)}>
                <option value="AMOUNT">Amount (flat fee)</option>
                <option value="USAGE">Usage (per unit)</option>
                <option value="TIME">Time (per hour)</option>
              </select>
            </label>
            <label>Unit Price <input type="number" min="0" step="0.01" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} required /></label>
            <label>Effective From <input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} required /></label>
            <label>Effective To <input type="date" value={effectiveTo} onChange={(e) => setEffectiveTo(e.target.value)} /></label>
            <button type="submit" data-testid="billing-save">Save Strategy</button>
          </form>
        </details>
      )}

      {Object.entries(byType).map(([type, strategies]) => (
        <div key={type} style={{ marginTop: '1rem' }}>
          <h3>{type === 'AMOUNT' ? 'Flat Fee (Amount)' : type === 'USAGE' ? 'Usage-Based' : 'Time-Based'}</h3>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Code</th>
                <th>Unit Price</th>
                <th>Effective From</th>
                <th>Effective To</th>
                <th>Ver</th>
              </tr>
            </thead>
            <tbody>
              {strategies.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{s.code}</td>
                  <td>{formatMoney(s.unitPrice)}</td>
                  <td>{formatDate(s.effectiveFrom)}</td>
                  <td>{s.effectiveTo ? formatDate(s.effectiveTo) : '—'}</td>
                  <td>v{s.version}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {items.length === 0 && <p>No pricing strategies configured.</p>}
    </section>
  );
}
