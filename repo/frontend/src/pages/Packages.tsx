import React, { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Input } from '../components/Input';
import type { Package, ExamItem } from '../types';
import { formatMoney } from '../utils/format';

export function PackagesPage() {
  const { api, permit } = useAuth();
  const [items, setItems] = useState<Package[]>([]);
  const [examItems, setExamItems] = useState<ExamItem[]>([]);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [price, setPrice] = useState('');
  const [deposit, setDeposit] = useState('');
  const [validity, setValidity] = useState('90');
  const [selected, setSelected] = useState<Record<string, { required: boolean }>>({});
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState('EXAM');
  const [versions, setVersions] = useState<{ pkgId: string; items: any[] } | null>(null);

  async function load() {
    const [p, e] = await Promise.all([api.packages.list(), api.examItems.list()]);
    setItems(p.items);
    setExamItems(e.items);
  }
  useEffect(() => { load(); }, []); // eslint-disable-line

  function toggle(id: string) {
    setSelected((s) => {
      const copy = { ...s };
      if (copy[id]) delete copy[id];
      else copy[id] = { required: true };
      return copy;
    });
  }

  function toggleRequired(id: string) {
    setSelected((s) => ({ ...s, [id]: { required: !s[id].required } }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const composition = Object.entries(selected).map(([examItemId, v]) => ({ examItemId, required: v.required }));
    if (composition.length === 0) { setError('Select at least one exam item'); return; }
    if (Number(price) < 0) { setError('Price must be >= 0'); return; }
    try {
      await api.packages.create({
        name, code, category, composition,
        price: Number(price),
        deposit: Number(deposit) || 0,
        validityDays: Number(validity),
      });
      setName(''); setCode(''); setPrice(''); setDeposit(''); setSelected({});
      await load();
    } catch (err: any) { setError(err.message); }
  }

  async function toggleActive(p: Package) {
    await api.packages.setActive(p.id, !p.active);
    await load();
  }

  async function showVersions(p: Package) {
    if (versions?.pkgId === p.id) { setVersions(null); return; }
    const versionItems: any[] = [];
    for (let v = 1; v <= p.currentVersion; v++) {
      try {
        const vData = await api.packages.getVersion(p.id, v);
        versionItems.push(vData);
      } catch { /* version missing */ }
    }
    setVersions({ pkgId: p.id, items: versionItems });
  }

  return (
    <section aria-labelledby="pkg-h">
      <h2 id="pkg-h">Packages</h2>
      {permit('package:manage') ? (
        <form onSubmit={save} className="pkg-form">
          <Input label="Name" value={name} onChange={setName} testId="pkg-name" required />
          <Input label="Code" value={code} onChange={setCode} testId="pkg-code" required />
          <label>
            Category
            <select data-testid="pkg-category" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option>EXAM</option>
              <option>MEMBERSHIP</option>
              <option>PERSONAL_TRAINING</option>
              <option>GROUP_CLASS</option>
              <option>VALUE_ADDED</option>
            </select>
          </label>
          <Input label="Price" value={price} onChange={setPrice} testId="pkg-price" type="number" required />
          <Input label="Deposit" value={deposit} onChange={setDeposit} testId="pkg-deposit" type="number" />
          <Input label="Validity Days" value={validity} onChange={setValidity} testId="pkg-validity" type="number" required />
          <div data-testid="pkg-exam-select">
            <h4>Composition</h4>
            {examItems.map((e) => (
              <label key={e.id}>
                <input
                  data-testid={`pkg-item-${e.code}`}
                  type="checkbox"
                  checked={Boolean(selected[e.id])}
                  onChange={() => toggle(e.id)}
                />
                {e.name}
                {selected[e.id] ? (
                  <button
                    type="button"
                    data-testid={`pkg-req-${e.code}`}
                    onClick={() => toggleRequired(e.id)}
                  >
                    {selected[e.id].required ? 'Required' : 'Optional'}
                  </button>
                ) : null}
              </label>
            ))}
          </div>
          {error ? <p className="error" data-testid="pkg-error">{error}</p> : null}
          <button type="submit" data-testid="pkg-save">Save Package</button>
        </form>
      ) : null}
      <ul data-testid="pkg-list">
        {items.map((p) => (
          <li key={p.id} data-testid={`pkgrow-${p.code}`}>
            <strong>{p.name}</strong> ({p.code}) — {formatMoney(p.current?.price)} · v{p.currentVersion}
            {permit('package:manage') ? (
              <button data-testid={`pkg-toggle-${p.code}`} onClick={() => toggleActive(p)}>
                {p.active ? 'Disable' : 'Enable'}
              </button>
            ) : null}
            <button data-testid={`pkg-history-${p.code}`} onClick={() => showVersions(p)}>
              {versions?.pkgId === p.id ? 'Hide History' : 'Version History'}
            </button>
            {versions?.pkgId === p.id && (
              <ul data-testid={`pkg-versions-${p.code}`}>
                {versions.items.map((v) => (
                  <li key={v.version}>
                    v{v.version} — {formatMoney(v.price)} — {v.composition?.length ?? 0} items
                    {v.validFrom ? ` (from ${v.validFrom.slice(0, 10)})` : ''}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
