import React, { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import type { KpiSummary } from '../types';
import { formatMoney, formatPct } from '../utils/format';

export function ReportsPage() {
  const { api, permit } = useAuth();
  const [kpi, setKpi] = useState<KpiSummary | null>(null);
  const [auditItems, setAuditItems] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [category, setCategory] = useState('');

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [kpiData, auditData] = await Promise.all([
        api.reports.kpi(from || undefined, to || undefined, category || undefined),
        permit('audit:read') ? api.reports.audit(100) : Promise.resolve({ items: [] }),
      ]);
      setKpi(kpiData);
      setAuditItems(auditData.items);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line

  async function exportOrders() {
    const csv = await api.orders.exportOrdersCsv();
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'orders.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  async function exportInvoices() {
    const csv = await api.orders.exportInvoicesCsv();
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'invoices.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section aria-labelledby="reports-h">
      <h2 id="reports-h">Reports</h2>

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <label>
          From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="report-from" />
        </label>
        <label>
          To
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} data-testid="report-to" />
        </label>
        <label>
          Category
          <select value={category} onChange={(e) => setCategory(e.target.value)} data-testid="report-category">
            <option value="">All</option>
            <option value="EXAM">Exam</option>
            <option value="MEMBERSHIP">Membership</option>
            <option value="PERSONAL_TRAINING">Personal Training</option>
            <option value="GROUP_CLASS">Group Class</option>
            <option value="VALUE_ADDED">Value Added</option>
          </select>
        </label>
        <button onClick={load} data-testid="report-run">Run Report</button>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <button onClick={exportOrders} data-testid="report-export-orders">Export Orders CSV</button>
        <button onClick={exportInvoices} data-testid="report-export-invoices">Export Invoices CSV</button>
      </div>

      {loading && <p data-testid="report-loading">Loading…</p>}
      {error && <p role="alert" style={{ color: 'red' }} data-testid="report-error">{error}</p>}

      {kpi && (
        <div className="kpi-grid">
          <div className="kpi-card" data-testid="report-orders"><h3>Orders</h3><p>{kpi.orders}</p></div>
          <div className="kpi-card" data-testid="report-paid"><h3>Paid</h3><p>{kpi.paid}</p></div>
          <div className="kpi-card" data-testid="report-gmv"><h3>GMV</h3><p>{formatMoney(kpi.gmv)}</p></div>
          <div className="kpi-card" data-testid="report-aov"><h3>AOV</h3><p>{formatMoney(kpi.aov)}</p></div>
          <div className="kpi-card" data-testid="report-repeat"><h3>Repeat Rate</h3><p>{formatPct(kpi.repeatPurchaseRate)}</p></div>
          <div className="kpi-card" data-testid="report-fulfillment"><h3>Avg Fulfillment</h3><p>{kpi.avgFulfillmentHours.toFixed(1)} hrs</p></div>
        </div>
      )}

      {auditItems.length > 0 && (
        <div style={{ marginTop: '2rem' }}>
          <h3>Recent Audit Events</h3>
          <table>
            <thead>
              <tr><th>Time</th><th>Action</th><th>Actor</th><th>Resource</th></tr>
            </thead>
            <tbody>
              {auditItems.slice(0, 50).map((e: any) => (
                <tr key={e.id}>
                  <td>{e.ts ? new Date(e.ts).toLocaleString() : '—'}</td>
                  <td>{e.action}</td>
                  <td>{e.actorId || '—'}</td>
                  <td>{e.resource || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
