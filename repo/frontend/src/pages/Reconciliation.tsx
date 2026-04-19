import React, { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import type { ReconciliationCase } from '../types';

export function ReconciliationPage() {
  const { api, permit } = useAuth();
  const [cases, setCases] = useState<ReconciliationCase[]>([]);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [filename, setFilename] = useState('feed.csv');
  const [content, setContent] = useState('');
  const [fileEncoding, setFileEncoding] = useState<'base64' | undefined>(undefined);
  const [disposingCase, setDisposingCase] = useState<{ id: string; disposition: string } | null>(null);
  const [disposeNote, setDisposeNote] = useState('');
  const [splitInvoiceIds, setSplitInvoiceIds] = useState('');
  const [mergeWithCaseId, setMergeWithCaseId] = useState('');

  async function load() {
    try {
      const r = await api.reconciliation.cases({ status: filter || undefined });
      setCases(r.items);
    } catch (err: any) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFilename(file.name);
    const isXlsx = file.name.toLowerCase().endsWith('.xlsx');
    if (isXlsx) {
      setFileEncoding('base64');
      const reader = new FileReader();
      reader.onload = (ev) => {
        const b64 = (ev.target?.result as string).split(',')[1] ?? '';
        setContent(b64);
      };
      reader.readAsDataURL(file);
    } else {
      setFileEncoding(undefined);
      const reader = new FileReader();
      reader.onload = (ev) => setContent(ev.target?.result as string ?? '');
      reader.readAsText(file);
    }
  }

  async function ingest() {
    setError(null);
    try {
      await api.reconciliation.ingest(filename, content, fileEncoding);
      setContent('');
      setFileEncoding(undefined);
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  function beginDispose(id: string, disposition: string) {
    setDisposingCase({ id, disposition });
    setDisposeNote('');
    setSplitInvoiceIds('');
    setMergeWithCaseId('');
  }

  async function confirmDispose() {
    if (!disposingCase) return;
    const body: Record<string, any> = { disposition: disposingCase.disposition, note: disposeNote };
    if (disposingCase.disposition === 'SPLIT') {
      body.invoiceIds = splitInvoiceIds.split(',').map((s) => s.trim()).filter(Boolean);
    }
    if (disposingCase.disposition === 'MERGE') {
      body.mergeWithCaseId = mergeWithCaseId.trim();
    }
    try {
      await api.reconciliation.dispose(disposingCase.id, body);
      setDisposingCase(null);
      setDisposeNote('');
      setSplitInvoiceIds('');
      setMergeWithCaseId('');
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <section aria-labelledby="recon-h">
      <h2 id="recon-h">Reconciliation</h2>
      {permit('reconciliation:manage') ? (
        <div className="ingest-block">
          <label>
            Upload file (CSV or XLSX)
            <input
              data-testid="recon-file"
              type="file"
              accept=".csv,.xlsx"
              onChange={handleFileSelect}
            />
          </label>
          <p style={{ fontSize: '0.85em', color: '#666' }}>
            {filename && content ? `Ready: ${filename}` : 'Or paste CSV below'}
          </p>
          <textarea
            data-testid="recon-content"
            rows={4}
            placeholder="Paste CSV content…"
            value={fileEncoding ? '(binary file loaded)' : content}
            readOnly={!!fileEncoding}
            onChange={(e) => { if (!fileEncoding) setContent(e.target.value); }}
          />
          <button data-testid="recon-ingest" onClick={ingest} disabled={!content}>Ingest</button>
        </div>
      ) : null}
      <label>
        Filter
        <select data-testid="recon-filter" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">All</option>
          <option value="MATCHED">Matched</option>
          <option value="UNMATCHED">Unmatched</option>
          <option value="VARIANCE">Variance</option>
          <option value="SUSPECTED_DUPLICATE">Suspected Duplicates</option>
          <option value="WRITTEN_OFF">Written Off</option>
        </select>
      </label>
      {error ? <p className="error" data-testid="recon-error">{error}</p> : null}

      {disposingCase && (
        <div data-testid="dispose-dialog" style={{ border: '1px solid #ccc', padding: '1rem', marginBottom: '1rem' }}>
          <p>Disposition: <strong>{disposingCase.disposition}</strong></p>
          {disposingCase.disposition === 'SPLIT' && (
            <label>
              Invoice IDs (comma-separated, ≥ 2)
              <input
                data-testid="dispose-split-ids"
                type="text"
                value={splitInvoiceIds}
                onChange={(e) => setSplitInvoiceIds(e.target.value)}
                placeholder="inv-aaa,inv-bbb"
              />
            </label>
          )}
          {disposingCase.disposition === 'MERGE' && (
            <label>
              Merge with Case ID
              <input
                data-testid="dispose-merge-id"
                type="text"
                value={mergeWithCaseId}
                onChange={(e) => setMergeWithCaseId(e.target.value)}
                placeholder="case-id"
              />
            </label>
          )}
          <label>
            Note
            <textarea
              data-testid="dispose-note"
              rows={3}
              value={disposeNote}
              onChange={(e) => setDisposeNote(e.target.value)}
            />
          </label>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button data-testid="dispose-confirm" onClick={confirmDispose}>Confirm</button>
            <button data-testid="dispose-cancel" onClick={() => setDisposingCase(null)}>Cancel</button>
          </div>
        </div>
      )}

      <table data-testid="recon-table">
        <thead>
          <tr>
            <th>Case</th>
            <th>Transaction</th>
            <th>Invoice</th>
            <th>Status</th>
            <th>Score</th>
            <th>Disposition</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {cases.map((c) => (
            <tr key={c.id} data-testid={`case-${c.id}`}>
              <td>{c.id.slice(0, 8)}</td>
              <td>{c.transactionId ? c.transactionId.slice(0, 8) : '-'}</td>
              <td>{c.invoiceId ? c.invoiceId.slice(0, 8) : '-'}</td>
              <td>{c.status}</td>
              <td>{c.score}</td>
              <td>{c.disposition || '-'}</td>
              <td>
                {permit('reconciliation:manage') && !c.disposition ? (
                  <>
                    <button onClick={() => beginDispose(c.id, 'CONFIRM_MATCH')}>Confirm</button>
                    <button onClick={() => beginDispose(c.id, 'SPLIT')}>Split</button>
                    <button onClick={() => beginDispose(c.id, 'MERGE')}>Merge</button>
                    <button data-testid={`writeoff-${c.id}`} onClick={() => beginDispose(c.id, 'WRITE_OFF')}>
                      Write Off
                    </button>
                  </>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
