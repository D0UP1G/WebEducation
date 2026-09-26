import { useState } from 'react'
import type { PythonTraceResult } from './pythonRunner'

export function PythonTraceViewer({ code, input, result }: {
  code: string
  input: string
  result: PythonTraceResult
}) {
  const [position, setPosition] = useState(0)
  const steps = result.trace_steps ?? []
  const current = steps[position]
  const lines = code.split('\n')

  if (!current) return <div className="notice info" role="status">
    {result.exit_code === 124 ? 'Визуализация остановлена: превышен лимит времени.' :
      result.stderr || 'Не удалось построить шаги выполнения.'}
  </div>

  const title = current.kind === 'line' ? `Перед выполнением строки ${current.line}`
    : current.kind === 'finish' ? 'Программа завершилась'
      : current.kind === 'limit' ? 'Визуализация остановлена после 250 шагов'
        : 'Программа завершилась с ошибкой'
  const variables = Object.entries(current.variables)

  return <section className="python-trace" aria-label="Выполнение Python по шагам">
    <div className="python-trace-heading">
      <div>
        <h3>Выполнение по шагам</h3>
        <p className="muted">Строка подсвечена перед выполнением. Переменные и вывод показывают состояние на этот момент.</p>
      </div>
      <span className="python-trace-counter">Шаг {position + 1} из {steps.length}</span>
    </div>
    <div className="python-trace-controls">
      <button type="button" disabled={position === 0} onClick={() => setPosition((value) => value - 1)}>← Назад</button>
      <input type="range" min={0} max={steps.length - 1} value={position}
        aria-label="Выбрать шаг выполнения" onChange={(event) => setPosition(Number(event.target.value))} />
      <button type="button" disabled={position === steps.length - 1} onClick={() => setPosition((value) => value + 1)}>Далее →</button>
    </div>
    <div className="python-trace-grid">
      <div className="python-trace-code-panel">
        <h4>Код</h4>
        <pre aria-label="Код с текущей строкой"><code>{lines.map((line, index) =>
          <span key={index} className={`python-trace-code-line${current.kind !== 'finish' && current.line === index + 1 ? ' active' : ''}`}
            aria-current={current.kind !== 'finish' && current.line === index + 1 ? 'step' : undefined}>
            <span className="python-trace-line-number" aria-hidden="true">{index + 1}</span>{line || ' '}{'\n'}
          </span>,
        )}</code></pre>
      </div>
      <div className="python-trace-state">
        <h4>{title}</h4>
        {current.kind === 'line' && <p className="muted">Область: {current.scope === '<module>' ? 'основной код' : current.scope}</p>}
        {current.kind === 'line' && current.stack.length > 1 && <p className="python-trace-stack">Вызовы: {current.stack.map((name) => name === '<module>' ? 'основной код' : name).join(' → ')}</p>}
        <h5>Переменные</h5>
        {variables.length ? <dl>{variables.map(([name, value]) =>
          <div key={name}><dt>{name}</dt><dd><code>{value}</code></dd></div>,
        )}</dl> : <p className="muted">Пока нет локальных переменных.</p>}
        <h5>Входные данные</h5>
        <pre>{input || '(пусто)'}</pre>
        <h5>Вывод к этому шагу</h5>
        <pre>{current.stdout || '(пока нет)'}</pre>
        {current.kind === 'error' && result.stderr && <><h5>Ошибка</h5><pre>{result.stderr}</pre></>}
        {current.kind === 'limit' && <p className="muted">Выполнение остановлено, чтобы браузер не хранил слишком много состояний.</p>}
      </div>
    </div>
    <p className="muted">Это локальная визуализация. Зачёт выставляется только после отправки решения на сервер.</p>
  </section>
}
