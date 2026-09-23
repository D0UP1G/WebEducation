export interface PythonChallenge {
  challenge_token: string
  tests: Array<{ id: number; input: string }>
  limits: { time_limit_ms: number; memory_limit_mb: number; output_limit_bytes: number }
  expires_in_seconds: number
}

export interface PythonResult {
  id: number
  stdout: string
  exit_code: number
  duration_ms: number
  peak_memory_bytes: number
}

export async function runPythonTests(code: string, challenge: PythonChallenge): Promise<PythonResult[]> {
  const worker = new Worker(new URL('./pythonWorker.ts', import.meta.url), { type: 'module' })
  const results: PythonResult[] = []
  let timer: number | undefined
  try {
    await new Promise<void>((resolve, reject) => {
      timer = window.setTimeout(() => reject(new Error('Среда Python не загрузилась за 60 секунд')), 60000)
      worker.addEventListener('message', function onReady(event: MessageEvent) {
        if (event.data.type !== 'ready' && event.data.type !== 'load_error') return
        worker.removeEventListener('message', onReady)
        window.clearTimeout(timer)
        if (event.data.type === 'ready') resolve()
        else reject(new Error('Не удалось загрузить среду Python'))
      })
      worker.addEventListener('error', () => reject(new Error('Не удалось запустить среду Python')), { once: true })
    })

    for (const test of challenge.tests) {
      const result = await new Promise<PythonResult>((resolve) => {
        const limit = challenge.limits.time_limit_ms
        timer = window.setTimeout(() => {
          worker.terminate()
          resolve({ id: test.id, stdout: '', exit_code: 124, duration_ms: limit + 1, peak_memory_bytes: 0 })
        }, limit)
        worker.addEventListener('message', function onResult(event: MessageEvent) {
          if (event.data.type !== 'result' || event.data.id !== test.id) return
          worker.removeEventListener('message', onResult)
          window.clearTimeout(timer)
          resolve({ id: test.id, ...event.data.result })
        })
        worker.postMessage({ id: test.id, code, input: test.input, outputLimit: challenge.limits.output_limit_bytes })
      })
      results.push(result)
      if (result.exit_code === 124) {
        for (const remaining of challenge.tests.slice(results.length)) {
          results.push({ id: remaining.id, stdout: '', exit_code: 124,
            duration_ms: challenge.limits.time_limit_ms + 1, peak_memory_bytes: 0 })
        }
        break
      }
    }
    return results
  } finally {
    window.clearTimeout(timer)
    worker.terminate()
  }
}
