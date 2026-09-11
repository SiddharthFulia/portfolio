// Tetris — pure game engine (scaffold).
//
// This file is the destination for the pure-function core of Tetris:
//
//   • initState(cfg)               → fresh game state
//   • tick(state, dt)              → advance one animation-frame worth
//   • handleInput(state, ev)       → mutate state in response to key/touch
//   • rotate(state, dir)           → SRS wall-kick rotation
//   • move(state, dx)              → horizontal shift
//   • softDrop(state)              → one-cell drop + score
//   • hardDrop(state)              → drop to bottom + lock
//   • holdSwap(state)              → swap active with hold
//   • lockPiece(state)             → lock, clear rows, spawn, T-spin scoring
//
// A sibling agent is expected to finish extracting these from
// ../Tetris.jsx into this module while preserving the exact SRS kick
// tables + T-spin detection + back-to-back + 7-bag behaviour.
//
// Until that lands, the game continues to run from Tetris.jsx directly.

export const PIECE_ORDER = ['I','O','T','S','Z','L','J']

// The rest of the engine still lives in ../Tetris.jsx. Do not duplicate
// constants here without also removing them from the .jsx file.
