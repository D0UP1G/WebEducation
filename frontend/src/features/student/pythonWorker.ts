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
import reprlib

class OutputLimitExceeded(Exception):
    pass

class TraceLimitExceeded(Exception):
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
trace_steps = []
trace_limit_reached = False
preview = reprlib.Repr()
preview.maxstring = 120
preview.maxother = 120
preview.maxlist = 8
preview.maxtuple = 8
preview.maxdict = 8

def visible_variables(scope):
    variables = {}
    for name, value in list(scope.items())[:30]:
        if name.startswith('__'):
            continue
        try:
            variables[name] = preview.repr(value)[:160]
        except BaseException:
            variables[name] = '<не удалось показать значение>'
        if len(variables) >= 20:
            break
    return variables

def trace_solution(frame, event, arg):
    if frame.f_code.co_filename != '<solution>':
        return None
    if event == 'line':
        if len(trace_steps) >= 250:
            raise TraceLimitExceeded()
        stack = []
        cursor = frame
        while cursor and cursor.f_code.co_filename == '<solution>' and len(stack) < 12:
            stack.append(cursor.f_code.co_name)
            cursor = cursor.f_back
        trace_steps.append({
            'kind': 'line',
            'line': frame.f_lineno,
            'scope': frame.f_code.co_name,
            'stack': stack[::-1],
            'variables': visible_variables(frame.f_locals),
            'stdout': stream.getvalue()[:2000],
        })
    return trace_solution

tracemalloc.start()
started = time.perf_counter()
exit_code = 0
solution_globals = {'__name__': '__main__'}
try:
    compiled = compile(__source, '<solution>', 'exec')
    if __trace_mode:
        sys.settrace(trace_solution)
    exec(compiled, solution_globals)
except OutputLimitExceeded:
    exit_code = 123
except TraceLimitExceeded:
    exit_code = 126
    trace_limit_reached = True
except BaseException:
    exit_code = 1
    try:
        traceback.print_exc(file=error_stream)
    except OutputLimitExceeded:
        pass
finally:
    if __trace_mode:
        sys.settrace(None)
    duration_ms = int((time.perf_counter() - started) * 1000)
    _, peak_memory_bytes = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    sys.stdin, sys.stdout = previous_stdin, previous_stdout

if __trace_mode:
    trace_steps.append({
        'kind': 'limit' if trace_limit_reached else 'error' if exit_code else 'finish',
        'line': trace_steps[-1]['line'] if trace_steps else None,
        'scope': trace_steps[-1]['scope'] if trace_steps else '<module>',
        'stack': trace_steps[-1]['stack'] if trace_steps else [],
        'variables': visible_variables(solution_globals) if exit_code == 0 else trace_steps[-1]['variables'] if trace_steps else {},
        'stdout': stream.getvalue()[:2000],
    })

json.dumps({
    'stdout': stream.getvalue(),
    'stderr': error_stream.getvalue(),
    'exit_code': exit_code,
    'duration_ms': duration_ms,
    'peak_memory_bytes': peak_memory_bytes,
    'trace_steps': trace_steps,
})
`

runtimePromise.then(() => self.postMessage({ type: 'ready' })).catch(() => self.postMessage({ type: 'load_error' }))

self.onmessage = async (event: MessageEvent<{ code: string; input: string; outputLimit: number; trace?: boolean }>) => {
  try {
    const runtime = await runtimePromise
    runtime.globals.set('__source', event.data.code)
    runtime.globals.set('__input', event.data.input)
    runtime.globals.set('__output_limit', event.data.outputLimit)
    runtime.globals.set('__trace_mode', event.data.trace === true)
    const result = JSON.parse(String(runtime.runPython(runner)))
    self.postMessage({ type: 'result', result })
  } catch {
    self.postMessage({ type: 'result', result: {
      stdout: '', stderr: 'Ошибка среды Python', exit_code: 125, duration_ms: 0, peak_memory_bytes: 0,
      trace_steps: [],
    } })
  }
}
