import React, { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import type { KpiSummary } from '../types';
import { formatMoney, formatPct } from '../utils/format';

export function DashboardPage() {
  const { api } = useAuth();
  const [kpi, setKpi] = useState<KpiSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.reports
      .kpi()
      .then(setKpi)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [api]);

  return (
    <section aria-labelledby="kpi-h">
      <h2 id="kpi-h">Performance Dashboard</h2>
      {loading ? <p data-testid="kpi-loading">Loading…</p> : null}
      {error ? <p className="error" data-testid="kpi-error">{error}</p> : null}
      {kpi ? (
        <div className="kpi-grid">
          <div className="kpi-card" data-testid="kpi-orders">
            <h3>Orders</h3>
            <p>{kpi.orders}</p>
          </div>
          <div className="kpi-card" data-testid="kpi-gmv">
            <h3>GMV</h3>
            <p>{formatMoney(kpi.gmv)}</p>
          </div>
          <div className="kpi-card" data-testid="kpi-aov">
            <h3>AOV</h3>
            <p>{formatMoney(kpi.aov)}</p>
          </div>
          <div className="kpi-card" data-testid="kpi-repeat">
            <h3>Repeat Rate</h3>
            <p>{formatPct(kpi.repeatPurchaseRate)}</p>
          </div>
          <div className="kpi-card" data-testid="kpi-fulfillment">
            <h3>Avg Fulfillment</h3>
            <p>{kpi.avgFulfillmentHours.toFixed(1)} hrs</p>
          </div>
          <div className="kpi-card" data-testid="kpi-status">
            <h3>Status Mix</h3>
            <ul>
              {Object.entries(kpi.statusBreakdown).map(([k, v]) => (
                <li key={k}>
                  {k}: {v}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </section>
  );
}
