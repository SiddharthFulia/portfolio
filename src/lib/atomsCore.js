// atomsCore.js
// ─────────────────────────────────────────────────────────────────
// Direct JS port of the C++ atom raytracer core from
// github.com/kavan010/Atoms  (E:/Github/Atoms/src/atom_raytracer.cpp).
//
// The C++ project targets desktop OpenGL via glew + glfw3, which does
// NOT compile to WebAssembly without a heavy Emscripten toolchain and
// custom framebuffer bridge. Emscripten (emcc) is not installed on
// this machine (checked: `emcc --version` → command not found), so we
// port the physics kernel — CDF-sampled hydrogen-like orbitals via
// associated Laguerre × associated Legendre polynomials — verbatim
// into JS. The public API surface here is intentionally a mirror of
// what the WASM export would have looked like:
//
//     sampleOrbital({ n, l, m, N }) → Float32Array(3·N)
//     bindingEnergyPerNucleon(Z, A) → MeV
//     semiEmpiricalMass(Z, A)      → { B, BperA, delta }
//     alphaDecayQ(Z, A)            → MeV
//     bohrRadius(n, Z)             → metres
//     bohrEnergy(n, Z)             → eV
//
// Everything here is physically real, referenced against
// canonical values (NIST, IAEA, and the semi-empirical mass formula
// parameters from Bethe-Weizsäcker 1935 / Rohlf 1994).

// ────── Physical constants (SI, unless stated) ──────
export const CONSTS = {
  a0:   5.29177210903e-11,   // Bohr radius, m
  ke:   8.9875517873681764e9, // Coulomb constant, N·m²/C²
  eV:   1.602176634e-19,     // 1 eV in joules
  hbar: 1.054571817e-34,     // reduced Planck, J·s
  me:   9.1093837015e-31,    // electron mass, kg
  c:    299_792_458,         // speed of light, m/s
  Ry:   13.605693122994,     // Rydberg energy for H, eV
  MeV:  1.602176634e-13,     // 1 MeV in joules
  amu:  931.49410242,        // 1 u in MeV/c²
}

// ────── Bohr atom (closed forms) ──────
// r_n = n²·a₀ / Z   (SI metres)
export function bohrRadius(n, Z = 1) {
  return (n * n * CONSTS.a0) / Z
}
// E_n = -Ry · Z² / n²  (electron-volts, negative = bound)
export function bohrEnergy(n, Z = 1) {
  return -(CONSTS.Ry * Z * Z) / (n * n)
}

// ────── Associated Laguerre L_k^α(x) — recurrence identical to C++ ──────
// L_0^α(x) = 1
// L_1^α(x) = 1 + α − x
// (j+1) L_{j+1}^α = (2j+1+α−x) L_j^α − (j+α) L_{j−1}^α
function laguerreAssoc(k, alpha, x) {
  if (k === 0) return 1
  let Lm2 = 1
  let Lm1 = 1 + alpha - x
  if (k === 1) return Lm1
  let L = 0
  for (let j = 2; j <= k; j++) {
    L = ((2*j - 1 + alpha - x) * Lm1 - (j - 1 + alpha) * Lm2) / j
    Lm2 = Lm1
    Lm1 = L
  }
  return L
}

// ────── Associated Legendre P_l^m(x)  (unnormalised, real m ≥ 0) ──────
// From Numerical Recipes §6.7 — identical structure to the C++ sampler.
function legendreAssoc(l, m, x) {
  const absM = Math.abs(m)
  let Pmm = 1
  if (absM > 0) {
    const somx2 = Math.sqrt((1 - x) * (1 + x))
    let fact = 1
    for (let j = 1; j <= absM; j++) {
      Pmm *= -fact * somx2
      fact += 2
    }
  }
  if (l === absM) return Pmm
  let Pm1m = x * (2 * absM + 1) * Pmm
  if (l === absM + 1) return Pm1m
  let Pll = 0
  for (let ll = absM + 2; ll <= l; ll++) {
    Pll = ((2 * ll - 1) * x * Pm1m - (ll + absM - 1) * Pmm) / (ll - absM)
    Pmm = Pm1m
    Pm1m = Pll
  }
  return Pll
}

// ────── CDF cache — per (n,l) for R, per (l,m) for Θ ──────
// Built lazily; keyed by string. Same trick the C++ code uses with a
// `static bool built` guard.
const rCdfCache   = new Map()
const thCdfCache  = new Map()

function buildRcdf(n, l) {
  const N = 4096
  const rMax = 10 * n * n            // in units of a₀
  const cdf = new Float64Array(N)
  const dr  = rMax / (N - 1)
  let sum   = 0
  const k     = n - l - 1
  const alpha = 2 * l + 1
  for (let i = 0; i < N; i++) {
    const r   = i * dr
    const rho = (2 * r) / n
    const L   = laguerreAssoc(k, alpha, rho)
    // R(r) ∝ e^(−ρ/2) · ρ^l · L    (norm constant drops out of the pdf ratio)
    const R   = Math.exp(-rho / 2) * Math.pow(rho, l) * L
    // radial pdf ∝ r² |R|²
    const pdf = r * r * R * R
    sum += pdf
    cdf[i] = sum
  }
  if (sum > 0) for (let i = 0; i < N; i++) cdf[i] /= sum
  return { cdf, dr, rMax }
}

function buildThCdf(l, m) {
  const N = 2048
  const cdf = new Float64Array(N)
  const dth = Math.PI / (N - 1)
  let sum = 0
  for (let i = 0; i < N; i++) {
    const theta = i * dth
    const x     = Math.cos(theta)
    const P     = legendreAssoc(l, m, x)
    // pdf ∝ sinθ · |P_l^m(cosθ)|²
    const pdf   = Math.sin(theta) * P * P
    sum += pdf
    cdf[i] = sum
  }
  if (sum > 0) for (let i = 0; i < N; i++) cdf[i] /= sum
  return { cdf, dth }
}

// Binary search into the CDF, return interpolated index.
function invCdf(cdf, u) {
  let lo = 0, hi = cdf.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (cdf[mid] < u) lo = mid + 1
    else hi = mid
  }
  return lo
}

// ────── Public sampler ──────
// Returns a Float32Array of length 3·N with interleaved xyz in units of
// a₀. The caller scales into pixels. Uses the C++ scheme exactly:
//   r  ~ inv-CDF over r²|R_{nl}(r)|²
//   θ  ~ inv-CDF over sinθ|P_l^m(cosθ)|²
//   φ  ~ uniform [0, 2π)
export function sampleOrbital({ n, l, m, N = 40000 }) {
  n = Math.max(1, Math.min(7, n|0))
  l = Math.max(0, Math.min(n - 1, l|0))
  m = Math.max(-l, Math.min(l, m|0))

  const rKey  = `${n}|${l}`
  const thKey = `${l}|${Math.abs(m)}`
  if (!rCdfCache.has(rKey))   rCdfCache.set(rKey, buildRcdf(n, l))
  if (!thCdfCache.has(thKey)) thCdfCache.set(thKey, buildThCdf(l, Math.abs(m)))
  const { cdf: rCdf, dr } = rCdfCache.get(rKey)
  const { cdf: thCdf, dth } = thCdfCache.get(thKey)

  const out = new Float32Array(3 * N)
  for (let i = 0; i < N; i++) {
    const ri = invCdf(rCdf, Math.random())
    const r  = ri * dr
    const ti = invCdf(thCdf, Math.random())
    const th = ti * dth
    const ph = 2 * Math.PI * Math.random()
    const sinT = Math.sin(th)
    out[3*i    ] = r * sinT * Math.cos(ph)
    out[3*i + 1] = r * sinT * Math.sin(ph)
    out[3*i + 2] = r * Math.cos(th)
  }
  return out
}

// ────── Semi-empirical mass formula (Bethe-Weizsäcker) ──────
// Coefficients (MeV) — the "Rohlf 1994" set widely used in intro texts.
export const SEMF = {
  aV: 15.75,   // volume
  aS: 17.80,   // surface
  aC: 0.711,   // Coulomb
  aA: 23.7,    // asymmetry
  aP: 11.18,   // pairing
}

// Total binding energy B (MeV), Bethe-Weizsäcker.
// δ = +aP/√A   even-even
//   = -aP/√A   odd-odd
//   =  0       odd A
export function semiEmpiricalMass(Z, A) {
  Z = Math.max(1, Z|0); A = Math.max(1, A|0)
  const N = A - Z
  const A13 = Math.cbrt(A)
  const A23 = A13 * A13
  const vol = SEMF.aV * A
  const sur = SEMF.aS * A23
  const cou = SEMF.aC * Z * (Z - 1) / A13
  const asy = SEMF.aA * (A - 2*Z) ** 2 / A
  const evenZ = (Z % 2 === 0), evenN = (N % 2 === 0)
  let delta = 0
  if (evenZ && evenN)      delta =  SEMF.aP / Math.sqrt(A)
  else if (!evenZ && !evenN) delta = -SEMF.aP / Math.sqrt(A)
  const B = vol - sur - cou - asy + delta
  return { B, BperA: B / A, vol, sur, cou, asy, delta }
}
export function bindingEnergyPerNucleon(Z, A) {
  return semiEmpiricalMass(Z, A).BperA
}

// Q-value for alpha decay: Qα = B(A-4, Z-2) + B(⁴He) − B(A, Z)
// B(⁴He) = 28.296 MeV (canonical, IAEA AME2020)
const B_He4 = 28.296
export function alphaDecayQ(Z, A) {
  if (Z <= 2 || A <= 4) return -1
  const B0 = semiEmpiricalMass(Z, A).B
  const Bd = semiEmpiricalMass(Z - 2, A - 4).B
  return Bd + B_He4 - B0
}

// Q-value for β⁻ decay: (Z, A) → (Z+1, A) + e⁻ + ν̄
// Q ≈ B(Z+1, A) − B(Z, A) − 0.782 MeV (n→p+e-+ν̄ mass difference)
export function betaMinusQ(Z, A) {
  const B0 = semiEmpiricalMass(Z, A).B
  const Bd = semiEmpiricalMass(Z + 1, A).B
  return Bd - B0 - 0.782
}
// Q for β⁺ decay: needs > 1.022 MeV surplus (2 mₑc²)
export function betaPlusQ(Z, A) {
  if (Z <= 1) return -1
  const B0 = semiEmpiricalMass(Z, A).B
  const Bd = semiEmpiricalMass(Z - 1, A).B
  return Bd - B0 - 1.022
}

// Neutron : proton ratio.
export function nOverZ(Z, A) {
  return (A - Z) / Math.max(1, Z)
}

// Very-rough stability class from Q-values + N/Z + line-of-stability heuristic.
// Not a substitute for the AME2020 table, but useful for the UI badge.
export function stabilityClass(Z, A) {
  if (Z === 1 && A === 1) return 'stable'
  const stableNZ = Z < 20 ? 1.0 : 1.0 + 0.015 * (Z - 20)
  const ratio = nOverZ(Z, A)
  const alphaFavourable = Z >= 84 && alphaDecayQ(Z, A) > 4
  if (alphaFavourable) return 'alpha'
  if (Z >= 90 && A >= 232) return 'sf-possible'
  if (ratio > stableNZ + 0.15) return 'beta-minus'
  if (ratio < stableNZ - 0.15) return 'beta-plus'
  return 'stable'
}

// Convenience: full telemetry bundle used by the UI panel.
export function isotopeTelemetry(Z, A) {
  const semf = semiEmpiricalMass(Z, A)
  return {
    Z, A, N: A - Z,
    B: semf.B, BperA: semf.BperA, delta: semf.delta,
    NoverZ: nOverZ(Z, A),
    Qalpha: alphaDecayQ(Z, A),
    Qbeta:  betaMinusQ(Z, A),
    Qpos:   betaPlusQ(Z, A),
    stability: stabilityClass(Z, A),
  }
}
