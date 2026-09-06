// atomsData.js
// Canonical periodic table (H..Cf, Z=1..98) plus a small isotope table
// covering everything the simulator touches (decay chains, fission
// products, the "click radiation" panel). Values are sourced from:
//  - NIST Atomic Weights & Isotopic Compositions (2021)
//  - IAEA Nuclear Data Section, LiveChart of Nuclides
//  - "Nuclides & Isotopes: Chart of the Nuclides" (17th ed., 2010)
//
// Fields
//   Z         atomic number (protons)
//   symbol    IUPAC symbol
//   name      IUPAC name
//   Astable   mass number of the most abundant stable / long-lived isotope
//   category  colouring bucket for the periodic table UI
//   shells    ground-state electron shell config, [1,2,8,...]
//   period, group  standard placement (1-indexed) — for the 18-column grid
//   decay     'stable' | 'α' | 'β⁻' | 'β⁺' | 'ε' | 'SF' | 'unstable'

const el = (Z, symbol, name, Astable, category, shells, period, group, decay = 'stable') =>
  ({ Z, symbol, name, Astable, category, shells, period, group, decay })

// Groups:  1..18 with lanthanides/actinides on the standard f-block strip.
// Lanthanides: group 3+ / row 8   Actinides: group 3+ / row 9
export const ELEMENTS = [
  el(1,  'H',  'Hydrogen',      1,   'nonmetal',     [1],                    1,  1),
  el(2,  'He', 'Helium',        4,   'noble',        [2],                    1, 18),
  el(3,  'Li', 'Lithium',       7,   'alkali',       [2,1],                  2,  1),
  el(4,  'Be', 'Beryllium',     9,   'alkaline',     [2,2],                  2,  2),
  el(5,  'B',  'Boron',         11,  'metalloid',    [2,3],                  2, 13),
  el(6,  'C',  'Carbon',        12,  'nonmetal',     [2,4],                  2, 14),
  el(7,  'N',  'Nitrogen',      14,  'nonmetal',     [2,5],                  2, 15),
  el(8,  'O',  'Oxygen',        16,  'nonmetal',     [2,6],                  2, 16),
  el(9,  'F',  'Fluorine',      19,  'halogen',      [2,7],                  2, 17),
  el(10, 'Ne', 'Neon',          20,  'noble',        [2,8],                  2, 18),
  el(11, 'Na', 'Sodium',        23,  'alkali',       [2,8,1],                3,  1),
  el(12, 'Mg', 'Magnesium',     24,  'alkaline',     [2,8,2],                3,  2),
  el(13, 'Al', 'Aluminium',     27,  'poor-metal',   [2,8,3],                3, 13),
  el(14, 'Si', 'Silicon',       28,  'metalloid',    [2,8,4],                3, 14),
  el(15, 'P',  'Phosphorus',    31,  'nonmetal',     [2,8,5],                3, 15),
  el(16, 'S',  'Sulfur',        32,  'nonmetal',     [2,8,6],                3, 16),
  el(17, 'Cl', 'Chlorine',      35,  'halogen',      [2,8,7],                3, 17),
  el(18, 'Ar', 'Argon',         40,  'noble',        [2,8,8],                3, 18),
  el(19, 'K',  'Potassium',     39,  'alkali',       [2,8,8,1],              4,  1),
  el(20, 'Ca', 'Calcium',       40,  'alkaline',     [2,8,8,2],              4,  2),
  el(21, 'Sc', 'Scandium',      45,  'transition',   [2,8,9,2],              4,  3),
  el(22, 'Ti', 'Titanium',      48,  'transition',   [2,8,10,2],             4,  4),
  el(23, 'V',  'Vanadium',      51,  'transition',   [2,8,11,2],             4,  5),
  el(24, 'Cr', 'Chromium',      52,  'transition',   [2,8,13,1],             4,  6),
  el(25, 'Mn', 'Manganese',     55,  'transition',   [2,8,13,2],             4,  7),
  el(26, 'Fe', 'Iron',          56,  'transition',   [2,8,14,2],             4,  8),
  el(27, 'Co', 'Cobalt',        59,  'transition',   [2,8,15,2],             4,  9),
  el(28, 'Ni', 'Nickel',        58,  'transition',   [2,8,16,2],             4, 10),
  el(29, 'Cu', 'Copper',        63,  'transition',   [2,8,18,1],             4, 11),
  el(30, 'Zn', 'Zinc',          64,  'transition',   [2,8,18,2],             4, 12),
  el(31, 'Ga', 'Gallium',       69,  'poor-metal',   [2,8,18,3],             4, 13),
  el(32, 'Ge', 'Germanium',     74,  'metalloid',    [2,8,18,4],             4, 14),
  el(33, 'As', 'Arsenic',       75,  'metalloid',    [2,8,18,5],             4, 15),
  el(34, 'Se', 'Selenium',      80,  'nonmetal',     [2,8,18,6],             4, 16),
  el(35, 'Br', 'Bromine',       79,  'halogen',      [2,8,18,7],             4, 17),
  el(36, 'Kr', 'Krypton',       84,  'noble',        [2,8,18,8],             4, 18),
  el(37, 'Rb', 'Rubidium',      85,  'alkali',       [2,8,18,8,1],           5,  1),
  el(38, 'Sr', 'Strontium',     88,  'alkaline',     [2,8,18,8,2],           5,  2),
  el(39, 'Y',  'Yttrium',       89,  'transition',   [2,8,18,9,2],           5,  3),
  el(40, 'Zr', 'Zirconium',     90,  'transition',   [2,8,18,10,2],          5,  4),
  el(41, 'Nb', 'Niobium',       93,  'transition',   [2,8,18,12,1],          5,  5),
  el(42, 'Mo', 'Molybdenum',    98,  'transition',   [2,8,18,13,1],          5,  6),
  el(43, 'Tc', 'Technetium',    98,  'transition',   [2,8,18,13,2],          5,  7, 'β⁻'),
  el(44, 'Ru', 'Ruthenium',     102, 'transition',   [2,8,18,15,1],          5,  8),
  el(45, 'Rh', 'Rhodium',       103, 'transition',   [2,8,18,16,1],          5,  9),
  el(46, 'Pd', 'Palladium',     106, 'transition',   [2,8,18,18],            5, 10),
  el(47, 'Ag', 'Silver',        107, 'transition',   [2,8,18,18,1],          5, 11),
  el(48, 'Cd', 'Cadmium',       114, 'transition',   [2,8,18,18,2],          5, 12),
  el(49, 'In', 'Indium',        115, 'poor-metal',   [2,8,18,18,3],          5, 13),
  el(50, 'Sn', 'Tin',           120, 'poor-metal',   [2,8,18,18,4],          5, 14),
  el(51, 'Sb', 'Antimony',      121, 'metalloid',    [2,8,18,18,5],          5, 15),
  el(52, 'Te', 'Tellurium',     130, 'metalloid',    [2,8,18,18,6],          5, 16),
  el(53, 'I',  'Iodine',        127, 'halogen',      [2,8,18,18,7],          5, 17),
  el(54, 'Xe', 'Xenon',         132, 'noble',        [2,8,18,18,8],          5, 18),
  el(55, 'Cs', 'Caesium',       133, 'alkali',       [2,8,18,18,8,1],        6,  1),
  el(56, 'Ba', 'Barium',        138, 'alkaline',     [2,8,18,18,8,2],        6,  2),
  el(57, 'La', 'Lanthanum',     139, 'lanthanide',   [2,8,18,18,9,2],        6,  3),
  el(58, 'Ce', 'Cerium',        140, 'lanthanide',   [2,8,18,19,9,2],        6,  4),
  el(59, 'Pr', 'Praseodymium',  141, 'lanthanide',   [2,8,18,21,8,2],        6,  5),
  el(60, 'Nd', 'Neodymium',     142, 'lanthanide',   [2,8,18,22,8,2],        6,  6),
  el(61, 'Pm', 'Promethium',    145, 'lanthanide',   [2,8,18,23,8,2],        6,  7, 'β⁻'),
  el(62, 'Sm', 'Samarium',      152, 'lanthanide',   [2,8,18,24,8,2],        6,  8),
  el(63, 'Eu', 'Europium',      153, 'lanthanide',   [2,8,18,25,8,2],        6,  9),
  el(64, 'Gd', 'Gadolinium',    158, 'lanthanide',   [2,8,18,25,9,2],        6, 10),
  el(65, 'Tb', 'Terbium',       159, 'lanthanide',   [2,8,18,27,8,2],        6, 11),
  el(66, 'Dy', 'Dysprosium',    164, 'lanthanide',   [2,8,18,28,8,2],        6, 12),
  el(67, 'Ho', 'Holmium',       165, 'lanthanide',   [2,8,18,29,8,2],        6, 13),
  el(68, 'Er', 'Erbium',        166, 'lanthanide',   [2,8,18,30,8,2],        6, 14),
  el(69, 'Tm', 'Thulium',       169, 'lanthanide',   [2,8,18,31,8,2],        6, 15),
  el(70, 'Yb', 'Ytterbium',     174, 'lanthanide',   [2,8,18,32,8,2],        6, 16),
  el(71, 'Lu', 'Lutetium',      175, 'lanthanide',   [2,8,18,32,9,2],        6, 17),
  el(72, 'Hf', 'Hafnium',       180, 'transition',   [2,8,18,32,10,2],       6,  4),
  el(73, 'Ta', 'Tantalum',      181, 'transition',   [2,8,18,32,11,2],       6,  5),
  el(74, 'W',  'Tungsten',      184, 'transition',   [2,8,18,32,12,2],       6,  6),
  el(75, 'Re', 'Rhenium',       187, 'transition',   [2,8,18,32,13,2],       6,  7),
  el(76, 'Os', 'Osmium',        192, 'transition',   [2,8,18,32,14,2],       6,  8),
  el(77, 'Ir', 'Iridium',       193, 'transition',   [2,8,18,32,15,2],       6,  9),
  el(78, 'Pt', 'Platinum',      195, 'transition',   [2,8,18,32,17,1],       6, 10),
  el(79, 'Au', 'Gold',          197, 'transition',   [2,8,18,32,18,1],       6, 11),
  el(80, 'Hg', 'Mercury',       202, 'transition',   [2,8,18,32,18,2],       6, 12),
  el(81, 'Tl', 'Thallium',      205, 'poor-metal',   [2,8,18,32,18,3],       6, 13),
  el(82, 'Pb', 'Lead',          208, 'poor-metal',   [2,8,18,32,18,4],       6, 14),
  el(83, 'Bi', 'Bismuth',       209, 'poor-metal',   [2,8,18,32,18,5],       6, 15, 'α'),
  el(84, 'Po', 'Polonium',      209, 'metalloid',    [2,8,18,32,18,6],       6, 16, 'α'),
  el(85, 'At', 'Astatine',      210, 'halogen',      [2,8,18,32,18,7],       6, 17, 'α'),
  el(86, 'Rn', 'Radon',         222, 'noble',        [2,8,18,32,18,8],       6, 18, 'α'),
  el(87, 'Fr', 'Francium',      223, 'alkali',       [2,8,18,32,18,8,1],     7,  1, 'β⁻'),
  el(88, 'Ra', 'Radium',        226, 'alkaline',     [2,8,18,32,18,8,2],     7,  2, 'α'),
  el(89, 'Ac', 'Actinium',      227, 'actinide',     [2,8,18,32,18,9,2],     7,  3, 'β⁻'),
  el(90, 'Th', 'Thorium',       232, 'actinide',     [2,8,18,32,18,10,2],    7,  4, 'α'),
  el(91, 'Pa', 'Protactinium',  231, 'actinide',     [2,8,18,32,20,9,2],     7,  5, 'α'),
  el(92, 'U',  'Uranium',       238, 'actinide',     [2,8,18,32,21,9,2],     7,  6, 'α'),
  el(93, 'Np', 'Neptunium',     237, 'actinide',     [2,8,18,32,22,9,2],     7,  7, 'α'),
  el(94, 'Pu', 'Plutonium',     244, 'actinide',     [2,8,18,32,24,8,2],     7,  8, 'α'),
  el(95, 'Am', 'Americium',     243, 'actinide',     [2,8,18,32,25,8,2],     7,  9, 'α'),
  el(96, 'Cm', 'Curium',        247, 'actinide',     [2,8,18,32,25,9,2],     7, 10, 'α'),
  el(97, 'Bk', 'Berkelium',     247, 'actinide',     [2,8,18,32,27,8,2],     7, 11, 'α'),
  el(98, 'Cf', 'Californium',   251, 'actinide',     [2,8,18,32,28,8,2],     7, 12, 'α/SF'),
]

// Fast lookup by Z.
export const BY_Z = new Map(ELEMENTS.map(e => [e.Z, e]))

// Category colours — tuned to sit on the dark #0a0a0e canvas without
// competing with the amber/rose/fuchsia headline gradient.
export const CAT_COLORS = {
  'nonmetal':    { bg: 'bg-emerald-500/10',  border: 'border-emerald-400/30',  text: 'text-emerald-200'  },
  'noble':       { bg: 'bg-violet-500/10',   border: 'border-violet-400/30',   text: 'text-violet-200'   },
  'alkali':      { bg: 'bg-rose-500/10',     border: 'border-rose-400/30',     text: 'text-rose-200'     },
  'alkaline':    { bg: 'bg-pink-500/10',     border: 'border-pink-400/30',     text: 'text-pink-200'     },
  'metalloid':   { bg: 'bg-cyan-500/10',     border: 'border-cyan-400/30',     text: 'text-cyan-200'     },
  'halogen':     { bg: 'bg-amber-500/10',    border: 'border-amber-400/30',    text: 'text-amber-200'    },
  'poor-metal':  { bg: 'bg-sky-500/10',      border: 'border-sky-400/30',      text: 'text-sky-200'      },
  'transition':  { bg: 'bg-orange-500/10',   border: 'border-orange-400/30',   text: 'text-orange-200'   },
  'lanthanide':  { bg: 'bg-fuchsia-500/10',  border: 'border-fuchsia-400/30',  text: 'text-fuchsia-200'  },
  'actinide':    { bg: 'bg-red-500/10',      border: 'border-red-400/30',      text: 'text-red-200'      },
}

// ────── Isotope table for the decay-chain explorer ──────
// Half-lives quoted in seconds. Modes: α, β⁻, β⁺/ε, SF, IT.
// Canonical AME2020 / IAEA LiveChart values.
export const ISOTOPES = {
  // Uranium-238 series (4n+2)
  'U-238':  { Z: 92, A: 238, halfLife: 4.468e9 * 3.156e7, mode: 'α', daughter: 'Th-234' },
  'Th-234': { Z: 90, A: 234, halfLife: 24.10 * 86400,     mode: 'β⁻', daughter: 'Pa-234' },
  'Pa-234': { Z: 91, A: 234, halfLife: 6.70 * 3600,       mode: 'β⁻', daughter: 'U-234'  },
  'U-234':  { Z: 92, A: 234, halfLife: 2.455e5 * 3.156e7, mode: 'α', daughter: 'Th-230' },
  'Th-230': { Z: 90, A: 230, halfLife: 7.54e4 * 3.156e7,  mode: 'α', daughter: 'Ra-226' },
  'Ra-226': { Z: 88, A: 226, halfLife: 1600 * 3.156e7,    mode: 'α', daughter: 'Rn-222' },
  'Rn-222': { Z: 86, A: 222, halfLife: 3.8235 * 86400,    mode: 'α', daughter: 'Po-218' },
  'Po-218': { Z: 84, A: 218, halfLife: 3.10 * 60,         mode: 'α', daughter: 'Pb-214' },
  'Pb-214': { Z: 82, A: 214, halfLife: 26.8 * 60,         mode: 'β⁻', daughter: 'Bi-214' },
  'Bi-214': { Z: 83, A: 214, halfLife: 19.9 * 60,         mode: 'β⁻', daughter: 'Po-214' },
  'Po-214': { Z: 84, A: 214, halfLife: 164e-6,            mode: 'α', daughter: 'Pb-210' },
  'Pb-210': { Z: 82, A: 210, halfLife: 22.2 * 3.156e7,    mode: 'β⁻', daughter: 'Bi-210' },
  'Bi-210': { Z: 83, A: 210, halfLife: 5.012 * 86400,     mode: 'β⁻', daughter: 'Po-210' },
  'Po-210': { Z: 84, A: 210, halfLife: 138.376 * 86400,   mode: 'α', daughter: 'Pb-206' },
  'Pb-206': { Z: 82, A: 206, halfLife: Infinity,          mode: 'stable', daughter: null },

  // Thorium-232 series (4n)
  'Th-232': { Z: 90, A: 232, halfLife: 1.405e10 * 3.156e7, mode: 'α', daughter: 'Ra-228' },
  'Ra-228': { Z: 88, A: 228, halfLife: 5.75 * 3.156e7,     mode: 'β⁻', daughter: 'Ac-228' },
  'Ac-228': { Z: 89, A: 228, halfLife: 6.15 * 3600,        mode: 'β⁻', daughter: 'Th-228' },
  'Th-228': { Z: 90, A: 228, halfLife: 1.9116 * 3.156e7,   mode: 'α', daughter: 'Ra-224' },
  'Ra-224': { Z: 88, A: 224, halfLife: 3.632 * 86400,      mode: 'α', daughter: 'Rn-220' },
  'Rn-220': { Z: 86, A: 220, halfLife: 55.6,               mode: 'α', daughter: 'Po-216' },
  'Po-216': { Z: 84, A: 216, halfLife: 0.145,              mode: 'α', daughter: 'Pb-212' },
  'Pb-212': { Z: 82, A: 212, halfLife: 10.64 * 3600,       mode: 'β⁻', daughter: 'Bi-212' },
  'Bi-212': { Z: 83, A: 212, halfLife: 60.55 * 60,         mode: 'β⁻', daughter: 'Po-212' },
  'Po-212': { Z: 84, A: 212, halfLife: 299e-9,             mode: 'α', daughter: 'Pb-208' },
  'Pb-208': { Z: 82, A: 208, halfLife: Infinity,           mode: 'stable', daughter: null },

  // Actinium (U-235) series subset
  'U-235':  { Z: 92, A: 235, halfLife: 7.04e8 * 3.156e7,   mode: 'α', daughter: 'Th-231' },

  // Fission products (canonical U-235 thermal-neutron yield)
  'Kr-92':  { Z: 36, A: 92,  halfLife: 1.85,               mode: 'β⁻', daughter: 'Rb-92'  },
  'Ba-141': { Z: 56, A: 141, halfLife: 18.27 * 60,         mode: 'β⁻', daughter: 'La-141' },
}

// Decay chain roots the UI offers as presets.
export const CHAIN_ROOTS = ['U-238', 'Th-232', 'Ra-226']

// Human-format helpers.
export function fmtHalfLife(seconds) {
  if (!isFinite(seconds)) return '∞ · stable'
  if (seconds < 1e-6)  return (seconds * 1e9).toFixed(2)  + ' ns'
  if (seconds < 1e-3)  return (seconds * 1e6).toFixed(2)  + ' µs'
  if (seconds < 1)     return (seconds * 1e3).toFixed(2)  + ' ms'
  if (seconds < 60)    return seconds.toFixed(2) + ' s'
  if (seconds < 3600)  return (seconds / 60).toFixed(2) + ' min'
  if (seconds < 86400) return (seconds / 3600).toFixed(2) + ' h'
  if (seconds < 3.156e7)   return (seconds / 86400).toFixed(2) + ' d'
  if (seconds < 3.156e10)  return (seconds / 3.156e7).toFixed(2) + ' yr'
  if (seconds < 3.156e13)  return (seconds / 3.156e10).toFixed(2) + ' kyr'
  if (seconds < 3.156e16)  return (seconds / 3.156e13).toFixed(2) + ' Myr'
  return (seconds / 3.156e16).toFixed(2) + ' Gyr'
}

// Traverse a decay chain from a root, returning ordered nodes and edges.
export function buildChain(root) {
  const nodes = []
  const edges = []
  let cur = root
  let depth = 0
  const seen = new Set()
  while (cur && ISOTOPES[cur] && !seen.has(cur) && depth < 24) {
    seen.add(cur)
    nodes.push({ id: cur, depth, ...ISOTOPES[cur] })
    const nxt = ISOTOPES[cur].daughter
    if (nxt) edges.push({ from: cur, to: nxt, mode: ISOTOPES[cur].mode })
    cur = nxt
    depth++
  }
  // Terminal node if not already included.
  if (cur && ISOTOPES[cur] && !seen.has(cur)) {
    nodes.push({ id: cur, depth, ...ISOTOPES[cur] })
  }
  return { nodes, edges }
}
