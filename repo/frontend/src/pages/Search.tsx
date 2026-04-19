import React, { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Input } from '../components/Input';
import { Pagination } from '../components/Pagination';
import type { Package, Recommendation } from '../types';
import { formatMoney } from '../utils/format';

export function SearchPage() {
  const { api } = useAuth();
  const [keyword, setKeyword] = useState('');
  const [category, setCategory] = useState('');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [depositMin, setDepositMin] = useState('');
  const [depositMax, setDepositMax] = useState('');
  const [patientZip, setPatientZip] = useState('');
  const [maxDistance, setMaxDistance] = useState('');
  const [availability, setAvailability] = useState<'ANY' | 'ACTIVE' | 'INACTIVE'>('ANY');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<Package[]>([]);
  const [total, setTotal] = useState(0);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [favIds, setFavIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const pageSize = 10;

  async function runSearch(newPage = page) {
    setError(null);
    try {
      const out = await api.packages.search({
        keyword,
        category: category || null,
        priceMin: priceMin ? Number(priceMin) : null,
        priceMax: priceMax ? Number(priceMax) : null,
        depositMin: depositMin ? Number(depositMin) : null,
        depositMax: depositMax ? Number(depositMax) : null,
        patientZip: patientZip || null,
        maxDistanceMiles: maxDistance ? Number(maxDistance) : null,
        availability:
          availability === 'ACTIVE' ? true : availability === 'INACTIVE' ? false : null,
        page: newPage,
        pageSize,
      });
      setItems(out.items);
      setTotal(out.total);
      setPage(newPage);
      const h = await api.packages.recentHistory();
      setHistory(h.items);
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function loadFavorites() {
    const f = await api.packages.favorites();
    setFavIds(new Set(f.items.map((i) => i.packageId)));
  }

  async function toggleFavorite(pkg: Package) {
    if (favIds.has(pkg.id)) {
      await api.packages.removeFavorite(pkg.id);
    } else {
      await api.packages.addFavorite(pkg.id);
    }
    await loadFavorites();
  }

  async function loadRecommendations() {
    const r = await api.packages.recommend({});
    setRecs(r.items);
  }

  useEffect(() => {
    runSearch(1);
    loadFavorites();
    loadRecommendations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    runSearch(1);
  }

  return (
    <section aria-labelledby="search-h">
      <h2 id="search-h">Package Search</h2>
      <form className="search-filters" onSubmit={onSubmit}>
        <Input label="Keyword" value={keyword} onChange={setKeyword} testId="search-keyword" />
        <label>
          Category
          <select data-testid="search-category" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Any</option>
            <option value="EXAM">Exam</option>
            <option value="MEMBERSHIP">Membership</option>
            <option value="PERSONAL_TRAINING">Personal Training</option>
            <option value="GROUP_CLASS">Group Class</option>
            <option value="VALUE_ADDED">Value-Added</option>
          </select>
        </label>
        <Input label="Price Min" value={priceMin} onChange={setPriceMin} testId="search-price-min" type="number" />
        <Input label="Price Max" value={priceMax} onChange={setPriceMax} testId="search-price-max" type="number" />
        <Input label="Deposit Min" value={depositMin} onChange={setDepositMin} testId="search-deposit-min" type="number" />
        <Input label="Deposit Max" value={depositMax} onChange={setDepositMax} testId="search-deposit-max" type="number" />
        <Input label="Patient ZIP" value={patientZip} onChange={setPatientZip} testId="search-zip" />
        <Input
          label="Max Distance (mi)"
          value={maxDistance}
          onChange={setMaxDistance}
          testId="search-distance"
          type="number"
        />
        <label>
          Availability
          <select
            data-testid="search-avail"
            value={availability}
            onChange={(e) => setAvailability(e.target.value as any)}
          >
            <option value="ANY">Any</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </label>
        <button type="submit" data-testid="search-submit">Search</button>
      </form>
      {error ? <p role="alert" className="error" data-testid="search-error">{error}</p> : null}
      <ul className="package-list" data-testid="search-results">
        {items.map((p) => (
          <li key={p.id} data-testid={`pkg-${p.code}`}>
            <div>
              <strong>{p.name}</strong> <small>({p.code})</small>
            </div>
            <div>
              {formatMoney(p.current?.price)} · Deposit {formatMoney(p.current?.deposit)} ·{' '}
              {p.current?.validityDays} days
            </div>
            {p.distanceMiles != null ? <div>Distance {p.distanceMiles} mi</div> : null}
            <button data-testid={`fav-${p.code}`} onClick={() => toggleFavorite(p)}>
              {favIds.has(p.id) ? 'Unfavorite' : 'Favorite'}
            </button>
          </li>
        ))}
      </ul>
      <Pagination page={page} pageSize={pageSize} total={total} onChange={runSearch} />

      <section aria-labelledby="rec-h" className="recommendations">
        <h3 id="rec-h">Recommendations</h3>
        <ul data-testid="recommendations">
          {recs.map((r) => (
            <li key={r.packageId} data-testid={`rec-${r.package.code}`}>
              <strong>{r.package.name}</strong> — {r.reasons.join('; ')}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="history-h" className="history">
        <h3 id="history-h">Recent Searches</h3>
        <ul data-testid="search-history">
          {history.map((h, idx) => (
            <li key={idx}>
              <code>{JSON.stringify(h.params)}</code>
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}
