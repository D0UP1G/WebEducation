import { useState } from 'react'
import type { Paginated } from '../api/types'
import { useResource } from './useResource'

export function usePagedResource<T>(key: string, loader: (page: number) => Promise<Paginated<T>>) {
  const [page, setPage] = useState(1)
  const resource = useResource(`${key}:${page}`, () => loader(page))
  return { ...resource, page, setPage }
}
