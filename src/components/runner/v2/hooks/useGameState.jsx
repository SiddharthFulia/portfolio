// useGameState — single source of truth for the runner game (v2).
//
// State + actions exposed via React Context. Used by the GameCanvas to
// tick the world, by the HUD to render score/coins/distance, and by the
// page shell to switch between menu / play / pause / gameover screens.
//
// Persistence: playerName, difficulty, and highScore mirror to
// localStorage so they survive a reload. In-progress score/coins/distance
// stay session-only.

import { createContext, useCallback, useContext, useEffect, useReducer } from 'react'

export const DIFFICULTIES = {
  easy:    { label: 'Easy',    speed:  5, accel: 0.05, maxSpeed: 18, color: 'emerald' },
  medium:  { label: 'Medium',  speed:  8, accel: 0.10, maxSpeed: 24, color: 'amber'  },
  hard:    { label: 'Hard',    speed: 12, accel: 0.18, maxSpeed: 32, color: 'rose'   },
  classic: { label: 'Classic', speed:  6, accel: 0.04, maxSpeed: Infinity, color: 'fuchsia' },
}

const NAME_KEY  = 'sid-runner-name'
const DIFF_KEY  = 'sid-runner-difficulty'
const HIGH_KEY  = 'sid-runner-highscore'

const computeScore = (distance, coins) => Math.floor(distance) + coins * 50

const initialState = (() => {
  let highScore = 0
  // Default name is 'sid' so a first-time visitor can hit Play without
  // typing. They can still overwrite it in the StartMenu; localStorage
  // takes precedence if they've played before.
  let playerName = 'sid'
  let difficulty = 'medium'
  try {
    highScore  = parseInt(localStorage.getItem(HIGH_KEY) || '0', 10) || 0
    const stored = localStorage.getItem(NAME_KEY)
    if (stored) playerName = stored
    const d    = localStorage.getItem(DIFF_KEY)
    if (d && DIFFICULTIES[d]) difficulty = d
  } catch {}
  return {
    status: 'idle',
    score: 0,
    coins: 0,
    distance: 0,
    speed: 0,
    highScore,
    playerName,
    difficulty,
    // Set to true the moment continueRun() fires. The GameOverModal
    // hides the Continue button on the next death so the run can't be
    // revived twice, and the final score lands on the leaderboard.
    freeRetryUsed: false,
  }
})()

function reducer(state, action) {
  switch (action.type) {
    case 'START': {
      const { playerName, difficulty } = action
      const preset = DIFFICULTIES[difficulty] || DIFFICULTIES.medium
      return {
        ...state,
        status: 'playing',
        score: 0,
        coins: 0,
        distance: 0,
        speed: preset.speed,
        playerName: playerName ?? state.playerName,
        difficulty: difficulty ?? state.difficulty,
        // Fresh run → fresh free retry.
        freeRetryUsed: false,
      }
    }
    case 'CONTINUE_RUN': {
      // One per run. Caller verifies status === 'gameover'; we double-
      // guard so a stray dispatch can't bypass the cap. Keeps score /
      // coins / distance / speed intact so the user picks up where
      // they died. The Runner shell pairs this with an immediate
      // playerRef.activateHoverboard() so the killer obstacle (still
      // overlapping the player) gets vaporised harmlessly during
      // hoverboard immunity.
      if (state.status !== 'gameover' || state.freeRetryUsed) return state
      return { ...state, status: 'playing', freeRetryUsed: true }
    }
    case 'PAUSE':
      return state.status === 'playing' ? { ...state, status: 'paused' } : state
    case 'RESUME':
      return state.status === 'paused' ? { ...state, status: 'playing' } : state
    case 'GAME_OVER': {
      const newHigh = Math.max(state.highScore, state.score)
      return { ...state, status: 'gameover', highScore: newHigh }
    }
    case 'RESET':
      return { ...state, status: 'idle', score: 0, coins: 0, distance: 0, speed: 0 }
    case 'ADD_COIN': {
      const coins = state.coins + 1
      return { ...state, coins, score: computeScore(state.distance, coins) }
    }
    case 'TICK': {
      if (state.status !== 'playing') return state
      const { delta } = action
      const preset   = DIFFICULTIES[state.difficulty] || DIFFICULTIES.medium
      const distance = state.distance + state.speed * delta
      const speed    = Math.min(preset.maxSpeed, state.speed + preset.accel * delta)
      const score    = computeScore(distance, state.coins)
      return { ...state, distance, speed, score }
    }
    case 'SET_NAME':
      return { ...state, playerName: action.value }
    case 'SET_DIFFICULTY':
      return DIFFICULTIES[action.value] ? { ...state, difficulty: action.value } : state
    case 'SET_HIGH_SCORE':
      return { ...state, highScore: Math.max(state.highScore, action.value) }
    default:
      return state
  }
}

const GameStateContext = createContext(null)

export function GameStateProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState)

  // Persist user choices + high score on change.
  useEffect(() => { try { localStorage.setItem(NAME_KEY, state.playerName || '') } catch {} }, [state.playerName])
  useEffect(() => { try { localStorage.setItem(DIFF_KEY, state.difficulty) } catch {} }, [state.difficulty])
  useEffect(() => { try { localStorage.setItem(HIGH_KEY, String(state.highScore || 0)) } catch {} }, [state.highScore])

  const start          = useCallback(({ playerName, difficulty } = {}) => dispatch({ type: 'START', playerName, difficulty }), [])
  const pause          = useCallback(() => dispatch({ type: 'PAUSE' }), [])
  const resume         = useCallback(() => dispatch({ type: 'RESUME' }), [])
  const gameOver       = useCallback(() => dispatch({ type: 'GAME_OVER' }), [])
  const reset          = useCallback(() => dispatch({ type: 'RESET' }), [])
  const continueRun    = useCallback(() => dispatch({ type: 'CONTINUE_RUN' }), [])
  const addCoin        = useCallback(() => dispatch({ type: 'ADD_COIN' }), [])
  const tick           = useCallback((delta) => dispatch({ type: 'TICK', delta }), [])
  const setPlayerName  = useCallback((value) => dispatch({ type: 'SET_NAME', value }), [])
  const setDifficulty  = useCallback((value) => dispatch({ type: 'SET_DIFFICULTY', value }), [])
  const setHighScore   = useCallback((value) => dispatch({ type: 'SET_HIGH_SCORE', value }), [])

  const value = {
    ...state,
    start, pause, resume, gameOver, reset, continueRun,
    addCoin, tick,
    setPlayerName, setDifficulty, setHighScore,
  }
  return <GameStateContext.Provider value={value}>{children}</GameStateContext.Provider>
}

export function useGameState() {
  const ctx = useContext(GameStateContext)
  if (!ctx) throw new Error('useGameState must be used inside <GameStateProvider>')
  return ctx
}
