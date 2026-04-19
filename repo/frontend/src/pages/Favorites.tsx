import React, { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { formatMoney } from '../utils/format';

export function FavoritesPage() {
  const { api } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  async function load() {
    const r = await api.packages.favorites();
    setItems(r.items);
  }
  useEffect(() => { load(); }, []); // eslint-disable-line

  async function remove(id: string) {
    await api.packages.removeFavorite(id);
    await load();
  }

  return (
    <section aria-labelledby="fav-h">
      <h2 id="fav-h">Favorites</h2>
      <ul data-testid="fav-list">
        {items.map((f) => (
          <li key={f.id}>
            <strong>{f.package.name}</strong> — {formatMoney(f.package.current?.price)}
            <button data-testid={`fav-remove-${f.package.code}`} onClick={() => remove(f.packageId)}>Remove</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
