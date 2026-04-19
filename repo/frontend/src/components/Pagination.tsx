import React from 'react';

export interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}

export function Pagination({ page, pageSize, total, onChange }: PaginationProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const prev = () => onChange(Math.max(1, page - 1));
  const next = () => onChange(Math.min(pages, page + 1));
  return (
    <div className="pagination" role="navigation" aria-label="pagination">
      <button data-testid="page-prev" disabled={page <= 1} onClick={prev}>
        Prev
      </button>
      <span data-testid="page-status">
        Page {page} / {pages} ({total})
      </span>
      <button data-testid="page-next" disabled={page >= pages} onClick={next}>
        Next
      </button>
    </div>
  );
}
