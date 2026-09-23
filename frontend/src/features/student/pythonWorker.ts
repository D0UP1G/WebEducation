type Runtime = {
  globals: { set: (name: string, value: unknown) => void }
  runPython: (source: string) => unknown
}

const pyodideBase = 'https://cdn.jsdelivr.net/pyodide/v314.0.7/full/'
const runtimePromise: Promise<Runtime> = import(/* @vite-ignore */ `${pyodideBase}pyodide.mjs`)
  .then((module) => module.loadPyodide({ indexURL: pyodideBase }))

const runner = String.raw`
import io
import json
import sys
import time
import tracemalloc

class LimitedOutput(io.StringIO):
    def __init__(self, limit):
        super().__init__()
        self.limit = limit
        self.size = 0

    def write(self, text):
        self.size += len(text.encode('utf-8'))
        if self.size > self.limit:
            raise OverflowError('output limit')
        return super().write(text)

stream = LimitedOutput(__output_limit)
previous_stdin, previous_stdout = sys.stdin, sys.stdout
sys.stdin = io.StringIO(__input)
sys.stdout = stream
tracemalloc.start()
started = time.perf_counter()
exit_code = 0
try:
    exec(compile(__source, '<solution>', 'exec'), {'__name__': '__main__'})
except OverflowError:
    exit_code = 123
except BaseException:
    exit_code = 1
finally:
    duration_ms = int((time.perf_counter() - started) * 1000)
    _, peak_memory_bytes = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    sys.stdin, sys.stdout = previous_stdin, previous_stdout

json.dumps({
    'stdout': stream.getvalue(),
    'exit_code': exit_code,
    'duration_ms': duration_ms,
    'peak_memory_bytes': peak_memory_bytes,
})
`

runtimePromise.then(() => self.postMessage({ type: 'ready' })).catch(() => self.postMessage({ type: 'load_error' }))

self.onmessage = async (event: MessageEvent<{ id: number; code: string; input: string; outputLimit: number }>) => {
  try {
    const runtime = await runtimePromise
    runtime.globals.set('__source', event.data.code)
    runtime.globals.set('__input', event.data.input)
    runtime.globals.set('__output_limit', event.data.outputLimit)
    const result = JSON.parse(String(runtime.runPython(runner)))
    self.postMessage({ type: 'result', id: event.data.id, result })
  } catch {
    self.postMessage({ type: 'result', id: event.data.id, result: {
      stdout: '', exit_code: 125, duration_ms: 0, peak_memory_bytes: 0,
    } })
  }
}
