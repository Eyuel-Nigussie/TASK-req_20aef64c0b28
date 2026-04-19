import React, { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import type { ExamItem } from '../types';
import { Input } from '../components/Input';

export function ExamItemsPage() {
  const { api, permit } = useAuth();
  const [items, setItems] = useState<ExamItem[]>([]);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [unit, setUnit] = useState('');
  const [method, setMethod] = useState('BLOOD');
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<Partial<ExamItem>>({});

  async function load() {
    const r = await api.examItems.list();
    setItems(r.items);
  }
  useEffect(() => { load(); }, []); // eslint-disable-line

  async function saveEdit(id: string) {
    setError(null);
    try {
      await api.examItems.update(id, editFields);
      setEditing(null);
      await load();
    } catch (err: any) { setError(err.message); }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name || !code) { setError('Name and code are required'); return; }
    try {
      await api.examItems.create({ name, code, unit, collectionMethod: method });
      setName(''); setCode(''); setUnit('');
      await load();
    } catch (err: any) { setError(err.message); }
  }

  return (
    <section aria-labelledby="ei-h">
      <h2 id="ei-h">Exam Items</h2>
      {permit('examItem:manage') ? (
        <form onSubmit={add} data-testid="ei-form">
          <Input label="Name" value={name} onChange={setName} testId="ei-name" required />
          <Input label="Code" value={code} onChange={setCode} testId="ei-code" required />
          <Input label="Unit" value={unit} onChange={setUnit} testId="ei-unit" />
          <label>
            Method
            <select data-testid="ei-method" value={method} onChange={(e) => setMethod(e.target.value)}>
              <option>BLOOD</option>
              <option>URINE</option>
              <option>SALIVA</option>
              <option>IMAGING</option>
              <option>PHYSICAL</option>
              <option>QUESTIONNAIRE</option>
            </select>
          </label>
          <button type="submit" data-testid="ei-submit">Save Exam Item</button>
          {error ? <p role="alert" className="error" data-testid="ei-error">{error}</p> : null}
        </form>
      ) : null}
      <ul data-testid="ei-list">
        {items.map((i) => (
          <li key={i.id} data-testid={`ei-${i.code}`}>
            {editing === i.id ? (
              <>
                <input
                  value={editFields.name ?? i.name}
                  onChange={(e) => setEditFields((f) => ({ ...f, name: e.target.value }))}
                  data-testid="ei-edit-name"
                />
                <input
                  value={editFields.unit ?? i.unit ?? ''}
                  onChange={(e) => setEditFields((f) => ({ ...f, unit: e.target.value }))}
                  data-testid="ei-edit-unit"
                  placeholder="Unit"
                />
                <select
                  value={editFields.collectionMethod ?? i.collectionMethod ?? ''}
                  onChange={(e) => setEditFields((f) => ({ ...f, collectionMethod: e.target.value as ExamItem['collectionMethod'] }))}
                  data-testid="ei-edit-method"
                >
                  <option>BLOOD</option>
                  <option>URINE</option>
                  <option>SALIVA</option>
                  <option>IMAGING</option>
                  <option>PHYSICAL</option>
                  <option>QUESTIONNAIRE</option>
                </select>
                <button onClick={() => saveEdit(i.id)}>Save</button>
                <button onClick={() => setEditing(null)}>Cancel</button>
              </>
            ) : (
              <>
                <strong>{i.name}</strong> — <span>{i.code}</span> {i.unit ? `(${i.unit})` : ''} — {i.collectionMethod}
                {permit('examItem:manage') ? (
                  <button
                    data-testid={`ei-edit-${i.code}`}
                    onClick={() => { setEditing(i.id); setEditFields({}); }}
                  >
                    Edit
                  </button>
                ) : null}
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
