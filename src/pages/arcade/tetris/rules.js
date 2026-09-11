// Tetris — rules copy + difficulty presets + custom-mode schema.
//
// Split out of Tetris.jsx so sibling agents can iterate on the copy or
// tune knobs without touching game logic. The main component imports
// these three exports and passes them straight into <GameShell>.

export const RULES = [
  { heading: 'Goal', body: 'Rotate and drop the 7 tetromino shapes into the 10-wide × 20-tall well to complete horizontal lines. Every completed line clears; stacking above the top of the well ends the game.' },
  { heading: 'Controls', body: 'Left / Right arrows shift the piece one column. Down soft-drops. Up or X rotates clockwise. Z rotates counter-clockwise. Space is a hard drop that instantly locks the piece. C or Shift swaps the current piece with the hold slot (once per lock). P pauses. On mobile: swipe to move, tap to rotate.' },
  { heading: 'Scoring', body: '1 line = 100 × level. 2 lines = 300 × level. 3 lines = 500 × level. 4 lines ("Tetris") = 800 × level. T-spins are worth much more: mini 100/200/400, full 400/800/1200/1600. Back-to-back Tetris or T-spin adds a 50% bonus.' },
  { heading: 'T-spin detection', body: 'After a T-piece locks, count how many of its four diagonal corners are filled. Three or four = T-spin. The last wall-kick used decides whether it counts as mini or full. T-spin without any line clears still awards points.' },
  { heading: 'Levels & gravity', body: 'Every 10 lines cleared bumps the level. Drop speed follows a table: 800 ms/row at L1, 400 ms at L6, 45 ms at L15, 15 ms at L20+. Higher levels also multiply score.' },
  { heading: 'Hold, ghost & 7-bag', body: 'The hold slot lets you park a piece for later. Ghost outline shows exactly where a hard drop will land. Pieces come from a shuffled 7-bag — every 7 pieces you see one of each, but never predictably ordered.' },
  { heading: 'Difficulty', body: 'Easy starts at level 1 with a 5-piece preview and long lock delay. Hard starts at level 5 with only a 1-piece preview and a snappy lock delay. Custom exposes starting level, preview count, lock delay and line-clear delay.' },
]

export const DIFFICULTIES = {
  Easy:   { startLevel: 1, previewCount: 5, lockDelay: 700, clearDelay: 300 },
  Medium: { startLevel: 1, previewCount: 3, lockDelay: 500, clearDelay: 200 },
  Hard:   { startLevel: 5, previewCount: 1, lockDelay: 250, clearDelay: 80 },
}

export const CUSTOM_SCHEMA = {
  startLevel:   { label: 'Starting level',    min: 1,  max: 15,  step: 1,  default: 1 },
  previewCount: { label: 'Preview pieces',    min: 0,  max: 6,   step: 1,  default: 3 },
  lockDelay:    { label: 'Lock delay (ms)',   min: 100,max: 1200,step: 50, default: 500 },
  clearDelay:   { label: 'Clear delay (ms)',  min: 0,  max: 500, step: 20, default: 200 },
}
