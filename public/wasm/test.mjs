// Smoke test for atoms.wasm — run with: node public/wasm/test.mjs
// Verifies the five exported physics functions against canonical values.

import createAtomsModule from './atoms.js'

const M = await createAtomsModule()

function check(label, actual, expected, tolPct = 1.0) {
  const err = Math.abs((actual - expected) / expected) * 100
  const ok  = err <= tolPct
  const tag = ok ? 'PASS' : 'FAIL'
  console.log(`[${tag}] ${label}: ${actual.toFixed(4)}  (expected ${expected}, Δ ${err.toFixed(3)}%)`)
  return ok
}

let pass = 0, total = 0
const t = (label, actual, expected, tolPct) => { total++; if (check(label, actual, expected, tolPct)) pass++ }

// ── Bohr atom ──
t('bohrEnergy(1, 1) — hydrogen ground state, eV',
  M._bohrEnergy(1, 1), -13.6057, 0.1)
t('bohrEnergy(1, 2) — hydrogen n=2, eV',
  M._bohrEnergy(1, 2), -3.4014, 0.1)
t('bohrEnergy(2, 1) — He⁺ ground state, eV',
  M._bohrEnergy(2, 1), -54.4228, 0.1)
t('bohrRadius(1, 1) — Bohr radius, pm',
  M._bohrRadius(1, 1), 52.9177, 0.1)
t('bohrRadius(1, 2) — hydrogen n=2 shell, pm',
  M._bohrRadius(1, 2), 211.671, 0.1)

// ── Semi-empirical binding energy ──
// Iron-56, canonical B ≈ 492.25 MeV (IAEA)
t('bindingEnergy(26, 56) — ⁵⁶Fe, MeV',
  M._bindingEnergy(26, 56), 492.0, 2.0)
// Uranium-238, B ≈ 1801.7 MeV
t('bindingEnergy(92, 238) — ²³⁸U, MeV',
  M._bindingEnergy(92, 238), 1801.0, 2.0)
// Helium-4, ~28.3 MeV — SEMF famously breaks down for A<12, ~20% error is
// expected here (surface term overweights small nuclei). Reporting as INFO.
console.log(`[INFO] bindingEnergy(2, 4)   = ${M._bindingEnergy(2, 4).toFixed(2)} MeV`
  + `  (canonical 28.3; SEMF known to over-penalise A<12)`)

// ── Alpha decay Q ──
// U-238 → Th-234 + α, Q ≈ 4.27 MeV
t('alphaDecayQ(92, 238) — ²³⁸U α decay, MeV',
  M._alphaDecayQ(92, 238), 4.27, 30.0) // SEMF gives approximate values
// Impossible for light nuclei
console.log(`[INFO] alphaDecayQ(2, 4)  = ${M._alphaDecayQ(2, 4)}  (should be -1)`)
console.log(`[INFO] alphaDecayQ(1, 1)  = ${M._alphaDecayQ(1, 1)}  (should be -1)`)

// ── Orbital sampler ──
const N = 5000
const bytes = N * 3 * 4
const ptr = M._malloc(bytes)
const written = M._sampleOrbital(2, 1, 0, N, ptr)  // 2p_z orbital
const samples = new Float32Array(M.HEAPF32.buffer, ptr, N * 3)
let meanR = 0, minR = Infinity, maxR = 0
for (let i = 0; i < N; i++) {
  const x = samples[3*i], y = samples[3*i+1], z = samples[3*i+2]
  const r = Math.sqrt(x*x + y*y + z*z)
  meanR += r
  if (r < minR) minR = r
  if (r > maxR) maxR = r
}
meanR /= N
M._freeBuffer(ptr)
console.log(`[INFO] sampleOrbital(2,1,0,${N}): mean r = ${meanR.toFixed(2)} a₀,  min=${minR.toFixed(3)},  max=${maxR.toFixed(2)}`)
console.log(`       (expected <r> ≈ 5 a₀ for 2p; check finite + non-degenerate cloud)`)

console.log(`\n── ${pass}/${total} physics assertions pass ──`)
process.exit(pass === total ? 0 : 1)
