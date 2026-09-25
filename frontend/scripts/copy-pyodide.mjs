import { copyFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const source = resolve('node_modules/pyodide')
const target = resolve('public/pyodide')
mkdirSync(target, { recursive: true })
for (const file of ['pyodide.mjs', 'pyodide.asm.mjs', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json']) {
  copyFileSync(resolve(source, file), resolve(target, file))
}
