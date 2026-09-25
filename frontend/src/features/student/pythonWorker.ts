type Runtime = {
  globals: { set: (name: string, value: unknown) => void }
  runPython: (source: string) => unknown
}

const pyodideBase = `${self.location.origin}/pyodide/`
const runtimePromise: Promise<Runtime> = import(/* @vite-ignore */ `${pyodideBase}pyodide.mjs`)
  .then(async (module) => {
    const runtime: Runtime = await module.loadPyodide({ indexURL: pyodideBase })
    runtime.runPython('import io, json, sys, time, tracemalloc, traceback')
    return runtime
  })

const runner = String.raw`
import io
import json
import sys
import time
import tracemalloc
import traceback

class OutputLimitExceeded(Exception):
    pass

class LimitedOutput(io.StringIO):
    def __init__(self, limit):
        super().__init__()
        self.limit = limit
        self.size = 0

    def write(self, text):
        self.size += len(text.encode('utf-8'))
        if self.size > self.limit:
            raise OutputLimitExceeded('output limit')
        return super().write(text)

stream = LimitedOutput(__output_limit)
error_stream = LimitedOutput(4096)
previous_stdin, previous_stdout = sys.stdin, sys.stdout
sys.stdin = io.StringIO(__input)
sys.stdout = stream
tracemalloc.start()
started = time.perf_counter()
exit_code = 0
try:
    exec(compile(__source, '<solution>', 'exec'), {'__name__': '__main__'})
except OutputLimitExceeded:
    exit_code = 123
except BaseException:
    exit_code = 1
    try:
        traceback.print_exc(file=error_stream)
    except OutputLimitExceeded:
        pass
finally:
    duration_ms = int((time.perf_counter() - started) * 1000)
    _, peak_memory_bytes = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    sys.stdin, sys.stdout = previous_stdin, previous_stdout

json.dumps({
    'stdout': stream.getvalue(),
    'stderr': error_stream.getvalue(),
    'exit_code': exit_code,
    'duration_ms': duration_ms,
    'peak_memory_bytes': peak_memory_bytes,
})
`

runtimePromise.then(() => self.postMessage({ type: 'ready' })).catch(() => self.postMessage({ type: 'load_error' }))

self.onmessage = async (event: MessageEvent<{ code: string; input: string; outputLimit: number }>) => {
  try {
    const runtime = await runtimePromise
    runtime.globals.set('__source', event.data.code)
    runtime.globals.set('__input', event.data.input)
    runtime.globals.set('__output_limit', event.data.outputLimit)
    const result = JSON.parse(String(runtime.runPython(runner)))
    self.postMessage({ type: 'result', result })
  } catch {
    self.postMessage({ type: 'result', result: {
      stdout: '', stderr: 'Ошибка среды Python', exit_code: 125, duration_ms: 0, peak_memory_bytes: 0,
    } })
  }
}
