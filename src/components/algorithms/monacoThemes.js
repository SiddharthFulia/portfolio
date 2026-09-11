// Monaco theme registry — 7 hand-picked themes + the built-in Dark+.
//
// Each theme is registered once against a Monaco instance via
// `monaco.editor.defineTheme(id, spec)`. The `id` is what we pass to
// `<Editor theme={id} />`.
//
// The default (VS Code Dark+) uses Monaco's built-in `vs-dark`, so we
// don't re-define it — we just expose it in the picker list.
//
// Colours below are canonical from each theme's published spec — Monokai
// (Ubuntu-canonical values), Dracula (draculatheme.com), Nord
// (nordtheme.com), Tokyo Night (folke), Solarized (ethanschoonover),
// One Dark (Atom), GitHub Light (primer). Kept minimal — only the token
// rules that actually change how algorithm code reads.

export const THEMES = [
  { id: 'vs-dark',         label: 'VS Code Dark+', builtin: true },
  { id: 'algo-monokai',    label: 'Monokai',       builtin: false },
  { id: 'algo-dracula',    label: 'Dracula',       builtin: false },
  { id: 'algo-tokyo-night', label: 'Tokyo Night',   builtin: false },
  { id: 'algo-nord',       label: 'Nord',          builtin: false },
  { id: 'algo-one-dark',   label: 'One Dark',      builtin: false },
  { id: 'algo-solarized-dark', label: 'Solarized Dark', builtin: false },
  { id: 'algo-github-light', label: 'GitHub Light', builtin: false },
]

export const DEFAULT_THEME_ID = 'vs-dark'

const monokai = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: '',           foreground: 'F8F8F2', background: '272822' },
    { token: 'comment',    foreground: '75715E', fontStyle: 'italic' },
    { token: 'string',     foreground: 'E6DB74' },
    { token: 'number',     foreground: 'AE81FF' },
    { token: 'keyword',    foreground: 'F92672' },
    { token: 'type',       foreground: '66D9EF', fontStyle: 'italic' },
    { token: 'type.identifier', foreground: '66D9EF', fontStyle: 'italic' },
    { token: 'identifier', foreground: 'F8F8F2' },
    { token: 'function',   foreground: 'A6E22E' },
    { token: 'operator',   foreground: 'F92672' },
    { token: 'delimiter',  foreground: 'F8F8F2' },
  ],
  colors: {
    'editor.background': '#272822',
    'editor.foreground': '#F8F8F2',
    'editorLineNumber.foreground': '#75715E',
    'editorLineNumber.activeForeground': '#F8F8F2',
    'editor.selectionBackground': '#49483E',
    'editor.lineHighlightBackground': '#3E3D32',
    'editorCursor.foreground': '#F8F8F0',
    'editorWhitespace.foreground': '#3B3A32',
    'editorIndentGuide.background': '#3B3A32',
  },
}

const dracula = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: '',           foreground: 'F8F8F2', background: '282A36' },
    { token: 'comment',    foreground: '6272A4', fontStyle: 'italic' },
    { token: 'string',     foreground: 'F1FA8C' },
    { token: 'number',     foreground: 'BD93F9' },
    { token: 'keyword',    foreground: 'FF79C6' },
    { token: 'type',       foreground: '8BE9FD', fontStyle: 'italic' },
    { token: 'type.identifier', foreground: '8BE9FD', fontStyle: 'italic' },
    { token: 'identifier', foreground: 'F8F8F2' },
    { token: 'function',   foreground: '50FA7B' },
    { token: 'operator',   foreground: 'FF79C6' },
    { token: 'delimiter',  foreground: 'F8F8F2' },
  ],
  colors: {
    'editor.background': '#282A36',
    'editor.foreground': '#F8F8F2',
    'editorLineNumber.foreground': '#6272A4',
    'editorLineNumber.activeForeground': '#F8F8F2',
    'editor.selectionBackground': '#44475A',
    'editor.lineHighlightBackground': '#44475A75',
    'editorCursor.foreground': '#F8F8F0',
  },
}

const tokyoNight = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: '',           foreground: 'C0CAF5', background: '1A1B26' },
    { token: 'comment',    foreground: '565F89', fontStyle: 'italic' },
    { token: 'string',     foreground: '9ECE6A' },
    { token: 'number',     foreground: 'FF9E64' },
    { token: 'keyword',    foreground: 'BB9AF7' },
    { token: 'type',       foreground: '2AC3DE' },
    { token: 'type.identifier', foreground: '2AC3DE' },
    { token: 'identifier', foreground: 'C0CAF5' },
    { token: 'function',   foreground: '7AA2F7' },
    { token: 'operator',   foreground: '89DDFF' },
    { token: 'delimiter',  foreground: 'A9B1D6' },
  ],
  colors: {
    'editor.background': '#1A1B26',
    'editor.foreground': '#C0CAF5',
    'editorLineNumber.foreground': '#3B4261',
    'editorLineNumber.activeForeground': '#C0CAF5',
    'editor.selectionBackground': '#33467C',
    'editor.lineHighlightBackground': '#292E42',
    'editorCursor.foreground': '#C0CAF5',
  },
}

const nord = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: '',           foreground: 'D8DEE9', background: '2E3440' },
    { token: 'comment',    foreground: '616E88', fontStyle: 'italic' },
    { token: 'string',     foreground: 'A3BE8C' },
    { token: 'number',     foreground: 'B48EAD' },
    { token: 'keyword',    foreground: '81A1C1' },
    { token: 'type',       foreground: '8FBCBB' },
    { token: 'type.identifier', foreground: '8FBCBB' },
    { token: 'identifier', foreground: 'D8DEE9' },
    { token: 'function',   foreground: '88C0D0' },
    { token: 'operator',   foreground: '81A1C1' },
    { token: 'delimiter',  foreground: 'ECEFF4' },
  ],
  colors: {
    'editor.background': '#2E3440',
    'editor.foreground': '#D8DEE9',
    'editorLineNumber.foreground': '#4C566A',
    'editorLineNumber.activeForeground': '#D8DEE9',
    'editor.selectionBackground': '#434C5E',
    'editor.lineHighlightBackground': '#3B4252',
    'editorCursor.foreground': '#D8DEE9',
  },
}

const oneDark = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: '',           foreground: 'ABB2BF', background: '282C34' },
    { token: 'comment',    foreground: '5C6370', fontStyle: 'italic' },
    { token: 'string',     foreground: '98C379' },
    { token: 'number',     foreground: 'D19A66' },
    { token: 'keyword',    foreground: 'C678DD' },
    { token: 'type',       foreground: 'E5C07B' },
    { token: 'type.identifier', foreground: 'E5C07B' },
    { token: 'identifier', foreground: 'ABB2BF' },
    { token: 'function',   foreground: '61AFEF' },
    { token: 'operator',   foreground: '56B6C2' },
    { token: 'delimiter',  foreground: 'ABB2BF' },
  ],
  colors: {
    'editor.background': '#282C34',
    'editor.foreground': '#ABB2BF',
    'editorLineNumber.foreground': '#495162',
    'editorLineNumber.activeForeground': '#ABB2BF',
    'editor.selectionBackground': '#3E4451',
    'editor.lineHighlightBackground': '#2C313A',
    'editorCursor.foreground': '#528BFF',
  },
}

const solarizedDark = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: '',           foreground: '839496', background: '002B36' },
    { token: 'comment',    foreground: '586E75', fontStyle: 'italic' },
    { token: 'string',     foreground: '2AA198' },
    { token: 'number',     foreground: 'D33682' },
    { token: 'keyword',    foreground: '859900' },
    { token: 'type',       foreground: 'B58900' },
    { token: 'type.identifier', foreground: 'B58900' },
    { token: 'identifier', foreground: '93A1A1' },
    { token: 'function',   foreground: '268BD2' },
    { token: 'operator',   foreground: '859900' },
    { token: 'delimiter',  foreground: '93A1A1' },
  ],
  colors: {
    'editor.background': '#002B36',
    'editor.foreground': '#839496',
    'editorLineNumber.foreground': '#586E75',
    'editorLineNumber.activeForeground': '#93A1A1',
    'editor.selectionBackground': '#073642',
    'editor.lineHighlightBackground': '#073642',
    'editorCursor.foreground': '#93A1A1',
  },
}

const githubLight = {
  base: 'vs',
  inherit: true,
  rules: [
    { token: '',           foreground: '24292F', background: 'FFFFFF' },
    { token: 'comment',    foreground: '6E7781', fontStyle: 'italic' },
    { token: 'string',     foreground: '0A3069' },
    { token: 'number',     foreground: '0550AE' },
    { token: 'keyword',    foreground: 'CF222E' },
    { token: 'type',       foreground: '953800' },
    { token: 'type.identifier', foreground: '953800' },
    { token: 'identifier', foreground: '24292F' },
    { token: 'function',   foreground: '8250DF' },
    { token: 'operator',   foreground: 'CF222E' },
    { token: 'delimiter',  foreground: '24292F' },
  ],
  colors: {
    'editor.background': '#FFFFFF',
    'editor.foreground': '#24292F',
    'editorLineNumber.foreground': '#8C959F',
    'editorLineNumber.activeForeground': '#24292F',
    'editor.selectionBackground': '#B6E3FF',
    'editor.lineHighlightBackground': '#F6F8FA',
    'editorCursor.foreground': '#24292F',
  },
}

const CUSTOM_THEME_SPECS = {
  'algo-monokai': monokai,
  'algo-dracula': dracula,
  'algo-tokyo-night': tokyoNight,
  'algo-nord': nord,
  'algo-one-dark': oneDark,
  'algo-solarized-dark': solarizedDark,
  'algo-github-light': githubLight,
}

// Register every custom theme against the Monaco instance. Idempotent —
// safe to call on every editor mount. Monaco silently overrides prior
// definitions with the same id.
export function registerAlgoThemes(monaco) {
  if (!monaco?.editor?.defineTheme) return
  for (const [id, spec] of Object.entries(CUSTOM_THEME_SPECS)) {
    try { monaco.editor.defineTheme(id, spec) } catch { /* ignore */ }
  }
}
