import React, { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { formatDate } from '../utils/format';

export function AuditPage() {
  const { api } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [chainValid, setChainValid] = useState<boolean | null>(null);
  const [anomalies, setAnomalies] = useState<any[]>([]);

  async function load() {
    const list = await api.reports.audit(200);
    setItems(list.items);
    const v = await api.reports.verify();
    setChainValid(v.valid);
    const a = await api.reports.anomalies();
    setAnomalies(a.items);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section aria-labelledby="audit-h">
      <h2 id="audit-h">Audit Log</h2>
      <p data-testid="chain-valid">Tamper-evident chain: {chainValid == null ? '…' : chainValid ? 'VALID' : 'BROKEN'}</p>
      <h3>Anomalies</h3>
      <ul data-testid="audit-anomalies">
        {anomalies.map((a) => (
          <li key={a.id}>
            {formatDate(a.ts)} {a.action} · {a.anomaly}
          </li>
        ))}
      </ul>
      <h3>Recent Events</h3>
      <table data-testid="audit-table">
        <thead>
          <tr>
            <th>Seq</th>
            <th>When</th>
            <th>Action</th>
            <th>Resource</th>
            <th>Actor</th>
          </tr>
        </thead>
        <tbody>
          {items.map((e) => (
            <tr key={e.id}>
              <td>{e.seq}</td>
              <td>{formatDate(e.ts)}</td>
              <td>{e.action}</td>
              <td>{e.resource}:{e.resourceId?.slice(0, 8) ?? '-'}</td>
              <td>{e.actorId ? e.actorId.slice(0, 8) : '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
