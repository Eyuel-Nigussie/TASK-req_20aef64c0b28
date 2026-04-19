export function formatMoney(amount: number | null | undefined, currency: string = 'USD'): string {
  if (amount == null) return '-';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
  } catch {
    return `$${Number(amount).toFixed(2)}`;
  }
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

export function formatPct(v: number | null | undefined): string {
  if (v == null) return '-';
  return `${(v * 100).toFixed(1)}%`;
}

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validatePasswordPolicy(password: string): string[] {
  const errs: string[] = [];
  if (!password || password.length < 12) errs.push('must be at least 12 characters');
  if (!/[A-Z]/.test(password)) errs.push('must contain an uppercase letter');
  if (!/[a-z]/.test(password)) errs.push('must contain a lowercase letter');
  if (!/[0-9]/.test(password)) errs.push('must contain a digit');
  if (!/[^A-Za-z0-9]/.test(password)) errs.push('must contain a symbol');
  return errs;
}

export function paginate<T>(items: T[], page: number, pageSize: number): T[] {
  const start = Math.max(0, (page - 1) * pageSize);
  return items.slice(start, start + pageSize);
}
