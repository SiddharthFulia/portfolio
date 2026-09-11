// TempleRunner — pure engine scaffold.
//
// Target exports (to be populated by a sibling agent):
//
//   • initState(cfg, upgrades) — seed the run with a fresh RNG
//   • tick(state, dt)          — advance world scroll + physics
//   • handleInput(state, ev)   — arrow / swipe / sprint
//   • jump(state)              — jump if grounded
//   • slide(state)             — slide if grounded
//   • laneShift(state, dir)    — clamp to 0..2
//   • takeCorner(state, dir)   — apply corner-hit bonus/penalty
//
// mulberry32 PRNG + LOGICAL_W/H/HORIZON constants belong here once
// the split is done.
export {}
