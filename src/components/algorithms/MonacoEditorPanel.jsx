// MonacoEditorPanel — lazy-loaded Monaco surface used only by
// MultiLangCode. Kept in its own module so React.lazy() can code-split
// Monaco's ~500KB gzipped bundle out of the main chunk. Only visitors
// to `/algorithms/*` pay for it.
//
// Props:
//   value        — current source (string)
//   language     — Monaco language id ('c'|'cpp'|'python'|'java'|'rust'|'plaintext')
//   theme        — Monaco theme id ('vs-dark'|'algo-monokai'|...)
//   onChange     — (nextValue) => void
//   height       — CSS height (defaults to '360px')
//   readOnly     — bool. Locks editing (used for pseudocode tab).
//   reducedMotion — bool. Disables cursor blink so the a11y contract holds.

import Editor from '@monaco-editor/react'
import { useCallback } from 'react'
import { registerAlgoThemes } from './monacoThemes'

// Sensible cross-language editor defaults tuned for algorithm reading:
//   - 13px font, JetBrains Mono if present (falls back to Menlo/Consolas)
//   - Word wrap on so long lines don't hide behind a scrollbar
//   - Minimap off (it's noise on a 360px-tall panel)
//   - Tab size 2 which matches the canonical algorithm strings we ship
//   - Bracket pair colourization so nested loops read well
const BASE_OPTIONS = {
  fontFamily: '"JetBrains Mono", "Fira Code", Menlo, Consolas, monospace',
  fontSize: 13,
  lineHeight: 20,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  smoothScrolling: true,
  wordWrap: 'on',
  tabSize: 2,
  insertSpaces: true,
  padding: { top: 12, bottom: 12 },
  bracketPairColorization: { enabled: true },
  guides: { indentation: true, bracketPairs: true },
  automaticLayout: true,
  scrollbar: {
    verticalScrollbarSize: 8,
    horizontalScrollbarSize: 8,
    useShadows: false,
  },
  overviewRulerLanes: 0,
  overviewRulerBorder: false,
  hideCursorInOverviewRuler: true,
  renderLineHighlight: 'gutter',
}

export default function MonacoEditorPanel({
  value,
  language = 'plaintext',
  theme = 'vs-dark',
  onChange,
  height = '360px',
  readOnly = false,
  reducedMotion = false,
}) {
  const handleMount = useCallback((editor, monaco) => {
    registerAlgoThemes(monaco)
    // Apply the theme after registering — passing an unknown theme via
    // the `theme` prop before defineTheme has fired causes Monaco to
    // fall back to vs-dark. Set it here to guarantee the picked theme
    // shows on the very first paint.
    try { monaco.editor.setTheme(theme) } catch { /* ignore */ }
  }, [theme])

  const handleBeforeMount = useCallback((monaco) => {
    // Register themes *before* the editor mounts so the initial paint
    // is already themed correctly (no flash-of-vs-dark).
    registerAlgoThemes(monaco)
  }, [])

  const options = {
    ...BASE_OPTIONS,
    readOnly,
    cursorBlinking: reducedMotion ? 'solid' : 'smooth',
    cursorSmoothCaretAnimation: reducedMotion ? 'off' : 'on',
  }

  return (
    <Editor
      value={value}
      language={language}
      theme={theme}
      onChange={(v) => onChange?.(v ?? '')}
      onMount={handleMount}
      beforeMount={handleBeforeMount}
      height={height}
      options={options}
      loading={
        <div className="w-full h-full flex items-center justify-center text-[11px] font-mono text-gray-500">
          Loading editor…
        </div>
      }
    />
  )
}
