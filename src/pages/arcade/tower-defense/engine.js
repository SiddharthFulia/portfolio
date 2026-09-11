// TowerDefense — pure engine scaffold.
//
// Target exports:
//   • initState(cfg)                  — grid, path, wallet, lives, wave 0
//   • tick(state, dt)                 — enemies walk, towers shoot, waves progress
//   • placeTower(state, gx, gy, kind) — validate cell + spend gold
//   • upgradeTower(state, id)         — apply tier bump + cost
//   • sellTower(state, id)            — refund ~70%
//   • startWave(state)                — queue up next wave's enemies
//   • damageEnemy(state, id, dmg)     — apply damage + collect bounty on death
//
// Path (grid coord list), tile constants and canvas dimensions still
// live in TowerDefense.jsx.
export {}
