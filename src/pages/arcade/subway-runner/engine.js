// SubwayRunner — pure engine scaffold.
//
// Target exports:
//   • initState(cfg)          — RNG seed, spawn queues, initial pose
//   • tick(state, dt)         — advance z, cull past-camera obstacles
//   • handleInput(state, ev)  — lane shift / jump / slide / pause
//   • collideAt(state, z)     — resolve collisions in the hit-window
//   • spawnEnv(state)         — cycle subway/bridge/tunnel & obstacle mix
//
// The mulberry32 PRNG and projection constants live in SubwayRunner.jsx.
export {}
