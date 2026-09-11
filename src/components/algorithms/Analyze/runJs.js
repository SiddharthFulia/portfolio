// runJs — trace a JavaScript program one AST-node at a time using
// Neil Fraser's js-interpreter, a pure-JS ES5 interpreter. Because it
// evaluates instruction-by-instruction, we can capture per-step
// variable snapshots without needing WASM or a backend.
//
// Loaded from CDN on demand so the Analyze tab never bloats the main
// bundle. Compatibility note: js-interpreter is ES5 only — no arrow
// functions, no `let/const`, no template literals, no async/await, no
// classes, no destructuring. The Analyze tab documents this and shows a
// friendly error if the user's JS uses ES6+ features.
//
// Public API:
//   ensureJsInterpreter()        — resolve when the runtime is available
//   traceJs(code, { maxSteps })  — returns { frames, error, output }

// The main-branch build was renamed a few times. This URL points at the
// canonical UMD bundle on jsDelivr with a pinned commit for stability.
const JS_INTERP_URL = 'https://cdn.jsdelivr.net/gh/NeilFraser/JS-Interpreter@2be3d3bb/interpreter.js'
const JS_ACORN_URL  = 'https://cdn.jsdelivr.net/gh/NeilFraser/JS-Interpreter@2be3d3bb/acorn.js'

let scriptPromise = null

function injectScript(src, marker) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-jsinterp="${marker}"]`)
    if (existing) {
      if (window.Interpreter) return resolve()
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error(`Failed to load ${marker}`)))
      return
    }
    const s = document.createElement('script')
    s.src = src
    s.async = false // Preserve order: acorn must load before interpreter
    s.dataset.jsinterp = marker
    s.onload = () => resolve()
    s.onerror = () => reject(new Error(`Failed to load ${marker}`))
    document.head.appendChild(s)
  })
}

export async function ensureJsInterpreter() {
  if (typeof window === 'undefined') {
    throw new Error('js-interpreter requires a browser environment')
  }
  if (window.Interpreter) return window.Interpreter
  if (!scriptPromise) {
    scriptPromise = (async () => {
      // acorn is bundled inside the interpreter's minified build, but
      // the CDN source split keeps them separate. Load acorn first.
      await injectScript(JS_ACORN_URL, 'acorn')
      await injectScript(JS_INTERP_URL, 'interpreter')
    })()
  }
  await scriptPromise
  if (!window.Interpreter) throw new Error('Interpreter global missing after load')
  return window.Interpreter
}

// Pretty-print a value pulled out of an interpreter scope. The
// interpreter wraps primitives + objects in its own "pseudo" objects;
// we peel one layer for the common cases so users see `42` and `"hi"`
// instead of `[object Object]`.
function prettyValue(interp, v) {
  try {
    if (v === undefined) return 'undefined'
    if (v === null) return 'null'
    // Primitives (interp.PSEUDO_PRIMITIVE_TYPES) come back raw.
    if (typeof v !== 'object') {
      const s = typeof v === 'string' ? `"${v}"` : String(v)
      return s.length > 100 ? s.slice(0, 97) + '...' : s
    }
    // Interpreter's pseudo-objects have .properties (dict) + .class.
    if (v.class === 'Array' && v.properties) {
      const keys = Object.keys(v.properties).filter(k => /^\d+$/.test(k))
        .sort((a, b) => Number(a) - Number(b))
      const items = keys.slice(0, 20).map(k => prettyValue(interp, v.properties[k]))
      const suffix = keys.length > 20 ? ', ...' : ''
      const s = `[${items.join(', ')}${suffix}]`
      return s.length > 100 ? s.slice(0, 97) + '...' : s
    }
    if (v.class === 'Function') return '<function>'
    if (v.properties) {
      const keys = Object.keys(v.properties).slice(0, 12)
      const items = keys.map(k => `${k}: ${prettyValue(interp, v.properties[k])}`)
      const s = `{${items.join(', ')}}`
      return s.length > 100 ? s.slice(0, 97) + '...' : s
    }
    const s = String(v)
    return s.length > 100 ? s.slice(0, 97) + '...' : s
  } catch {
    return '<?>'
  }
}

// Walk the current scope chain and pull every locally-declared name.
// Interpreter scopes are objects with a .properties dict + .parentScope.
// We only look at the innermost scope, since deeper globals are noisy.
function extractLocals(interp, scope) {
  if (!scope || !scope.object || !scope.object.properties) return {}
  const out = {}
  const props = scope.object.properties
  let count = 0
  for (const key of Object.keys(props)) {
    if (count >= 64) break
    // Skip interpreter internals + built-in globals.
    if (key.startsWith('__') || /^(Math|Object|Array|String|Number|Boolean|JSON|console|Infinity|NaN|undefined)$/.test(key)) continue
    out[key] = prettyValue(interp, props[key])
    count += 1
  }
  return out
}

// Extract the current source line from the top of the state stack. The
// interpreter attaches acorn `loc` info to each AST node when we pass
// `{ locations: true }` at parse time (js-interpreter does this
// internally when acorn is on window).
function currentLine(interp) {
  const stack = interp.stateStack
  if (!stack || !stack.length) return 0
  // Walk from top → bottom looking for a node with loc info.
  for (let i = stack.length - 1; i >= 0; i--) {
    const node = stack[i]?.node
    if (node?.loc?.start?.line) return node.loc.start.line
  }
  return 0
}

function currentScope(interp) {
  const stack = interp.stateStack
  if (!stack || !stack.length) return null
  for (let i = stack.length - 1; i >= 0; i--) {
    const s = stack[i]?.scope
    if (s) return s
  }
  return interp.globalScope || null
}

// Trace a JS program. We wrap console.log so its output is captured
// alongside the trace frames.
export async function traceJs(userCode, { maxSteps = 5000 } = {}) {
  const Interpreter = await ensureJsInterpreter()
  const output = []
  const frames = []

  const initApi = (interp, globalObject) => {
    const logWrap = (...args) => {
      output.push(args.map(a => {
        // Args come in already-unwrapped from interpreter.
        if (typeof a === 'string') return a
        try { return JSON.stringify(a) } catch { return String(a) }
      }).join(' '))
    }
    interp.setProperty(globalObject, 'console', interp.nativeToPseudo({ log: logWrap, error: logWrap, warn: logWrap }))
  }

  let interp
  try {
    interp = new Interpreter(userCode, initApi)
  } catch (err) {
    return {
      frames: [],
      output: '',
      capped: false,
      error: `Parse error: ${err?.message || String(err)}. Note: js-interpreter is ES5 only — no let/const/arrows/classes/templates.`,
    }
  }

  let capped = false
  let lastLine = 0
  try {
    let stepped = interp.step()
    while (stepped) {
      const line = currentLine(interp)
      // Only push a frame when the line advances — otherwise we'd
      // record one frame per AST node (dozens per statement) and blow
      // through the 5000 cap in milliseconds.
      if (line && line !== lastLine) {
        const scope = currentScope(interp)
        frames.push({
          line,
          event: 'line',
          locals: extractLocals(interp, scope),
        })
        lastLine = line
        if (frames.length >= maxSteps) { capped = true; break }
      }
      stepped = interp.step()
    }
  } catch (err) {
    frames.push({
      line: lastLine,
      event: 'exception',
      locals: {},
      exception: err?.message || String(err),
    })
  }

  return {
    frames,
    output: output.join('\n'),
    capped,
    error: null,
  }
}
