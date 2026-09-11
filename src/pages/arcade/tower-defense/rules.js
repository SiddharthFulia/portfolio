// TowerDefense — rules copy + difficulty presets + custom-mode schema.
//
// Split out of TowerDefense.jsx so sibling agents can retune upgrade
// costs, HP scaling, and wave interval without editing engine code.

export const RULES = [
  { heading: 'Goal', body: 'Survive every wave of enemies walking down the cobbled road. Enemies that reach the end drain your lives. Zero lives ends the run.' },
  { heading: 'Controls', body: 'Left-click a grass tile to place the selected tower. Left-click an existing tower to open its panel — upgrade or sell. Number keys 1-4 switch tower type. Space starts the next wave immediately (bonus gold).' },
  { heading: 'Towers', body: 'Arrow (yellow) — fast, single-target, cheap. Best all-rounder for early waves.\nCannon (orange) — slow shell with splash. Handles tight groups.\nFrost (cyan) — low damage but chills a wide radius, slowing everything.\nLightning (violet) — chains between multiple enemies at range.' },
  { heading: 'Economy', body: 'You start with a limited gold budget. Every killed enemy pays a bounty. Wave clear bonus scales with the wave number. Selling a tower refunds most of its cost. Upgrades cost more each tier but scale damage / range / fire rate substantially.' },
  { heading: 'Enemies', body: 'Grunt — baseline red.\nRunner — fast but frail (yellow).\nTank — slow but tanky (grey).\nShielded — 40% damage reduction (violet).\nBoss — every 10th wave, huge HP, huge bounty.' },
  { heading: 'Waves', body: 'Waves are pre-built with a mix that scales with wave number. Every 10th wave is a boss. Between waves the timer counts down — starting early with Space grants a small bonus.' },
  { heading: 'Difficulty', body: 'Easy = 300 gold to start, +30% enemy HP scaling per wave slow, long wave interval, cheaper upgrades. Hard = 100 gold, fast HP scaling, short interval, standard costs. Custom exposes starting gold, HP scaling, wave interval, and upgrade cost multiplier.' },
]

export const DIFFICULTIES = {
  Easy:   { startGold: 300, hpScale: 0.6, waveInterval: 12, upgradeMult: 0.75 },
  Medium: { startGold: 180, hpScale: 1.0, waveInterval: 8,  upgradeMult: 1.0 },
  Hard:   { startGold: 100, hpScale: 1.5, waveInterval: 5,  upgradeMult: 1.25 },
}

export const CUSTOM_SCHEMA = {
  startGold:    { label: 'Starting gold',   min: 80,  max: 400, step: 10, default: 180 },
  hpScale:      { label: 'Enemy HP scale',  min: 0.5, max: 2.0, step: 0.1, default: 1.0 },
  waveInterval: { label: 'Wave interval (s)', min: 3, max: 20,  step: 1,  default: 8 },
  upgradeMult:  { label: 'Upgrade cost mult', min: 0.5, max: 1.5, step: 0.05, default: 1.0 },
}
