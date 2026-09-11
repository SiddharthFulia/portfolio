// MiniRts — pure engine scaffold.
//
// Target exports:
//   • initState(cfg)                — seed map + starting units + resources
//   • tick(state, dt)               — advance economy, unit AI, combat
//   • handleCommand(state, cmd)     — issue move/attack/build/train
//   • runEnemyMacro(state, dt)      — enemy AI (economy → army → attack)
//   • simCombat(state, dt)          — resolve unit-vs-unit ticks
//
// Tile enum + map generator + pathing all live in MiniRts.jsx today;
// a sibling agent will pull them here.
export {}
