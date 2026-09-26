import { useEffect, useRef } from 'react'
import { basicSetup, EditorView } from 'codemirror'
import { completeFromList, snippetCompletion } from '@codemirror/autocomplete'
import { indentWithTab } from '@codemirror/commands'
import { indentUnit } from '@codemirror/language'
import { EditorState, Compartment, Prec } from '@codemirror/state'
import { keymap } from '@codemirror/view'
import { python, pythonLanguage } from '@codemirror/lang-python'

const editorSnippets = completeFromList([
  snippetCompletion('for ${1:item} in ${2:items}:\n    ${0}', {
    label: 'for', detail: 'цикл for', type: 'keyword',
  }),
  snippetCompletion('if ${1:condition}:\n    ${0}', {
    label: 'if', detail: 'условие if', type: 'keyword',
  }),
  snippetCompletion('def ${1:function_name}(${2:args}):\n    ${0}', {
    label: 'def', detail: 'объявление функции', type: 'keyword',
  }),
  snippetCompletion('while ${1:condition}:\n    ${0}', {
    label: 'while', detail: 'цикл while', type: 'keyword',
  }),
  snippetCompletion('if __name__ == "__main__":\n    ${0}', {
    label: 'main', detail: 'точка входа программы', type: 'keyword',
  }),
])

export function PythonCodeEditor({ value, onChange, disabled = false, ariaLabel }: {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  ariaLabel: string
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const editable = useRef(new Compartment())
  onChangeRef.current = onChange

  useEffect(() => {
    if (!hostRef.current) return
    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          python(),
          pythonLanguage.data.of({ autocomplete: editorSnippets }),
          indentUnit.of('    '),
          Prec.highest(keymap.of([indentWithTab])),
          editable.current.of([
            EditorView.editable.of(!disabled),
            EditorState.readOnly.of(disabled),
          ]),
          EditorView.contentAttributes.of({
            role: 'textbox',
            'aria-label': ariaLabel,
            'aria-multiline': 'true',
            'aria-disabled': disabled ? 'true' : 'false',
            spellcheck: 'false',
          }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString())
          }),
        ],
      }),
      parent: hostRef.current,
    })
    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
  // CodeMirror owns this editor instance; subsequent props update it through the effects below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (!view || view.state.doc.toString() === value) return
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } })
  }, [value])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: editable.current.reconfigure([
        EditorView.editable.of(!disabled),
        EditorState.readOnly.of(disabled),
      ]),
    })
    view.contentDOM.setAttribute('aria-disabled', disabled ? 'true' : 'false')
  }, [disabled])

  return <div className="python-code-editor" ref={hostRef} />
}
