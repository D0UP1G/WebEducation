export interface PythonSample {
  sample: { input: string; output: string }
  limits: { time_limit_ms: number; memory_limit_mb: number; output_limit_bytes: number }
}

export interface PythonResult {
  stdout: string
  stderr: string
  exit_code: number
  duration_ms: number
  peak_memory_bytes: number
}

export async function runPythonSample(
  code: string,
  sample: PythonSample,
  input = sample.sample.input,
): Promise<PythonResult> {
  const worker = new Worker(new URL('./pythonWorker.ts', import.meta.url), { type: 'module' })
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
    return await new Promise<PythonResult>((resolve) => {
      const limit = sample.limits.time_limit_ms
      timer = window.setTimeout(() => {
        worker.terminate()
        resolve({ stdout: '', stderr: 'Превышен лимит времени', exit_code: 124,
          duration_ms: limit + 1, peak_memory_bytes: 0 })
      }, limit)
      worker.addEventListener('message', function onResult(event: MessageEvent) {
        if (event.data.type !== 'result') return
        worker.removeEventListener('message', onResult)
        window.clearTimeout(timer)
        resolve(event.data.result)
      })
      worker.postMessage({ code, input, outputLimit: sample.limits.output_limit_bytes })
    })
  } finally {
    window.clearTimeout(timer)
    worker.terminate()
  }
}
