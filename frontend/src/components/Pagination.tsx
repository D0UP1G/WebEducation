import type { ApiMeta } from '../api/types'

export function Pagination({ meta, page, onPage }: { meta?: ApiMeta; page: number; onPage: (page: number) => void }) {
  if (!meta?.total || !meta.page_size || meta.total <= meta.page_size) return null
  const count = Math.ceil(meta.total / meta.page_size)
  return <nav className="pagination" aria-label="Страницы списка">
    <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>← Назад</button>
    <span>Страница {page} из {count}</span>
    <button type="button" disabled={page >= count} onClick={() => onPage(page + 1)}>Далее →</button>
  </nav>
}
