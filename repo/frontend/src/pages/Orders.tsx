import React, { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import type { Order, Invoice } from '../types';
import { formatMoney, formatDate } from '../utils/format';

export function OrdersPage() {
  const { api, permit } = useAuth();
  const [items, setItems] = useState<Order[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<(Order & { invoice: Invoice | null }) | null>(null);
  const [discount, setDiscount] = useState('');
  const [taxRate, setTaxRate] = useState('');
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [bulkOps, setBulkOps] = useState<any[]>([]);
  const [showBulk, setShowBulk] = useState(false);

  async function load() {
    try {
      const r = await api.orders.list();
      setItems(r.items);
    } catch (err: any) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function confirm(id: string) {
    try {
      await api.orders.confirm(id, {
        discount: discount ? Number(discount) : 0,
        taxRate: taxRate ? Number(taxRate) : null,
      });
      await load();
      await open(id);
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function open(id: string) {
    const o = await api.orders.get(id);
    setSelected(o);
  }

  async function pay(id: string) {
    await api.orders.pay(id);
    await load();
    await open(id);
  }

  async function fulfill(id: string) {
    await api.orders.fulfill(id);
    await load();
    await open(id);
  }

  async function cancel(id: string, reason: string) {
    if (!reason) return;
    await api.orders.cancel(id, reason);
    await load();
  }

  async function refund(id: string) {
    const reason = prompt('Refund reason?') || '';
    if (reason.length < 3) return;
    await api.orders.refundInvoice(id, reason);
    await load();
  }

  function toggleBulkSelect(id: string) {
    setBulkSelected((s) => {
      const copy = new Set(s);
      if (copy.has(id)) copy.delete(id);
      else copy.add(id);
      return copy;
    });
  }

  async function runBulkTag() {
    const tag = prompt('Tag to add to selected orders?');
    if (!tag) return;
    try {
      await api.orders.bulk({ orderIds: [...bulkSelected], updates: { tags: [tag] } });
      setBulkSelected(new Set());
      await loadBulkOps();
      await load();
    } catch (err: any) { setError(err.message); }
  }

  async function loadBulkOps() {
    try {
      const r = await api.orders.bulkList();
      setBulkOps(r.items || []);
    } catch { /* ignore */ }
  }

  async function undoBulk(id: string) {
    try {
      await api.orders.undoBulk(id);
      await loadBulkOps();
      await load();
    } catch (err: any) { setError(err.message); }
  }

  return (
    <section aria-labelledby="orders-h">
      <h2 id="orders-h">Orders & Billing</h2>
      {error ? <p className="error" data-testid="orders-error">{error}</p> : null}

      <div style={{ marginBottom: '0.5rem', display: 'flex', gap: '0.5rem' }}>
        {bulkSelected.size > 0 && (
          <button data-testid="bulk-tag-btn" onClick={runBulkTag}>
            Tag {bulkSelected.size} selected
          </button>
        )}
        <button data-testid="bulk-ops-toggle" onClick={() => { setShowBulk((v) => !v); loadBulkOps(); }}>
          {showBulk ? 'Hide' : 'Show'} Bulk Operations
        </button>
      </div>

      {showBulk && (
        <div data-testid="bulk-ops-panel" style={{ marginBottom: '1rem', border: '1px solid #ccc', padding: '0.5rem' }}>
          <h4>Recent Bulk Operations (10-min undo window)</h4>
          {bulkOps.length === 0 ? <p>No bulk operations.</p> : (
            <table>
              <thead><tr><th>ID</th><th>Count</th><th>Deadline</th><th>Actions</th></tr></thead>
              <tbody>
                {bulkOps.map((op) => {
                  const canUndo = op.undoDeadline && new Date(op.undoDeadline) > new Date();
                  return (
                    <tr key={op.id}>
                      <td>{op.id.slice(0, 8)}</td>
                      <td>{op.orderIds?.length ?? '—'}</td>
                      <td>{op.undoDeadline ? new Date(op.undoDeadline).toLocaleTimeString() : '—'}</td>
                      <td>
                        {canUndo && (
                          <button data-testid={`undo-bulk-${op.id}`} onClick={() => undoBulk(op.id)}>Undo</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      <table data-testid="orders-table">
        <thead>
          <tr>
            <th><input type="checkbox" onChange={() => {}} /></th>
            <th>Order</th>
            <th>Patient</th>
            <th>Package</th>
            <th>Status</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((o) => (
            <tr key={o.id} data-testid={`order-${o.id}`}>
              <td>
                <input
                  type="checkbox"
                  checked={bulkSelected.has(o.id)}
                  onChange={() => toggleBulkSelect(o.id)}
                  data-testid={`bulk-check-${o.id}`}
                />
              </td>
              <td>{o.id.slice(0, 8)}</td>
              <td>{o.patient.name}</td>
              <td>{o.snapshot.name} v{o.packageVersion}</td>
              <td>{o.status}</td>
              <td>{formatDate(o.createdAt)}</td>
              <td>
                <button onClick={() => open(o.id)}>View</button>
                {permit('invoice:create') && o.status === 'PENDING' ? (
                  <button data-testid={`confirm-${o.id}`} onClick={() => confirm(o.id)}>Confirm</button>
                ) : null}
                {permit('invoice:create') && o.status === 'CONFIRMED' ? (
                  <button data-testid={`pay-${o.id}`} onClick={() => pay(o.id)}>Mark Paid</button>
                ) : null}
                {permit('order:update') && o.status === 'PAID' ? (
                  <button onClick={() => fulfill(o.id)}>Fulfill</button>
                ) : null}
                {permit('order:update') && !['FULFILLED', 'REFUNDED'].includes(o.status) ? (
                  <button onClick={() => cancel(o.id, prompt('Cancel reason?') || '')}>Cancel</button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {selected ? (
        <aside className="order-detail" data-testid="order-detail">
          <h3>Order {selected.id.slice(0, 8)}</h3>
          <p>Patient: {selected.patient.name}</p>
          <p>Status: {selected.status}</p>
          <p>Package: {selected.snapshot.name} v{selected.packageVersion}</p>
          <p>Composition (at time of sale):</p>
          <ul>
            {selected.snapshot.composition.map((c) => (
              <li key={c.examItemId}>
                {c.examItemId} {c.required ? '(required)' : '(optional)'}
              </li>
            ))}
          </ul>
          {selected.invoice ? (
            <div>
              <h4>Invoice</h4>
              <p>Subtotal: {formatMoney(selected.invoice.subtotal)}</p>
              <p>Discount: {formatMoney(selected.invoice.discount)}</p>
              <p>Tax @ {(selected.invoice.taxRate * 100).toFixed(2)}%: {formatMoney(selected.invoice.tax)}</p>
              <p data-testid="invoice-total">Total: {formatMoney(selected.invoice.total)}</p>
              {permit('invoice:refund') && selected.invoice.status === 'PAID' ? (
                <button data-testid="refund-btn" onClick={() => refund(selected.invoice!.id)}>Refund</button>
              ) : null}
            </div>
          ) : (
            <div>
              <label>
                Discount
                <input
                  data-testid="order-discount"
                  type="number"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                />
              </label>
              <label>
                Tax Rate override
                <input
                  data-testid="order-tax"
                  type="number"
                  step="0.0001"
                  value={taxRate}
                  onChange={(e) => setTaxRate(e.target.value)}
                />
              </label>
            </div>
          )}
        </aside>
      ) : null}
    </section>
  );
}
