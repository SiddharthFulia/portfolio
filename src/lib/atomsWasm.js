// atomsWasm.js
// ─────────────────────────────────────────────────────────────────
// Lazy loader + high-level wrappers around the **real** Emscripten
// build of the atom raytracer C++ kernel.
//
// The C++ physics core is compiled to WebAssembly with Emscripten:
//   emcc -O3 -sMODULARIZE=1 -sEXPORT_ES6=1 -sALLOW_MEMORY_GROWTH=1 \
//        -sEXPORTED_FUNCTIONS="['_malloc','_free','_freeBuffer', \
//          '_sampleOrbital','_bindingEnergy','_bohrRadius', \
//          '_bohrEnergy','_alphaDecayQ']" \
//        -sEXPORTED_RUNTIME_METHODS="['ccall','cwrap','HEAPF32','HEAP32']" \
//        -o public/wasm/atoms.js atom_raytracer.cpp nuclear.cpp
//
// The build produces `public/wasm/atoms.js` (ES-module factory
// glue, default export `createAtomsModule`) + `public/wasm/atoms.wasm`
// (the actual binary). Both are served as static assets — no bundler
// touches them, so we side-step Vite's module-graph analysis with a
// `/* @vite-ignore */` dynamic import.
//
// Public JS API — mirrors what the old atomsCore.js exported so the
// UI in Atoms.jsx can call these without reshaping its state:
//
//   sampleOrbital(n, l, m, N)        → Promise<Float32Array(3·N)>
//   semiEmpiricalMass(Z, A)          → Promise<number>  (MeV, total B)
//   alphaDecayQ(Z, A)                → Promise<number>  (MeV, or -1)
//   bohrRadius(Z, n)                 → Promise<number>  (picometres)
//   bohrEnergy(Z, n)                 → Promise<number>  (eV)
//
// Beta-decay Q values + isotope-telemetry helpers stay pure JS —
// they're one-liner arithmetic on top of `semiEmpiricalMass`, no
// point round-tripping through WASM for them.

// ────── Lazy singleton loader ──────
let modulePromise = null
let loadStartMs = null
let loadEndMs = null
let exportCount = null

/**
 * Resolve to the loaded Emscripten `Module` instance. First call
 * pulls the glue + wasm binary over the network + instantiates;
 * every subsequent call returns the same cached promise.
 */
export function loadAtomsWasm() {
  if (modulePromise) return modulePromise
  loadStartMs = performance.now()
  modulePromise = (async () => {
    // The glue file is served from /wasm/ as a plain ES module. We
    // do NOT want Vite to try to bundle it (the glue's own dynamic
    // `atoms.wasm` fetch would break under any URL rewriting), so
    // we use a runtime-only dynamic import with @vite-ignore. The
    // URL is stitched together at runtime so Rollup's static import
    // analysis can't resolve it against the module graph (which
    // would otherwise fail the build since /wasm/atoms.js is a
    // public/ static asset, not a bundled module).
    const url = '/wasm/' + 'atoms.js'
    const factory = await import(/* @vite-ignore */ url)
    const M = await factory.default({
      // Tell Emscripten where to grab the .wasm binary from. Without
      // this it defaults to the current script's directory, which
      // breaks when served from a nested route.
      locateFile: (path) => {
        if (path.endsWith('.wasm')) return '/wasm/atoms.wasm'
        return path
      },
    })
    loadEndMs = performance.now()
    // Count exported functions on the module (underscore-prefixed
    // callables — Emscripten's convention). Used by the UI status
    // card to prove the ABI surface is real.
    try {
      const known = ['_malloc', '_free', '_freeBuffer',
        '_sampleOrbital', '_bindingEnergy', '_bohrRadius',
        '_bohrEnergy', '_alphaDecayQ']
      exportCount = known.filter(k => typeof M[k] === 'function').length
    } catch { exportCount = null }
    return M
  })()
  return modulePromise
}

/** Milliseconds spent loading + instantiating the module. `null` until resolved. */
export function getWasmLoadMs() {
  if (loadStartMs != null && loadEndMs != null) return loadEndMs - loadStartMs
  return null
}

/** Count of `_`-prefixed exports found on the resolved module. `null` until resolved. */
export function getWasmExportCount() {
  return exportCount
}

// ────── Instrumentation bus ──────
// Subscribers receive a `{ name, args, result, ms }` event for every
// WASM call routed through the wrappers below. Used by the Atoms page
// to render a live activity ticker so users can see the engine work.
const _wasmListeners = new Set()
export function subscribeToWasm(fn) {
  _wasmListeners.add(fn)
  return () => _wasmListeners.delete(fn)
}
function _emit(evt) {
  for (const fn of _wasmListeners) {
    try { fn(evt) } catch { /* ignore listener errors */ }
  }
}

// ────── Convenience wrappers (mirror old atomsCore.js API) ──────

/**
 * Monte-Carlo sample the hydrogen-like orbital ψ_nℓm probability
 * density. Returns an interleaved Float32Array of length 3·N,
 * with each triplet being (x, y, z) in units of the Bohr radius.
 *
 * WASM contract:
 *   int sampleOrbital(int n, int l, int m, int nSamples, float* out)
 *   → returns the number of samples actually written.
 *
 * We allocate on the WASM heap, call in, snapshot the view into a
 * fresh Float32Array (so the caller keeps a stable buffer that
 * survives heap growth or a future `_free`), then release the
 * scratch pointer.
 */
export async function sampleOrbital(n, l, m, nSamples) {
  const M = await loadAtomsWasm()
  const bytes = nSamples * 3 * 4  // 3 floats per sample × 4 bytes/float
  const ptr = M._malloc(bytes)
  const t0 = performance.now()
  try {
    const written = M._sampleOrbital(n, l, m, nSamples, ptr)
    const view = new Float32Array(M.HEAPF32.buffer, ptr, written * 3)
    // Copy out — the heap view becomes invalid once we free (or if
    // WASM memory grows underneath us).
    const out = new Float32Array(view)
    _emit({ name: 'sampleOrbital', args: [n, l, m, nSamples], result: written, ms: performance.now() - t0 })
    return out
  } finally {
    // `_freeBuffer` is exported explicitly so the WASM side has the
    // option of a pooled allocator; today it's just a `free()`.
    if (typeof M._freeBuffer === 'function') M._freeBuffer(ptr)
    else M._free(ptr)
  }
}

/** Total binding energy B (MeV) from Bethe-Weizsäcker in WASM. */
export async function semiEmpiricalMass(Z, A) {
  const M = await loadAtomsWasm()
  const t0 = performance.now()
  const v = M._bindingEnergy(Z, A)
  _emit({ name: 'bindingEnergy', args: [Z, A], result: v, ms: performance.now() - t0 })
  return v
}

/** Alpha-decay Q value (MeV) or -1 if energetically forbidden. */
export async function alphaDecayQ(Z, A) {
  const M = await loadAtomsWasm()
  const t0 = performance.now()
  const v = M._alphaDecayQ(Z, A)
  _emit({ name: 'alphaDecayQ', args: [Z, A], result: v, ms: performance.now() - t0 })
  return v
}

/** Bohr orbit radius (returned in picometres by the C++ side). */
export async function bohrRadius(Z, n) {
  const M = await loadAtomsWasm()
  const t0 = performance.now()
  const v = M._bohrRadius(Z, n)
  _emit({ name: 'bohrRadius', args: [Z, n], result: v, ms: performance.now() - t0 })
  return v
}

/** Bohr orbit energy (returned in electron-volts by the C++ side). */
export async function bohrEnergy(Z, n) {
  const M = await loadAtomsWasm()
  const t0 = performance.now()
  const v = M._bohrEnergy(Z, n)
  _emit({ name: 'bohrEnergy', args: [Z, n], result: v, ms: performance.now() - t0 })
  return v
}

// ────── Derived quantities (pure JS on top of the WASM B) ──────
// Cheap arithmetic — no reason to round-trip these through WASM.

const B_He4 = 28.296  // MeV, IAEA AME2020 canonical value

/** β⁻ Q value (MeV). Uses WASM binding energies. */
export async function betaMinusQ(Z, A) {
  const M = await loadAtomsWasm()
  const B0 = M._bindingEnergy(Z, A)
  const Bd = M._bindingEnergy(Z + 1, A)
  return Bd - B0 - 0.782
}

/** β⁺ Q value (MeV). */
export async function betaPlusQ(Z, A) {
  if (Z <= 1) return -1
  const M = await loadAtomsWasm()
  const B0 = M._bindingEnergy(Z, A)
  const Bd = M._bindingEnergy(Z - 1, A)
  return Bd - B0 - 1.022
}

/** Neutron / proton ratio. */
export function nOverZ(Z, A) {
  return (A - Z) / Math.max(1, Z)
}

/**
 * Rough stability class for the UI badge. Reads Q values from WASM
 * and picks the dominant decay branch by the same heuristic the JS
 * port used — the underlying numbers are now C++, but the branch
 * logic is presentation and stays here.
 */
export async function stabilityClass(Z, A) {
  if (Z === 1 && A === 1) return 'stable'
  const stableNZ = Z < 20 ? 1.0 : 1.0 + 0.015 * (Z - 20)
  const ratio = nOverZ(Z, A)
  const qA = await alphaDecayQ(Z, A)
  const alphaFavourable = Z >= 84 && qA > 4
  if (alphaFavourable) return 'alpha'
  if (Z >= 90 && A >= 232) return 'sf-possible'
  if (ratio > stableNZ + 0.15) return 'beta-minus'
  if (ratio < stableNZ - 0.15) return 'beta-plus'
  return 'stable'
}

/**
 * Full telemetry bundle used by the UI panel. All the heavy math is
 * one round-trip to WASM per field; the UI treats the result as a
 * plain object so it can flow straight into the antd rows.
 */
export async function isotopeTelemetry(Z, A) {
  const M = await loadAtomsWasm()
  const B      = M._bindingEnergy(Z, A)
  const Qalpha = M._alphaDecayQ(Z, A)
  const Bp1    = M._bindingEnergy(Z + 1, A)
  const Bm1    = Z > 1 ? M._bindingEnergy(Z - 1, A) : 0
  const Qbeta  = Bp1 - B - 0.782
  const Qpos   = Z > 1 ? (Bm1 - B - 1.022) : -1
  // δ pairing — not exported directly; reconstruct from B via a quick
  // model call. The C++ side offers `_pairingDelta(Z, A)` if desired;
  // if not present we compute from SEMF coefficients locally.
  const N = A - Z
  const evenZ = (Z % 2 === 0), evenN = (N % 2 === 0)
  const aP = 11.18
  let delta = 0
  if (evenZ && evenN) delta = aP / Math.sqrt(A)
  else if (!evenZ && !evenN) delta = -aP / Math.sqrt(A)

  return {
    Z, A, N,
    B, BperA: B / A, delta,
    NoverZ: nOverZ(Z, A),
    Qalpha, Qbeta, Qpos,
    stability: await stabilityClass(Z, A),
  }
}

// ────── Diagnostic: WASM binary size (for the header badge) ──────
// Cached HEAD request against /wasm/atoms.wasm. Best-effort — if
// the request fails we return null and the badge just hides itself.
let sizePromise = null
export function getWasmBinarySize() {
  if (sizePromise) return sizePromise
  sizePromise = (async () => {
    try {
      const r = await fetch('/wasm/atoms.wasm', { method: 'HEAD' })
      if (!r.ok) return null
      const len = r.headers.get('content-length')
      return len ? Number(len) : null
    } catch {
      return null
    }
  })()
  return sizePromise
}
