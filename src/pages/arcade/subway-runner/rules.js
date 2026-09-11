// SubwayRunner — rules copy + difficulty presets + custom-mode schema.
//
// Extracted so sibling agents can adjust difficulty without touching
// the pseudo-3D projection code in SubwayRunner.jsx.

export const RULES = [
  { heading: 'Goal', body: 'Run as far as you can down the 3-lane track. Score is the distance travelled in metres. Any collision with an obstacle ends the run — no lives.' },
  { heading: 'Controls', body: '← → / A D / swipe — switch lanes.\n↑ / W / Space / swipe up — jump (also breaks low barriers when landing on them).\n↓ / S / swipe down — slide under high barriers.\nP pauses; R restarts.' },
  { heading: 'Obstacles', body: 'Low barriers can only be crossed by jumping. High barriers only by sliding. Wide crash-blocks span an entire lane and must be dodged sideways.' },
  { heading: 'Coins & pickups', body: 'Coins add score directly and appear in lines and jumping arcs. Pickups fall in one of three types:\n• Magnet (~6 s) — draws coins toward you across lanes.\n• Shield (~6 s) — absorbs one crash without dying.\n• Multiplier (~6 s) — 1.25× distance speed and score.' },
  { heading: 'Environments', body: 'Every 500 m the world swaps between Subway (violet pillars), Bridge (orange pylons + sky) and Tunnel (pink cables). Different environments seed slightly different obstacle mixes.' },
  { heading: 'Speed ramp', body: 'Base run speed is 220 z-units/s and creeps up as you cover more ground, capped at 520. Obstacle spawn interval shrinks proportionally, so long runs feel truly frantic.' },
  { heading: 'Difficulty', body: 'Easy = slower, fewer trains, dense coins, common pickups. Hard = faster start, packed obstacles, sparse coins, rare pickups. Custom exposes base speed, spawn interval, coin density and pickup rate.' },
]

export const DIFFICULTIES = {
  Easy:   { baseSpeed: 170, spawnInterval: 32, coinDensity: 1.4, powerupChance: 0.30 },
  Medium: { baseSpeed: 220, spawnInterval: 25, coinDensity: 1.0, powerupChance: 0.20 },
  Hard:   { baseSpeed: 280, spawnInterval: 18, coinDensity: 0.6, powerupChance: 0.10 },
}

export const CUSTOM_SCHEMA = {
  baseSpeed:     { label: 'Base speed',       min: 130, max: 360, step: 10, default: 220 },
  spawnInterval: { label: 'Train spawn (z)',  min: 12,  max: 40,  step: 1,  default: 25 },
  coinDensity:   { label: 'Coin density',     min: 0.3, max: 2.0, step: 0.1, default: 1.0 },
  powerupChance: { label: 'Powerup rate',     min: 0.0, max: 0.5, step: 0.02, default: 0.20 },
}
