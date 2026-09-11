// TempleRunner — rules copy + difficulty presets + custom-mode schema.
//
// Split out of TempleRunner.jsx so sibling agents can tune presets or
// rewrite copy without touching game logic. The .jsx shell imports
// these three exports and passes them into <GameShell>.

export const RULES = [
  { heading: 'Goal', body: 'Run as far as you can down a twisting temple path while a monkey chases you. Missing a corner, a jump, or a slide drops you off the path.' },
  { heading: 'Controls', body: '← → / A D / swipe — switch lanes and steer through corners.\n↑ / W / Space / swipe up — jump over gaps.\n↓ / S / swipe down — slide under vines.\nHold Shift or swipe forward for a sprint burst (drains stamina).' },
  { heading: 'Corners', body: 'The path bends left or right at random intervals. A directional arrow flashes ahead — swipe or press the matching arrow BEFORE the corner arrives. Nailing it inside the window scores a "Turn!" bonus and pushes the monkey back a little.' },
  { heading: 'Obstacles', body: 'Gaps must be jumped, hanging vines must be slid under, and low idols must be dodged sideways. Each successful clear counts toward missions.' },
  { heading: 'Coins, gems & monkey', body: 'Coins are common line-collectibles; gems are rare and worth a lot. The chasing monkey is represented by a proximity meter — coins/gems slow it slightly, missed turns speed it up. Meter full = caught.' },
  { heading: 'Missions', body: 'Every run has 3 procedurally chosen missions (distance / coins / gems / turns / slides / jumps). Completing one awards a permanent +5% speed upgrade stored in localStorage — carries into future runs.' },
  { heading: 'Difficulty', body: 'Easy = slower baseline, corners rare, obstacles sparse, generous sprint. Hard = fast baseline, corners every few seconds, dense obstacles, tiny sprint pool. Custom exposes base speed, turn frequency, obstacle density, and sprint multiplier.' },
]

export const DIFFICULTIES = {
  Easy:   { baseSpeed: 210, turnRate: 0.4, obstacleInterval: 28, sprintBonus: 1.6 },
  Medium: { baseSpeed: 260, turnRate: 0.7, obstacleInterval: 22, sprintBonus: 1.4 },
  Hard:   { baseSpeed: 320, turnRate: 1.1, obstacleInterval: 15, sprintBonus: 1.2 },
}

export const CUSTOM_SCHEMA = {
  baseSpeed:        { label: 'Base speed',      min: 160, max: 400, step: 10, default: 260 },
  turnRate:         { label: 'Turn frequency',  min: 0.2, max: 1.5, step: 0.05, default: 0.7 },
  obstacleInterval: { label: 'Obstacle spacing', min: 12,  max: 40,  step: 1,  default: 22 },
  sprintBonus:      { label: 'Sprint multiplier', min: 1.1, max: 2.0, step: 0.05, default: 1.4 },
}
