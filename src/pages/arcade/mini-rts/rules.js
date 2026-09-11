// MiniRts — rules copy + difficulty presets + custom-mode schema.
//
// Split out of MiniRts.jsx so sibling agents can rebalance without
// touching the RTS state machine. Imported by the main component.

export const RULES = [
  { heading: 'Goal', body: 'Destroy the enemy town hall while defending your own. Both sides start with a town hall and two peasants; the first to lose their base loses the run.' },
  { heading: 'Controls', body: 'Left-click drag — box-select units.\nRight-click — order the selected units to move (or attack if the target is an enemy).\nClick a building to see its train queue; click a train button to queue a unit.\nB opens the build menu (place a farm, barracks or tower on grass).\nF toggles fog of war.' },
  { heading: 'Economy', body: 'Peasants gather Gold and Wood from resource nodes (yellow / green icons). Idle peasants stand around your town hall. Each trip returns ~40% bonus so upgrading peasant count matters.' },
  { heading: 'Buildings', body: 'Town hall — trains peasants; game over if destroyed.\nFarm — raises your population cap by 6.\nBarracks — trains sword / archer / cavalry.\nTower — auto-attacks nearby enemies with 5-tile range.' },
  { heading: 'Combat counter', body: 'Sword > Cavalry\nCavalry > Archer\nArcher > Sword\nEach match-up applies a 1.6× vs 0.7× multiplier. Mix your army.' },
  { heading: 'AI', body: 'The enemy runs the same macro loop as you at their own pace. Higher aggression makes them build army faster and attack sooner; lower aggression makes them turtle behind defences.' },
  { heading: 'Difficulty', body: 'Easy = 300 gold / 200 wood start, dim fog, timid AI. Hard = 60 gold / 20 wood, dense fog, aggressive AI. Custom exposes starting resources, fog radius, AI aggression, and victory condition (destroy HQ / annihilate).' },
]

export const DIFFICULTIES = {
  Easy:   { startGold: 300, fogRadius: 4, aiAggro: 0.3, victoryHQOnly: true },
  Medium: { startGold: 120, fogRadius: 6, aiAggro: 1.0, victoryHQOnly: true },
  Hard:   { startGold: 60,  fogRadius: 8, aiAggro: 1.8, victoryHQOnly: false },
}

export const CUSTOM_SCHEMA = {
  startGold: { label: 'Starting gold', min: 40, max: 400, step: 10, default: 120 },
  fogRadius: { label: 'Fog radius',    min: 3,  max: 10,  step: 1,  default: 6 },
  aiAggro:   { label: 'AI aggression', min: 0.2, max: 2.5, step: 0.1, default: 1.0 },
  victoryHQOnly: { label: 'HQ-only victory (0/1)', min: 0, max: 1, step: 1, default: 1 },
}
