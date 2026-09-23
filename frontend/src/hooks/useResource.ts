import { useEffect, useRef, useState } from 'react'
import { errorMessage } from '../api/client'

export function useResource<T>(key: string, loader: () => Promise<T>) {
  const loaderRef = useRef(loader)
  loaderRef.current = loader
  const [revision, setRevision] = useState(0)
  const [result, setResult] = useState<{ key: string; data: T | null; loading: boolean; error: string | null }>({
    key, data: null, loading: true, error: null,
  })

  useEffect(() => {
    let active = true
    setResult({ key, data: null, loading: true, error: null })
    loaderRef.current().then(
      (value) => {
        if (!active) return
        setResult({ key, data: value, loading: false, error: null })
      },
      (reason) => {
        if (!active) return
        setResult({ key, data: null, loading: false, error: errorMessage(reason) })
      },
    )
    return () => { active = false }
  }, [key, revision])

  return {
    data: result.key === key ? result.data : null,
    loading: result.key !== key || result.loading,
    error: result.key === key ? result.error : null,
    reload: () => setRevision((value) => value + 1),
  }
}
