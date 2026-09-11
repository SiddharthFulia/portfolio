// runPython — lazy-loads Pyodide (CPython in WASM) from a CDN, then runs
// the user's Python with sys.settrace() attached so we can capture every
// executed line + its local variable snapshot. The tracer emits a
// JSON-serialisable list of frames which the Analyze tab plays through.
//
// Why CDN and not `npm install pyodide`?
//   Pyodide is ~6MB compressed. Bundling it into the main graph balloons
//   the app's initial download. CDN + `<script>` injection keeps it
//   entirely out of the vite build — the module only downloads the first
//   time the user hits the Analyze tab on a Python topic.
//
// Public API:
//   ensurePyodide()              — resolves once the runtime is ready
//   tracePython(code, { maxSteps }) — returns { frames, error, output }
//
// Trace step shape (mirrors src/components/algorithms/Analyze/index.jsx):
//   { line: number, event: 'line'|'call'|'return'|'exception',
//     locals: Record<string,string>, return?: string, exception?: string }

const PYODIDE_VERSION = 'v0.24.1'
const PYODIDE_URL = `https://cdn.jsdelivr.net/pyodide/${PYODIDE_VERSION}/full/pyodide.js`
const INDEX_URL = `https://cdn.jsdelivr.net/pyodide/${PYODIDE_VERSION}/full/`

// Single-flight loader promise — every caller awaits the same runtime.
let pyodidePromise = null
let scriptPromise = null

function injectScript(src) {
  return new Promise((resolve, reject) => {
    // If it's already on the page, reuse it.
    const existing = document.querySelector(`script[data-pyodide="${PYODIDE_VERSION}"]`)
    if (existing) {
      if (window.loadPyodide) return resolve()
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('Pyodide script failed to load')))
      return
    }
    const s = document.createElement('script')
    s.src = src
    s.async = true
    s.dataset.pyodide = PYODIDE_VERSION
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Pyodide script failed to load'))
    document.head.appendChild(s)
  })
}

export async function ensurePyodide() {
  if (pyodidePromise) return pyodidePromise
  if (typeof window === 'undefined') {
    throw new Error('Pyodide requires a browser environment')
  }
  if (!scriptPromise) scriptPromise = injectScript(PYODIDE_URL)
  await scriptPromise
  if (!window.loadPyodide) {
    throw new Error('Pyodide loader not available after script injection')
  }
  pyodidePromise = window.loadPyodide({ indexURL: INDEX_URL })
  return pyodidePromise
}

// The tracer script we prepend to the user's code. It records every 'line'
// event with a shallow repr'd snapshot of the current frame's locals, plus
// call/return/exception events so the transport bar can label them
// meaningfully. Frames are capped to prevent infinite-loop OOM.
function buildTracerScript(userCode, maxSteps) {
  // Indent user code by 4 spaces so we can wrap it in a try / trace block.
  const indented = userCode.split('\n').map(l => '    ' + l).join('\n')
  return `import sys, json, io, traceback

__frames = []
__step_cap = ${maxSteps}
__stdout_capture = io.StringIO()
__real_stdout = sys.stdout

def __safe_repr(v):
    try:
        r = repr(v)
    except Exception:
        try:
            r = f"<unrepr-able {type(v).__name__}>"
        except Exception:
            r = "<?>"
    if len(r) > 100:
        r = r[:97] + "..."
    return r

def __snapshot(frame):
    out = {}
    for k, v in list(frame.f_locals.items())[:64]:  # cap keys
        if k.startswith("__") and k.endswith("__"):
            continue  # skip dunder internals
        out[k] = __safe_repr(v)
    return out

def __tracer(frame, event, arg):
    # Only trace inside the __user_script module (skip stdlib / __main__).
    fname = frame.f_code.co_filename
    if fname != "<user>":
        return __tracer if event == "call" else None
    if len(__frames) >= __step_cap:
        return None  # short-circuit: bail out of tracing
    if event in ("line", "call", "return", "exception"):
        step = {
            "line": frame.f_lineno,
            "event": event,
            "locals": __snapshot(frame),
        }
        if event == "return":
            step["return"] = __safe_repr(arg)
        elif event == "exception":
            step["exception"] = __safe_repr(arg[1]) if isinstance(arg, tuple) and len(arg) >= 2 else "?"
        __frames.append(step)
    return __tracer

# Compile the user script under a fixed filename so we can filter events.
__source = ${JSON.stringify(userCode)}
__code_obj = compile(__source, "<user>", "exec")

sys.stdout = __stdout_capture
try:
    sys.settrace(__tracer)
    exec(__code_obj, {"__name__": "__main__"})
except Exception as _e:
    __frames.append({
        "line": getattr(_e, "__traceback__", None).tb_lineno if getattr(_e, "__traceback__", None) else 0,
        "event": "exception",
        "locals": {},
        "exception": __safe_repr(_e),
    })
finally:
    sys.settrace(None)
    sys.stdout = __real_stdout

__result = {
    "frames": __frames,
    "output": __stdout_capture.getvalue(),
    "capped": len(__frames) >= __step_cap,
}
json.dumps(__result)
`
}

export async function tracePython(userCode, { maxSteps = 5000 } = {}) {
  const py = await ensurePyodide()
  const src = buildTracerScript(userCode, maxSteps)
  try {
    const jsonStr = await py.runPythonAsync(src)
    const parsed = JSON.parse(jsonStr)
    return {
      frames: parsed.frames || [],
      output: parsed.output || '',
      capped: !!parsed.capped,
      error: null,
    }
  } catch (err) {
    return {
      frames: [],
      output: '',
      capped: false,
      error: err?.message || String(err),
    }
  }
}
