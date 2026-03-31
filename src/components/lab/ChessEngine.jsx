import React, { useState, useEffect, useCallback, useRef } from 'react'

// ─── Constants ───────────────────────────────────────────────────────────────

const WHITE = 0, BLACK = 1
const EMPTY = 0, PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6
const OFF = -1 // off-board sentinel

const PIECE_CHARS_W = { [PAWN]: '♙', [KNIGHT]: '♘', [BISHOP]: '♗', [ROOK]: '♖', [QUEEN]: '♕', [KING]: '♔' }
const PIECE_CHARS_B = { [PAWN]: '♟', [KNIGHT]: '♞', [BISHOP]: '♝', [ROOK]: '♜', [QUEEN]: '♛', [KING]: '♚' }
const PIECE_NAMES = { [PAWN]: '', [KNIGHT]: 'N', [BISHOP]: 'B', [ROOK]: 'R', [QUEEN]: 'Q', [KING]: 'K' }

// Material values (centipawns)
const PIECE_VAL = { [PAWN]: 100, [KNIGHT]: 320, [BISHOP]: 330, [ROOK]: 500, [QUEEN]: 900, [KING]: 20000 }

// 10x12 mailbox (maps 8x8 index to 10x12 index and back)
const SQ120 = [] // 64 -> 120
const SQ64  = [] // 120 -> 64

function initMailbox() {
  for (let i = 0; i < 120; i++) SQ64[i] = -1
  let sq64 = 0
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const sq120 = (r + 2) * 10 + f + 1
      SQ120[sq64] = sq120
      SQ64[sq120] = sq64
      sq64++
    }
  }
}
initMailbox()

// Direction offsets in 10x12
const KNIGHT_OFFSETS = [-21, -19, -12, -8, 8, 12, 19, 21]
const BISHOP_OFFSETS = [-11, -9, 9, 11]
const ROOK_OFFSETS   = [-10, -1, 1, 10]
const QUEEN_OFFSETS  = [-11, -9, 9, 11, -10, -1, 1, 10]
const KING_OFFSETS   = [-11, -9, 9, 11, -10, -1, 1, 10]

// Piece-Square Tables (from white's perspective, index 0 = a8)
// Flipped for black at evaluation time
const PST = {
  [PAWN]: [
     0,  0,  0,  0,  0,  0,  0,  0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
     5,  5, 10, 25, 25, 10,  5,  5,
     0,  0,  0, 20, 20,  0,  0,  0,
     5, -5,-10,  0,  0,-10, -5,  5,
     5, 10, 10,-20,-20, 10, 10,  5,
     0,  0,  0,  0,  0,  0,  0,  0,
  ],
  [KNIGHT]: [
   -50,-40,-30,-30,-30,-30,-40,-50,
   -40,-20,  0,  0,  0,  0,-20,-40,
   -30,  0, 10, 15, 15, 10,  0,-30,
   -30,  5, 15, 20, 20, 15,  5,-30,
   -30,  0, 15, 20, 20, 15,  0,-30,
   -30,  5, 10, 15, 15, 10,  5,-30,
   -40,-20,  0,  5,  5,  0,-20,-40,
   -50,-40,-30,-30,-30,-30,-40,-50,
  ],
  [BISHOP]: [
   -20,-10,-10,-10,-10,-10,-10,-20,
   -10,  0,  0,  0,  0,  0,  0,-10,
   -10,  0, 10, 10, 10, 10,  0,-10,
   -10,  5,  5, 10, 10,  5,  5,-10,
   -10,  0,  5, 10, 10,  5,  0,-10,
   -10, 10,  5, 10, 10,  5, 10,-10,
   -10,  5,  0,  0,  0,  0,  5,-10,
   -20,-10,-10,-10,-10,-10,-10,-20,
  ],
  [ROOK]: [
     0,  0,  0,  0,  0,  0,  0,  0,
     5, 10, 10, 10, 10, 10, 10,  5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
     0,  0,  0,  5,  5,  0,  0,  0,
  ],
  [QUEEN]: [
   -20,-10,-10, -5, -5,-10,-10,-20,
   -10,  0,  0,  0,  0,  0,  0,-10,
   -10,  0,  5,  5,  5,  5,  0,-10,
    -5,  0,  5,  5,  5,  5,  0, -5,
     0,  0,  5,  5,  5,  5,  0, -5,
   -10,  5,  5,  5,  5,  5,  0,-10,
   -10,  0,  5,  0,  0,  0,  0,-10,
   -20,-10,-10, -5, -5,-10,-10,-20,
  ],
  [KING]: [
   -30,-40,-40,-50,-50,-40,-40,-30,
   -30,-40,-40,-50,-50,-40,-40,-30,
   -30,-40,-40,-50,-50,-40,-40,-30,
   -30,-40,-40,-50,-50,-40,-40,-30,
   -20,-30,-30,-40,-40,-30,-30,-20,
   -10,-20,-20,-20,-20,-20,-20,-10,
    20, 20,  0,  0,  0,  0, 20, 20,
    20, 30, 10,  0,  0, 10, 30, 20,
  ],
}

// ─── Board State ─────────────────────────────────────────────────────────────

function createBoard() {
  // 10x12 board array
  const board = new Array(120).fill(OFF)
  // Mark valid squares
  for (let i = 0; i < 64; i++) board[SQ120[i]] = EMPTY

  const colors = new Array(120).fill(-1)

  // Place pieces
  const backRank = [ROOK, KNIGHT, BISHOP, QUEEN, KING, BISHOP, KNIGHT, ROOK]

  for (let f = 0; f < 8; f++) {
    // Black back rank (rank 8 = row 0)
    const bBack = SQ120[f]
    board[bBack] = backRank[f]
    colors[bBack] = BLACK
    // Black pawns (rank 7 = row 1)
    const bPawn = SQ120[8 + f]
    board[bPawn] = PAWN
    colors[bPawn] = BLACK
    // White pawns (rank 2 = row 6)
    const wPawn = SQ120[48 + f]
    board[wPawn] = PAWN
    colors[wPawn] = WHITE
    // White back rank (rank 1 = row 7)
    const wBack = SQ120[56 + f]
    board[wBack] = backRank[f]
    colors[wBack] = WHITE
  }

  return {
    board: board,
    colors: colors,
    side: WHITE,
    castlePerm: 0b1111, // KQkq
    enPas: -1,
    halfMove: 0,
    history: [],       // array of move-undo data
    moveList: [],      // algebraic move list for display
    captured: { [WHITE]: [], [BLACK]: [] },
  }
}

// Castle permission bits
const WK_CASTLE = 0b0001
const WQ_CASTLE = 0b0010
const BK_CASTLE = 0b0100
const BQ_CASTLE = 0b1000

// Squares
const E1 = SQ120[60], G1 = SQ120[62], C1 = SQ120[58], F1 = SQ120[61], D1 = SQ120[59]
const A1 = SQ120[56], H1 = SQ120[63]
const E8 = SQ120[4],  G8 = SQ120[6],  C8 = SQ120[2],  F8 = SQ120[5],  D8 = SQ120[3]
const A8 = SQ120[0],  H8 = SQ120[7]

// Castle rook squares for updating permissions
const CASTLE_MASK = new Array(120).fill(0b1111)
CASTLE_MASK[E1] = 0b1100 // moving king loses both
CASTLE_MASK[A1] = 0b1101 // a1 rook => lose Q-side
CASTLE_MASK[H1] = 0b1110 // h1 rook => lose K-side
CASTLE_MASK[E8] = 0b0011
CASTLE_MASK[A8] = 0b0111
CASTLE_MASK[H8] = 0b1011

// ─── Move Generation ─────────────────────────────────────────────────────────

// Move encoding: { from, to, captured, promoted, flag }
// flags: 0=normal, 1=en passant, 2=castle, 3=pawn double

function isOnBoard(sq120) {
  return SQ64[sq120] !== -1 && SQ64[sq120] !== undefined
}

function isSquareAttacked(state, sq, bySide) {
  const { board, colors } = state

  // Pawn attacks
  // White pawn at P attacks P-11 and P-9 (diagonally up)
  // So sq is attacked by WHITE pawn if there's one at sq+11 or sq+9
  if (bySide === WHITE) {
    if (isOnBoard(sq + 11) && board[sq + 11] === PAWN && colors[sq + 11] === WHITE) return true
    if (isOnBoard(sq + 9)  && board[sq + 9]  === PAWN && colors[sq + 9]  === WHITE) return true
  } else {
    // Black pawn at P attacks P+9 and P+11 (diagonally down)
    // So sq is attacked by BLACK pawn if there's one at sq-9 or sq-11
    if (isOnBoard(sq - 9)  && board[sq - 9]  === PAWN && colors[sq - 9]  === BLACK) return true
    if (isOnBoard(sq - 11) && board[sq - 11] === PAWN && colors[sq - 11] === BLACK) return true
  }

  // Knight attacks
  for (const off of KNIGHT_OFFSETS) {
    const t = sq + off
    if (isOnBoard(t) && board[t] === KNIGHT && colors[t] === bySide) return true
  }

  // King attacks
  for (const off of KING_OFFSETS) {
    const t = sq + off
    if (isOnBoard(t) && board[t] === KING && colors[t] === bySide) return true
  }

  // Bishop/Queen (diagonal)
  for (const off of BISHOP_OFFSETS) {
    let t = sq + off
    while (isOnBoard(t)) {
      if (board[t] !== EMPTY) {
        if (colors[t] === bySide && (board[t] === BISHOP || board[t] === QUEEN)) return true
        break
      }
      t += off
    }
  }

  // Rook/Queen (straight)
  for (const off of ROOK_OFFSETS) {
    let t = sq + off
    while (isOnBoard(t)) {
      if (board[t] !== EMPTY) {
        if (colors[t] === bySide && (board[t] === ROOK || board[t] === QUEEN)) return true
        break
      }
      t += off
    }
  }

  return false
}

function findKing(state, side) {
  for (let i = 0; i < 64; i++) {
    const sq = SQ120[i]
    if (state.board[sq] === KING && state.colors[sq] === side) return sq
  }
  return -1
}

function generatePseudoMoves(state) {
  const { board, colors, side, castlePerm, enPas } = state
  const moves = []
  const enemy = 1 - side

  for (let i = 0; i < 64; i++) {
    const from = SQ120[i]
    if (board[from] === EMPTY || colors[from] !== side) continue
    const piece = board[from]

    if (piece === PAWN) {
      const dir = side === WHITE ? -10 : 10
      const startRank = side === WHITE ? 6 : 1 // row in 8x8
      const promoRank = side === WHITE ? 0 : 7

      // Single push
      const fwd = from + dir
      if (isOnBoard(fwd) && board[fwd] === EMPTY) {
        const toRow = Math.floor(SQ64[fwd] / 8)
        if (toRow === promoRank) {
          for (const pr of [QUEEN, ROOK, BISHOP, KNIGHT])
            moves.push({ from, to: fwd, captured: EMPTY, promoted: pr, flag: 0 })
        } else {
          moves.push({ from, to: fwd, captured: EMPTY, promoted: 0, flag: 0 })
          // Double push
          const fromRow = Math.floor(SQ64[from] / 8)
          if (fromRow === startRank) {
            const fwd2 = fwd + dir
            if (isOnBoard(fwd2) && board[fwd2] === EMPTY) {
              moves.push({ from, to: fwd2, captured: EMPTY, promoted: 0, flag: 3 })
            }
          }
        }
      }

      // Captures
      const capDirs = side === WHITE ? [-11, -9] : [9, 11]
      for (const cd of capDirs) {
        const t = from + cd
        if (!isOnBoard(t)) continue
        if (board[t] !== EMPTY && colors[t] === enemy) {
          const toRow = Math.floor(SQ64[t] / 8)
          if (toRow === promoRank) {
            for (const pr of [QUEEN, ROOK, BISHOP, KNIGHT])
              moves.push({ from, to: t, captured: board[t], promoted: pr, flag: 0 })
          } else {
            moves.push({ from, to: t, captured: board[t], promoted: 0, flag: 0 })
          }
        }
        // En passant
        if (t === enPas) {
          moves.push({ from, to: t, captured: PAWN, promoted: 0, flag: 1 })
        }
      }

    } else if (piece === KNIGHT) {
      for (const off of KNIGHT_OFFSETS) {
        const t = from + off
        if (!isOnBoard(t)) continue
        if (board[t] === EMPTY) {
          moves.push({ from, to: t, captured: EMPTY, promoted: 0, flag: 0 })
        } else if (colors[t] === enemy) {
          moves.push({ from, to: t, captured: board[t], promoted: 0, flag: 0 })
        }
      }

    } else if (piece === KING) {
      for (const off of KING_OFFSETS) {
        const t = from + off
        if (!isOnBoard(t)) continue
        if (board[t] === EMPTY) {
          moves.push({ from, to: t, captured: EMPTY, promoted: 0, flag: 0 })
        } else if (colors[t] === enemy) {
          moves.push({ from, to: t, captured: board[t], promoted: 0, flag: 0 })
        }
      }

      // Castling
      if (side === WHITE && from === E1) {
        if ((castlePerm & WK_CASTLE) && board[F1] === EMPTY && board[G1] === EMPTY) {
          if (!isSquareAttacked(state, E1, BLACK) && !isSquareAttacked(state, F1, BLACK) && !isSquareAttacked(state, G1, BLACK)) {
            moves.push({ from: E1, to: G1, captured: EMPTY, promoted: 0, flag: 2 })
          }
        }
        if ((castlePerm & WQ_CASTLE) && board[D1] === EMPTY && board[C1] === EMPTY && board[SQ120[57]] === EMPTY) {
          if (!isSquareAttacked(state, E1, BLACK) && !isSquareAttacked(state, D1, BLACK) && !isSquareAttacked(state, C1, BLACK)) {
            moves.push({ from: E1, to: C1, captured: EMPTY, promoted: 0, flag: 2 })
          }
        }
      }
      if (side === BLACK && from === E8) {
        if ((castlePerm & BK_CASTLE) && board[F8] === EMPTY && board[G8] === EMPTY) {
          if (!isSquareAttacked(state, E8, WHITE) && !isSquareAttacked(state, F8, WHITE) && !isSquareAttacked(state, G8, WHITE)) {
            moves.push({ from: E8, to: G8, captured: EMPTY, promoted: 0, flag: 2 })
          }
        }
        if ((castlePerm & BQ_CASTLE) && board[D8] === EMPTY && board[C8] === EMPTY && board[SQ120[1]] === EMPTY) {
          if (!isSquareAttacked(state, E8, WHITE) && !isSquareAttacked(state, D8, WHITE) && !isSquareAttacked(state, C8, WHITE)) {
            moves.push({ from: E8, to: C8, captured: EMPTY, promoted: 0, flag: 2 })
          }
        }
      }

    } else {
      // Sliding pieces: bishop, rook, queen
      const offsets = piece === BISHOP ? BISHOP_OFFSETS
                    : piece === ROOK   ? ROOK_OFFSETS
                    : QUEEN_OFFSETS

      for (const off of offsets) {
        let t = from + off
        while (isOnBoard(t)) {
          if (board[t] === EMPTY) {
            moves.push({ from, to: t, captured: EMPTY, promoted: 0, flag: 0 })
          } else {
            if (colors[t] === enemy) {
              moves.push({ from, to: t, captured: board[t], promoted: 0, flag: 0 })
            }
            break
          }
          t += off
        }
      }
    }
  }

  return moves
}

function makeMove(state, move) {
  const { board, colors, side } = state
  const { from, to, captured, promoted, flag } = move

  // Save undo info
  const undo = {
    move,
    castlePerm: state.castlePerm,
    enPas: state.enPas,
    halfMove: state.halfMove,
  }

  // En passant capture — remove the actual pawn
  if (flag === 1) {
    const epCapSq = side === WHITE ? to + 10 : to - 10
    board[epCapSq] = EMPTY
    colors[epCapSq] = -1
  }

  // Castling — move the rook
  if (flag === 2) {
    if (to === G1) { board[H1] = EMPTY; colors[H1] = -1; board[F1] = ROOK; colors[F1] = WHITE }
    if (to === C1) { board[A1] = EMPTY; colors[A1] = -1; board[D1] = ROOK; colors[D1] = WHITE }
    if (to === G8) { board[H8] = EMPTY; colors[H8] = -1; board[F8] = ROOK; colors[F8] = BLACK }
    if (to === C8) { board[A8] = EMPTY; colors[A8] = -1; board[D8] = ROOK; colors[D8] = BLACK }
  }

  // Update castle permissions
  state.castlePerm &= CASTLE_MASK[from]
  state.castlePerm &= CASTLE_MASK[to]

  // En passant square
  state.enPas = -1
  if (flag === 3) {
    state.enPas = from + (side === WHITE ? -10 : 10)
  }

  // Move piece
  board[to] = promoted || board[from]
  colors[to] = side
  board[from] = EMPTY
  colors[from] = -1

  // Half move clock
  if (board[to] === PAWN || captured !== EMPTY) {
    state.halfMove = 0
  } else {
    state.halfMove++
  }

  state.side = 1 - side
  state.history.push(undo)

  return undo
}

function undoMove(state, undo) {
  const { move } = undo
  const { from, to, captured, promoted, flag } = move

  state.side = 1 - state.side
  const side = state.side

  // Move piece back
  board_set: {
    state.board[from] = promoted ? PAWN : state.board[to]
    state.colors[from] = side
    state.board[to] = EMPTY
    state.colors[to] = -1
  }

  // Restore captured piece
  if (flag === 1) {
    // En passant — put pawn back
    const epCapSq = side === WHITE ? to + 10 : to - 10
    state.board[epCapSq] = PAWN
    state.colors[epCapSq] = 1 - side
  } else if (captured !== EMPTY) {
    state.board[to] = captured
    state.colors[to] = 1 - side
  }

  // Undo castling rook
  if (flag === 2) {
    if (to === G1) { state.board[F1] = EMPTY; state.colors[F1] = -1; state.board[H1] = ROOK; state.colors[H1] = WHITE }
    if (to === C1) { state.board[D1] = EMPTY; state.colors[D1] = -1; state.board[A1] = ROOK; state.colors[A1] = WHITE }
    if (to === G8) { state.board[F8] = EMPTY; state.colors[F8] = -1; state.board[H8] = ROOK; state.colors[H8] = BLACK }
    if (to === C8) { state.board[D8] = EMPTY; state.colors[D8] = -1; state.board[A8] = ROOK; state.colors[A8] = BLACK }
  }

  state.castlePerm = undo.castlePerm
  state.enPas = undo.enPas
  state.halfMove = undo.halfMove
  state.history.pop()
}

function generateLegalMoves(state) {
  const pseudo = generatePseudoMoves(state)
  const legal = []
  const side = state.side

  for (const move of pseudo) {
    const undo = makeMove(state, move)
    const kingSq = findKing(state, side)
    if (kingSq !== -1 && !isSquareAttacked(state, kingSq, 1 - side)) {
      legal.push(move)
    }
    undoMove(state, undo)
  }

  return legal
}

function isInCheck(state) {
  const kingSq = findKing(state, state.side)
  return kingSq !== -1 && isSquareAttacked(state, kingSq, 1 - state.side)
}

// ─── Evaluation ──────────────────────────────────────────────────────────────

function evaluate(state) {
  let score = 0

  for (let i = 0; i < 64; i++) {
    const sq = SQ120[i]
    const piece = state.board[sq]
    if (piece === EMPTY) continue
    const color = state.colors[sq]

    const val = PIECE_VAL[piece]
    // PST index: for white use i directly, for black mirror vertically
    const pstIdx = color === WHITE ? i : (56 - (i & ~7)) + (i & 7)
    const pst = PST[piece] ? PST[piece][pstIdx] : 0

    if (color === WHITE) {
      score += val + pst
    } else {
      score -= val + pst
    }
  }

  return state.side === WHITE ? score : -score
}

// ─── Search (Alpha-Beta with Iterative Deepening) ───────────────────────────

function orderMoves(moves) {
  return moves.sort((a, b) => {
    // Captures first, ordered by MVV-LVA
    const aCapVal = a.captured ? PIECE_VAL[a.captured] || 0 : 0
    const bCapVal = b.captured ? PIECE_VAL[b.captured] || 0 : 0
    if (aCapVal !== bCapVal) return bCapVal - aCapVal
    // Promotions
    const aPromo = a.promoted ? PIECE_VAL[a.promoted] || 0 : 0
    const bPromo = b.promoted ? PIECE_VAL[b.promoted] || 0 : 0
    return bPromo - aPromo
  })
}

function quiescence(state, alpha, beta, searchInfo, qDepth) {
  if (qDepth === undefined) qDepth = 0
  searchInfo.nodes++

  const standPat = evaluate(state)
  if (standPat >= beta) return beta
  if (standPat > alpha) alpha = standPat

  // Depth limit on quiescence to prevent explosion
  if (qDepth >= 8) return standPat

  const moves = generateLegalMoves(state)
  const captures = orderMoves(moves.filter(m => m.captured !== EMPTY || m.promoted))

  for (const move of captures) {
    // Delta pruning: skip captures that can't possibly raise alpha
    // even if we win the captured piece
    if (standPat + PIECE_VAL[move.captured || 0] + 200 < alpha && !move.promoted) continue

    const undo = makeMove(state, move)
    const score = -quiescence(state, -beta, -alpha, searchInfo, qDepth + 1)
    undoMove(state, undo)

    if (score >= beta) return beta
    if (score > alpha) alpha = score
  }

  return alpha
}

function alphaBeta(state, depth, alpha, beta, searchInfo) {
  if (depth <= 0) return quiescence(state, alpha, beta, searchInfo, 0)

  searchInfo.nodes++
  const moves = orderMoves(generateLegalMoves(state))

  if (moves.length === 0) {
    if (isInCheck(state)) return -99999 + (searchInfo.maxDepth - depth) // checkmate (prefer shorter mate)
    return 0 // stalemate
  }

  let bestMove = null

  for (const move of moves) {
    const undo = makeMove(state, move)
    const score = -alphaBeta(state, depth - 1, -beta, -alpha, searchInfo)
    undoMove(state, undo)

    if (score >= beta) return beta
    if (score > alpha) {
      alpha = score
      bestMove = move
      if (depth === searchInfo.maxDepth) {
        searchInfo.bestMove = move
      }
    }
  }

  return alpha
}

function searchBestMove(state, maxDepth, onProgress) {
  const searchInfo = { nodes: 0, bestMove: null, maxDepth: 1, pv: [] }
  let bestMove = null
  let bestScore = 0
  const startTime = performance.now()

  // Iterative deepening
  for (let d = 1; d <= maxDepth; d++) {
    searchInfo.maxDepth = d
    searchInfo.bestMove = null
    const score = alphaBeta(state, d, -100000, 100000, searchInfo)

    if (searchInfo.bestMove) {
      bestMove = searchInfo.bestMove
      bestScore = score
    }

    const elapsed = performance.now() - startTime
    if (onProgress) {
      onProgress({ depth: d, nodes: searchInfo.nodes, time: elapsed, score: bestScore })
    }

    // Time limit: break if taking too long
    if (elapsed > 4000 && d >= 2) break
  }

  return { move: bestMove, score: bestScore, nodes: searchInfo.nodes, time: performance.now() - startTime }
}

// ─── Utility ─────────────────────────────────────────────────────────────────

function sq120ToAlg(sq) {
  const idx = SQ64[sq]
  const file = idx % 8
  const rank = 7 - Math.floor(idx / 8)
  return String.fromCharCode(97 + file) + (rank + 1)
}

function moveToAlg(move, state) {
  const to = sq120ToAlg(move.to)
  const piece = move.promoted ? PAWN : (state ? state.board[move.from] : 0)
  const pieceName = piece ? PIECE_NAMES[piece] : ''
  const isCapture = move.captured !== EMPTY
  const promo = move.promoted ? '=' + PIECE_NAMES[move.promoted] : ''

  // Castling
  if (move.flag === 2) {
    const toFile = SQ64[move.to] % 8
    return toFile > 4 ? 'O-O' : 'O-O-O'
  }

  // Pawn moves
  if (piece === PAWN || !pieceName) {
    const fromFile = String.fromCharCode(97 + (SQ64[move.from] % 8))
    if (isCapture) return fromFile + 'x' + to + promo
    return to + promo
  }

  // Piece moves (N, B, R, Q, K)
  const capture = isCapture ? 'x' : ''
  // Disambiguation: check if another piece of same type can go to same square
  let disambig = ''
  if (state && (piece === KNIGHT || piece === ROOK || piece === QUEEN || piece === BISHOP)) {
    const side = state.colors[move.from]
    for (let i = 0; i < 64; i++) {
      const sq = SQ120[i]
      if (sq === move.from) continue
      if (state.board[sq] === piece && state.colors[sq] === side) {
        // Check if this other piece can also reach move.to (pseudo check is fine for notation)
        const fromFile = SQ64[move.from] % 8
        const otherFile = i % 8
        const fromRank = Math.floor(SQ64[move.from] / 8)
        const otherRank = Math.floor(i / 8)
        if (fromFile !== otherFile) disambig = String.fromCharCode(97 + fromFile)
        else if (fromRank !== otherRank) disambig = String(8 - fromRank)
        else disambig = String.fromCharCode(97 + fromFile) + (8 - fromRank)
        break
      }
    }
  }
  return pieceName + disambig + capture + to
}

function cloneState(state) {
  return {
    board: [...state.board],
    colors: [...state.colors],
    side: state.side,
    castlePerm: state.castlePerm,
    enPas: state.enPas,
    halfMove: state.halfMove,
    history: state.history.map(h => ({ ...h, move: { ...h.move } })),
    moveList: [...state.moveList],
    captured: {
      [WHITE]: [...state.captured[WHITE]],
      [BLACK]: [...state.captured[BLACK]],
    },
  }
}

// ─── React Component ─────────────────────────────────────────────────────────

export default function ChessEngine() {
  const [gameState, setGameState] = useState(() => createBoard())
  const [selected, setSelected] = useState(null) // sq120 of selected piece
  const [legalMoves, setLegalMoves] = useState([]) // legal moves from selected
  const [lastMove, setLastMove] = useState(null) // { from, to }
  const [aiThinking, setAiThinking] = useState(false)
  const [aiDepth, setAiDepth] = useState(3)
  const [aiInfo, setAiInfo] = useState({ depth: 0, nodes: 0, time: 0, score: 0 })
  const [gameOver, setGameOver] = useState(null) // null | 'checkmate' | 'stalemate' | 'draw'
  const [winner, setWinner] = useState(null) // WHITE | BLACK | null
  const [promoSquare, setPromoSquare] = useState(null) // { from, to } if promotion choice needed
  const [showBestMoves, setShowBestMoves] = useState(false)
  const [bestMoves, setBestMoves] = useState([]) // top moves with eval
  const [arrows, setArrows] = useState([]) // [{from: {row,col}, to: {row,col}}]
  const [highlights, setHighlights] = useState([]) // [{row,col}]
  const [drawStart, setDrawStart] = useState(null) // {row,col} for right-click drag start
  const [drawCurrent, setDrawCurrent] = useState(null) // {row,col} while dragging
  const [dragSq, setDragSq] = useState(null) // sq120 of piece being dragged (for ghost opacity)
  const dragRef = useRef(null) // ref to floating drag element — position updated via DOM, no re-renders
  const dragDataRef = useRef(null) // {sq120, legalMoves} during drag
  const boardRef = useRef(null)
  const stateRef = useRef(gameState)

  useEffect(() => { stateRef.current = gameState }, [gameState])

  const checkGameEnd = useCallback((state) => {
    const moves = generateLegalMoves(state)
    if (moves.length === 0) {
      if (isInCheck(state)) {
        setGameOver('checkmate')
        setWinner(1 - state.side)
      } else {
        setGameOver('stalemate')
      }
      return true
    }
    if (state.halfMove >= 100) {
      setGameOver('draw')
      return true
    }
    // Insufficient material check (K vs K, K+B vs K, K+N vs K)
    const pieces = { [WHITE]: [], [BLACK]: [] }
    for (let i = 0; i < 64; i++) {
      const sq = SQ120[i]
      if (state.board[sq] !== EMPTY) {
        pieces[state.colors[sq]].push(state.board[sq])
      }
    }
    const wp = pieces[WHITE].filter(p => p !== KING)
    const bp = pieces[BLACK].filter(p => p !== KING)
    if (wp.length === 0 && bp.length === 0) {
      setGameOver('draw')
      return true
    }
    if (wp.length === 0 && bp.length === 1 && (bp[0] === BISHOP || bp[0] === KNIGHT)) {
      setGameOver('draw')
      return true
    }
    if (bp.length === 0 && wp.length === 1 && (wp[0] === BISHOP || wp[0] === KNIGHT)) {
      setGameOver('draw')
      return true
    }
    return false
  }, [])

  const executeMove = useCallback((state, move) => {
    const newState = cloneState(state)
    const movingSide = newState.side

    // Track captures for display (captured piece belongs to enemy)
    if (move.captured !== EMPTY) {
      newState.captured[1 - movingSide].push(move.captured)
    }

    const alg = moveToAlg(move, newState)
    makeMove(newState, move)
    newState.moveList.push(alg)
    setLastMove({ from: move.from, to: move.to })
    setSelected(null)
    setLegalMoves([])
    setGameState(newState)
    return newState
  }, [])

  // Compute best moves for recommendation panel using shallow search (not just static eval)
  const computeBestMoves = useCallback((state) => {
    if (state.side !== WHITE) return
    const moves = orderMoves(generateLegalMoves(state))
    const scored = []
    const searchInfo = { nodes: 0, bestMove: null, maxDepth: 2 }
    for (const move of moves) {
      const undo = makeMove(state, move)
      // Search 2-ply deep + quiescence so it sees recaptures
      const score = -alphaBeta(state, 2, -100000, 100000, searchInfo)
      undoMove(state, undo)
      scored.push({ move, score, alg: moveToAlg(move, state) })
    }
    scored.sort((a, b) => b.score - a.score)
    setBestMoves(scored.slice(0, 5))
  }, [])

  const runAI = useCallback((state) => {
    if (state.side !== BLACK) return
    setAiThinking(true)

    // Quick pondering eval before full search
    const quickEval = evaluate(state)
    setAiInfo(prev => ({ ...prev, score: -quickEval }))

    // Use setTimeout to let React render the thinking state
    setTimeout(() => {
      const result = searchBestMove(state, aiDepth, (info) => {
        setAiInfo({ ...info })
      })

      if (result.move) {
        const newState = cloneState(state)
        if (result.move.captured !== EMPTY) {
          newState.captured[WHITE].push(result.move.captured)
        }
        const aiAlg = moveToAlg(result.move, newState)
        makeMove(newState, result.move)
        newState.moveList.push(aiAlg)
        setLastMove({ from: result.move.from, to: result.move.to })
        setGameState(newState)
        setAiInfo({ depth: result.depth || aiDepth, nodes: result.nodes, time: result.time, score: result.score })
        setAiThinking(false)

        // Check game end after AI move
        if (!checkGameEnd(newState)) {
          // Compute best moves for player's next turn
          computeBestMoves(newState)
        }
      } else {
        setAiThinking(false)
      }
    }, 50)
  }, [aiDepth, checkGameEnd, computeBestMoves])

  const handleSquareClick = useCallback((sq120) => {
    if (aiThinking || gameOver) return
    const state = stateRef.current
    if (state.side !== WHITE) return

    // Promotion selection active
    if (promoSquare) return

    if (selected !== null) {
      // Deselect if clicking same square
      if (sq120 === selected) {
        setSelected(null)
        setLegalMoves([])
        return
      }

      // Try to find a legal move to this square
      const promoMoves = legalMoves.filter(m => m.to === sq120 && m.promoted)
      if (promoMoves.length > 0) {
        setPromoSquare({ from: selected, to: sq120, moves: promoMoves })
        return
      }

      const move = legalMoves.find(m => m.to === sq120)
      if (move) {
        const newState = executeMove(state, move)
        if (!checkGameEnd(newState)) {
          runAI(newState)
        }
        return
      }

      // No legal move to this square — if it's our own piece, re-select it
      if (state.board[sq120] !== EMPTY && state.colors[sq120] === WHITE) {
        setSelected(sq120)
        const allLegal = generateLegalMoves(state)
        setLegalMoves(allLegal.filter(m => m.from === sq120))
        return
      }

      // Clicked empty square or enemy with no legal move — just deselect
      setSelected(null)
      setLegalMoves([])
      return
    }

    // No piece selected — select if it's our piece
    if (state.board[sq120] !== EMPTY && state.colors[sq120] === WHITE) {
      setSelected(sq120)
      const allLegal = generateLegalMoves(state)
      setLegalMoves(allLegal.filter(m => m.from === sq120))
    }
  }, [selected, legalMoves, aiThinking, gameOver, promoSquare, executeMove, checkGameEnd, runAI])

  const handlePromoChoice = useCallback((piece) => {
    if (!promoSquare) return
    const move = promoSquare.moves.find(m => m.promoted === piece)
    if (move) {
      const newState = executeMove(stateRef.current, move)
      setPromoSquare(null)
      if (!checkGameEnd(newState)) {
        runAI(newState)
      }
    }
  }, [promoSquare, executeMove, checkGameEnd, runAI])

  const newGame = useCallback(() => {
    const s = createBoard()
    setGameState(s)
    setSelected(null)
    setLegalMoves([])
    setLastMove(null)
    setAiThinking(false)
    setGameOver(null)
    setWinner(null)
    setPromoSquare(null)
    setAiInfo({ depth: 0, nodes: 0, time: 0, score: 0 })
  }, [])

  const undoMove2 = useCallback(() => {
    if (aiThinking) return
    const state = cloneState(stateRef.current)
    // Undo 2 moves (player + AI) if possible
    let undoCount = state.side === WHITE ? 2 : 1
    if (state.history.length < undoCount) undoCount = state.history.length

    for (let i = 0; i < undoCount; i++) {
      if (state.history.length === 0) break
      const undo = state.history[state.history.length - 1]

      // Remove from captured: the last move was by (1 - state.side),
      // which captured from state.side's pieces -> captured[state.side]
      // But wait: if BLACK just moved and captured white, it went into captured[WHITE].
      // state.side is currently WHITE (next to move). The mover was BLACK.
      // BLACK captured a WHITE piece => captured[WHITE]. So arr = captured[state.side].
      if (undo.move.captured !== EMPTY) {
        const arr = state.captured[state.side]
        const idx = arr.lastIndexOf(undo.move.captured)
        if (idx >= 0) arr.splice(idx, 1)
      }

      undoMove(state, undo)
      state.moveList.pop()
    }

    setGameState(state)
    setSelected(null)
    setLegalMoves([])
    setGameOver(null)
    setWinner(null)
    setPromoSquare(null)
    if (state.moveList.length >= 2) {
      // reconstruct last move from moveList - simplified
      setLastMove(null)
    } else {
      setLastMove(null)
    }
  }, [aiThinking])

  // Arrow drawing helpers
  const getBoardCoords = useCallback((e) => {
    const board = boardRef.current
    if (!board) return null
    const rect = board.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const sqSize = rect.width / 8
    const col = Math.floor(x / sqSize)
    const row = Math.floor(y / sqSize)
    if (row < 0 || row > 7 || col < 0 || col > 7) return null
    return { row, col }
  }, [])

  const handleBoardContextMenu = useCallback((e) => {
    e.preventDefault()
  }, [])

  const startDrag = useCallback((sq120, e) => {
    const state = stateRef.current
    const piece = state.board[sq120]
    const pieceChar = PIECE_CHARS_W[piece]
    const el = dragRef.current
    if (!el || !boardRef.current) return

    const rect = boardRef.current.getBoundingClientRect()
    el.textContent = pieceChar
    el.style.display = 'block'
    el.style.left = (e.clientX - rect.left) + 'px'
    el.style.top = (e.clientY - rect.top) + 'px'

    const allLegal = generateLegalMoves(state)
    dragDataRef.current = { sq120, moves: allLegal.filter(m => m.from === sq120) }
    setDragSq(sq120)
    setSelected(sq120)
    setLegalMoves(allLegal.filter(m => m.from === sq120))
  }, [])

  const endDrag = useCallback(() => {
    const el = dragRef.current
    if (el) el.style.display = 'none'
    dragDataRef.current = null
    setDragSq(null)
  }, [])

  const handleBoardMouseDown = useCallback((e) => {
    if (e.button === 2) {
      e.preventDefault()
      const coords = getBoardCoords(e)
      if (coords) setDrawStart(coords)
    } else if (e.button === 0) {
      setArrows([])
      setHighlights([])

      if (!aiThinking && !gameOver && !promoSquare) {
        const state = stateRef.current
        if (state.side !== WHITE) return
        const coords = getBoardCoords(e)
        if (!coords) return
        const sq120 = SQ120[coords.row * 8 + coords.col]
        if (state.board[sq120] !== EMPTY && state.colors[sq120] === WHITE) {
          startDrag(sq120, e)
        }
      }
    }
  }, [getBoardCoords, aiThinking, gameOver, promoSquare, startDrag])

  const handleBoardMouseMove = useCallback((e) => {
    if (drawStart && e.buttons === 2) {
      const coords = getBoardCoords(e)
      if (coords) setDrawCurrent(coords)
    }
    // Update floating drag piece via DOM (no state, no re-render)
    if (dragDataRef.current && e.buttons === 1) {
      const el = dragRef.current
      const rect = boardRef.current?.getBoundingClientRect()
      if (el && rect) {
        el.style.left = (e.clientX - rect.left) + 'px'
        el.style.top = (e.clientY - rect.top) + 'px'
      }
    }
  }, [drawStart, getBoardCoords])

  const handleBoardMouseUp = useCallback((e) => {
    // Handle drag-and-drop on left click release
    if (e.button === 0 && dragDataRef.current) {
      const { sq120: fromSq, moves } = dragDataRef.current
      const coords = getBoardCoords(e)
      endDrag()

      if (coords) {
        const targetSq120 = SQ120[coords.row * 8 + coords.col]
        if (targetSq120 !== fromSq) {
          const state = stateRef.current
          const promoMoves = moves.filter(m => m.to === targetSq120 && m.promoted)
          const move = moves.find(m => m.to === targetSq120 && !m.promoted)

          if (promoMoves.length > 0) {
            setPromoSquare({ from: fromSq, to: targetSq120, moves: promoMoves })
          } else if (move) {
            const newState = executeMove(state, move)
            if (!checkGameEnd(newState)) {
              runAI(newState)
            }
          }
        }
      }
      return
    }

    if (e.button === 2 && drawStart) {
      const end = getBoardCoords(e)
      if (end) {
        if (drawStart.row === end.row && drawStart.col === end.col) {
          // Same square — toggle highlight
          setHighlights(prev => {
            const exists = prev.findIndex(h => h.row === end.row && h.col === end.col)
            if (exists >= 0) return prev.filter((_, i) => i !== exists)
            return [...prev, end]
          })
        } else {
          // Different square — toggle arrow
          setArrows(prev => {
            const exists = prev.findIndex(a =>
              a.from.row === drawStart.row && a.from.col === drawStart.col &&
              a.to.row === end.row && a.to.col === end.col
            )
            if (exists >= 0) return prev.filter((_, i) => i !== exists)
            return [...prev, { from: drawStart, to: end }]
          })
        }
      }
      setDrawStart(null)
      setDrawCurrent(null)
    }
  }, [drawStart, getBoardCoords])

  // Replace piece letters with Unicode symbols for display
  const fancyMove = (alg, isWhite) => {
    if (!alg) return ''
    const map = isWhite
      ? { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘' }
      : { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞' }
    if (alg === 'O-O' || alg === 'O-O-O') return alg
    // Check if first char is a piece letter
    if ('KQRBN'.includes(alg[0])) {
      return map[alg[0]] + alg.slice(1)
    }
    return alg
  }

  // Render board
  const renderBoard = () => {
    const squares = []
    const legalTargets = new Set(legalMoves.map(m => m.to))

    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const idx64 = row * 8 + col
        const sq120 = SQ120[idx64]
        const isLight = (row + col) % 2 === 0
        const piece = gameState.board[sq120]
        const color = gameState.colors[sq120]

        const isSelected = sq120 === selected
        const isLegalTarget = legalTargets.has(sq120)
        const isLastFrom = lastMove && sq120 === lastMove.from
        const isLastTo = lastMove && sq120 === lastMove.to

        const isHighlighted = highlights.some(h => h.row === row && h.col === col)

        let bgColor = isLight ? '#ebecd0' : '#779952'
        if (isHighlighted) bgColor = isLight ? '#eb6a5a' : '#d44a3a'
        else if (isSelected) bgColor = isLight ? '#f7f769' : '#bbcc44'
        else if (isLastFrom || isLastTo) bgColor = isLight ? '#f5f682' : '#b9ca43'

        const pieceChar = piece !== EMPTY
          ? (color === WHITE ? PIECE_CHARS_W[piece] : PIECE_CHARS_B[piece])
          : null

        squares.push(
          <div
            key={idx64}
            onClick={() => handleSquareClick(sq120)}
            style={{
              backgroundColor: bgColor,
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              userSelect: 'none',
              transition: 'background-color 0.15s',
            }}
          >
            {/* Coordinate labels */}
            {col === 0 && (
              <span style={{
                position: 'absolute', top: 2, left: 3,
                fontSize: '0.65rem', fontWeight: 700,
                color: isLight ? '#779952' : '#ebecd0',
                lineHeight: 1,
              }}>
                {8 - row}
              </span>
            )}
            {row === 7 && (
              <span style={{
                position: 'absolute', bottom: 1, right: 3,
                fontSize: '0.65rem', fontWeight: 700,
                color: isLight ? '#779952' : '#ebecd0',
                lineHeight: 1,
              }}>
                {String.fromCharCode(97 + col)}
              </span>
            )}
            {/* Legal move dot */}
            {isLegalTarget && !pieceChar && (
              <div style={{
                width: '28%', height: '28%', borderRadius: '50%',
                backgroundColor: 'rgba(0,0,0,0.18)',
              }} />
            )}
            {/* Legal capture ring */}
            {isLegalTarget && pieceChar && (
              <div style={{
                position: 'absolute', inset: '4%',
                borderRadius: '50%',
                border: '3px solid rgba(0,0,0,0.22)',
                pointerEvents: 'none',
              }} />
            )}
            {/* Piece */}
            {pieceChar && (
              <span style={{
                fontSize: 'min(5.5vw, 46px)',
                lineHeight: 1,
                color: color === WHITE ? '#fff' : '#1a1a1a',
                textShadow: color === WHITE
                  ? '0 0 2px rgba(0,0,0,0.8), 0 1px 3px rgba(0,0,0,0.5), 1px 0 0 rgba(0,0,0,0.4), -1px 0 0 rgba(0,0,0,0.4), 0 -1px 0 rgba(0,0,0,0.4), 0 1px 0 rgba(0,0,0,0.4)'
                  : '0 0 2px rgba(0,0,0,0.5), 0 1px 2px rgba(0,0,0,0.3)',
                transition: 'transform 0.1s',
                opacity: dragSq === sq120 ? 0.3 : 1,
              }}>
                {pieceChar}
              </span>
            )}
          </div>
        )
      }
    }
    return squares
  }

  // Evaluation bar
  const evalScore = aiInfo.score || 0
  // Convert centipawn score to bar percentage (clamp between -1000 and 1000)
  const clampedEval = Math.max(-1000, Math.min(1000, -evalScore)) // negative because AI is black
  const evalPct = 50 + (clampedEval / 1000) * 50

  // Captured pieces display
  const renderCaptured = (side) => {
    const pieces = gameState.captured[side]
    const charMap = side === WHITE ? PIECE_CHARS_W : PIECE_CHARS_B
    const sorted = [...pieces].sort((a, b) => PIECE_VAL[b] - PIECE_VAL[a])
    return sorted.map((p, i) => (
      <span key={i} style={{ fontSize: '1rem', opacity: 0.85 }}>{charMap[p]}</span>
    ))
  }

  // Material advantage
  const materialDiff = () => {
    let diff = 0
    gameState.captured[WHITE].forEach(p => diff -= PIECE_VAL[p]) // white lost
    gameState.captured[BLACK].forEach(p => diff += PIECE_VAL[p]) // black lost
    return diff
  }

  const matDiff = materialDiff()

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: '16px', padding: '20px 10px', color: '#e2e8f0',
      fontFamily: "'Inter', system-ui, sans-serif",
      maxWidth: '960px', margin: '0 auto',
    }}>
      {/* Title */}
      <div style={{ textAlign: 'center', marginBottom: 4 }}>
        <h2 style={{
          fontSize: '1.5rem', fontWeight: 700, margin: 0,
          background: 'linear-gradient(135deg, #60a5fa, #a78bfa)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>
          Chess Engine
        </h2>
        <p style={{ fontSize: '0.75rem', color: '#64748b', margin: '4px 0 0' }}>
          Alpha-Beta Pruning with Iterative Deepening
        </p>
      </div>

      {/* Main layout */}
      <div style={{
        display: 'flex', gap: '16px', width: '100%',
        justifyContent: 'center', flexWrap: 'wrap',
        alignItems: 'flex-start',
      }}>
        {/* Eval bar + Board */}
        <div style={{ display: 'flex', gap: '6px' }}>
          {/* Eval bar */}
          <div style={{
            width: '20px', borderRadius: '4px', overflow: 'hidden',
            border: '1px solid rgba(255,255,255,0.1)',
            display: 'flex', flexDirection: 'column',
            aspectRatio: '20 / 480',
            minHeight: '200px',
            maxHeight: '480px',
            alignSelf: 'stretch',
          }}>
            <div style={{
              flex: `${100 - evalPct} 0 0`, background: '#1a1a2e',
              transition: 'flex 0.5s ease',
              display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
              paddingBottom: 2,
            }}>
              {evalScore < 0 && (
                <span style={{ fontSize: '0.5rem', color: '#ccc', writingMode: 'vertical-rl' }}>
                  {(-evalScore / 100).toFixed(1)}
                </span>
              )}
            </div>
            <div style={{
              flex: `${evalPct} 0 0`, background: '#f0f0f0',
              transition: 'flex 0.5s ease',
              display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
              paddingTop: 2,
            }}>
              {evalScore >= 0 && (
                <span style={{ fontSize: '0.5rem', color: '#333', writingMode: 'vertical-rl' }}>
                  {(evalScore / 100).toFixed(1)}
                </span>
              )}
            </div>
          </div>

          {/* Board container */}
          <div style={{ position: 'relative' }}>
            {/* Captured by black (top) */}
            <div style={{
              display: 'flex', gap: '2px', minHeight: '22px',
              marginBottom: '4px', alignItems: 'center', paddingLeft: 2,
            }}>
              <span style={{ fontSize: '0.7rem', color: '#94a3b8', marginRight: 4 }}>
                {PIECE_CHARS_B[KING]}
              </span>
              {renderCaptured(WHITE)}
              {matDiff < 0 && (
                <span style={{ fontSize: '0.65rem', color: '#94a3b8', marginLeft: 4 }}>
                  +{Math.abs(matDiff / 100).toFixed(0)}
                </span>
              )}
            </div>

            {/* Board */}
            <div
              ref={boardRef}
              onContextMenu={handleBoardContextMenu}
              onMouseDown={handleBoardMouseDown}
              onMouseMove={handleBoardMouseMove}
              onMouseUp={handleBoardMouseUp}
              onMouseLeave={() => { endDrag(); setDrawStart(null); setDrawCurrent(null) }}
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(8, 1fr)',
                gridTemplateRows: 'repeat(8, 1fr)',
                width: 'min(calc(100vw - 100px), 580px)',
                height: 'min(calc(100vw - 100px), 580px)',
                borderRadius: '4px',
                overflow: 'hidden',
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                border: '2px solid rgba(255,255,255,0.08)',
                position: 'relative',
              }}
            >
              {renderBoard()}

              {/* Arrow SVG overlay */}
              {(arrows.length > 0 || (drawStart && drawCurrent && (drawStart.row !== drawCurrent.row || drawStart.col !== drawCurrent.col))) && (
                <svg
                  style={{
                    position: 'absolute', inset: 0,
                    width: '100%', height: '100%',
                    pointerEvents: 'none', zIndex: 4,
                  }}
                  viewBox="0 0 800 800"
                >
                  <defs>
                    <marker id="arrowhead" markerWidth="4" markerHeight="4" refX="3" refY="2" orient="auto">
                      <polygon points="0 0, 4 2, 0 4" fill="rgba(255,170,0,0.85)" />
                    </marker>
                    <marker id="arrowhead-draft" markerWidth="4" markerHeight="4" refX="3" refY="2" orient="auto">
                      <polygon points="0 0, 4 2, 0 4" fill="rgba(255,170,0,0.5)" />
                    </marker>
                  </defs>
                  {/* Saved arrows */}
                  {arrows.map((a, i) => {
                    const x1 = a.from.col * 100 + 50
                    const y1 = a.from.row * 100 + 50
                    const x2 = a.to.col * 100 + 50
                    const y2 = a.to.row * 100 + 50
                    return (
                      <line key={i}
                        x1={x1} y1={y1} x2={x2} y2={y2}
                        stroke="rgba(255,170,0,0.85)" strokeWidth="7"
                        strokeLinecap="round" markerEnd="url(#arrowhead)"
                        opacity="0.8"
                      />
                    )
                  })}
                  {/* Draft arrow while dragging */}
                  {drawStart && drawCurrent && (drawStart.row !== drawCurrent.row || drawStart.col !== drawCurrent.col) && (
                    <line
                      x1={drawStart.col * 100 + 50} y1={drawStart.row * 100 + 50}
                      x2={drawCurrent.col * 100 + 50} y2={drawCurrent.row * 100 + 50}
                      stroke="rgba(255,170,0,0.5)" strokeWidth="7"
                      strokeLinecap="round" markerEnd="url(#arrowhead-draft)"
                      opacity="0.5"
                    />
                  )}
                </svg>
              )}

              {/* Floating drag piece — positioned via ref, not state */}
              <span
                ref={dragRef}
                style={{
                  position: 'absolute',
                  transform: 'translate(-50%, -50%)',
                  fontSize: 'min(7vw, 62px)',
                  lineHeight: 1,
                  pointerEvents: 'none',
                  zIndex: 20,
                  color: '#fff',
                  textShadow: '0 0 4px rgba(0,0,0,0.9), 0 2px 8px rgba(0,0,0,0.6), 2px 0 0 rgba(0,0,0,0.5), -2px 0 0 rgba(0,0,0,0.5)',
                  filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.5))',
                  cursor: 'grabbing',
                  display: 'none',
                  willChange: 'left, top',
                }}
              />
            </div>

            {/* Captured by white (bottom) */}
            <div style={{
              display: 'flex', gap: '2px', minHeight: '22px',
              marginTop: '4px', alignItems: 'center', paddingLeft: 2,
            }}>
              <span style={{ fontSize: '0.7rem', color: '#94a3b8', marginRight: 4 }}>
                {PIECE_CHARS_W[KING]}
              </span>
              {renderCaptured(BLACK)}
              {matDiff > 0 && (
                <span style={{ fontSize: '0.65rem', color: '#94a3b8', marginLeft: 4 }}>
                  +{(matDiff / 100).toFixed(0)}
                </span>
              )}
            </div>

            {/* Promotion overlay */}
            {promoSquare && (
              <div style={{
                position: 'absolute', inset: 0,
                background: 'rgba(0,0,0,0.7)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: '4px', zIndex: 10,
              }}>
                <div style={{
                  background: '#1e293b', borderRadius: '12px', padding: '20px',
                  display: 'flex', gap: '12px',
                  border: '1px solid rgba(255,255,255,0.15)',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
                }}>
                  <span style={{ fontSize: '0.8rem', color: '#94a3b8', alignSelf: 'center', marginRight: 4 }}>
                    Promote to:
                  </span>
                  {[QUEEN, ROOK, BISHOP, KNIGHT].map(p => (
                    <button
                      key={p}
                      onClick={() => handlePromoChoice(p)}
                      style={{
                        width: 56, height: 56, fontSize: '2.2rem',
                        background: '#334155', border: '1px solid rgba(255,255,255,0.15)',
                        borderRadius: '8px', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.15s',
                        color: 'inherit',
                      }}
                      onMouseEnter={e => { e.target.style.background = '#475569'; e.target.style.transform = 'scale(1.1)' }}
                      onMouseLeave={e => { e.target.style.background = '#334155'; e.target.style.transform = 'scale(1)' }}
                    >
                      {PIECE_CHARS_W[p]}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Game over overlay */}
            {gameOver && (
              <div style={{
                position: 'absolute', inset: 0,
                background: 'rgba(0,0,0,0.75)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: '4px', zIndex: 10, flexDirection: 'column', gap: 12,
              }}>
                <div style={{
                  fontSize: '1.5rem', fontWeight: 700,
                  color: '#f0f0f0', textAlign: 'center',
                }}>
                  {gameOver === 'checkmate' && winner === WHITE && 'You Win!'}
                  {gameOver === 'checkmate' && winner === BLACK && 'AI Wins!'}
                  {gameOver === 'stalemate' && 'Stalemate'}
                  {gameOver === 'draw' && 'Draw'}
                </div>
                <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                  {gameOver === 'checkmate' ? 'Checkmate' : gameOver === 'stalemate' ? 'No legal moves' : 'Insufficient material / 50 move rule'}
                </div>
                <button
                  onClick={newGame}
                  style={{
                    padding: '8px 24px', background: '#3b82f6', border: 'none',
                    borderRadius: '8px', color: '#fff', fontWeight: 600,
                    cursor: 'pointer', fontSize: '0.9rem',
                  }}
                >
                  New Game
                </button>
              </div>
            )}

            {/* AI thinking overlay */}
            {aiThinking && (
              <div style={{
                position: 'absolute', top: 8, right: 8,
                background: 'rgba(0,0,0,0.8)', borderRadius: '8px',
                padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 8,
                zIndex: 5, border: '1px solid rgba(255,255,255,0.1)',
              }}>
                <div style={{
                  width: 14, height: 14, border: '2px solid #3b82f6',
                  borderTopColor: 'transparent', borderRadius: '50%',
                  animation: 'chess-spin 0.8s linear infinite',
                }} />
                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Thinking...</span>
              </div>
            )}
          </div>
        </div>

        {/* Side panel */}
        <div style={{
          display: 'flex', flexDirection: 'column', gap: '10px',
          minWidth: '200px', maxWidth: '240px', flex: '1 1 200px',
        }}>
          {/* Controls */}
          <div style={{
            background: 'rgba(255,255,255,0.04)', borderRadius: '10px',
            padding: '12px', border: '1px solid rgba(255,255,255,0.06)',
          }}>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
              <button
                onClick={newGame}
                style={{
                  flex: 1, padding: '7px 0', background: '#1e40af',
                  border: 'none', borderRadius: '6px', color: '#e2e8f0',
                  fontWeight: 600, cursor: 'pointer', fontSize: '0.78rem',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => e.target.style.background = '#2563eb'}
                onMouseLeave={e => e.target.style.background = '#1e40af'}
              >
                New Game
              </button>
              <button
                onClick={undoMove2}
                disabled={aiThinking || gameState.history.length === 0}
                style={{
                  flex: 1, padding: '7px 0',
                  background: aiThinking || gameState.history.length === 0 ? '#1e293b' : '#374151',
                  border: 'none', borderRadius: '6px', color: '#e2e8f0',
                  fontWeight: 600, cursor: aiThinking ? 'not-allowed' : 'pointer',
                  fontSize: '0.78rem', transition: 'background 0.15s',
                  opacity: aiThinking || gameState.history.length === 0 ? 0.4 : 1,
                }}
                onMouseEnter={e => { if (!aiThinking && gameState.history.length > 0) e.target.style.background = '#4b5563' }}
                onMouseLeave={e => { if (!aiThinking && gameState.history.length > 0) e.target.style.background = '#374151' }}
              >
                Undo
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>AI Depth:</span>
              <div style={{ display: 'flex', gap: '4px', flex: 1 }}>
                {[1, 2, 3, 4].map(d => (
                  <button
                    key={d}
                    onClick={() => setAiDepth(d)}
                    style={{
                      flex: 1, padding: '4px 0',
                      background: d === aiDepth ? '#3b82f6' : '#1e293b',
                      border: d === aiDepth ? '1px solid #60a5fa' : '1px solid rgba(255,255,255,0.08)',
                      borderRadius: '4px', color: d === aiDepth ? '#fff' : '#94a3b8',
                      fontWeight: 600, cursor: 'pointer', fontSize: '0.75rem',
                      transition: 'all 0.15s',
                    }}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* AI Info */}
          <div style={{
            background: 'rgba(255,255,255,0.04)', borderRadius: '10px',
            padding: '12px', border: '1px solid rgba(255,255,255,0.06)',
          }}>
            <h3 style={{
              fontSize: '0.7rem', fontWeight: 700, color: '#64748b',
              textTransform: 'uppercase', letterSpacing: '0.08em',
              margin: '0 0 8px',
            }}>
              AI Analysis
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              {[
                { label: 'Depth', value: aiInfo.depth || '-' },
                { label: 'Nodes', value: aiInfo.nodes ? aiInfo.nodes.toLocaleString() : '-' },
                { label: 'Time', value: aiInfo.time ? `${(aiInfo.time / 1000).toFixed(2)}s` : '-' },
                { label: 'Eval', value: aiInfo.nodes ? `${(-evalScore / 100) >= 0 ? '+' : ''}${(-evalScore / 100).toFixed(2)}` : '-' },
              ].map(({ label, value }) => (
                <div key={label} style={{
                  background: 'rgba(0,0,0,0.2)', borderRadius: '6px',
                  padding: '6px 8px',
                }}>
                  <div style={{ fontSize: '0.6rem', color: '#64748b', textTransform: 'uppercase' }}>{label}</div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#e2e8f0', fontFamily: 'monospace' }}>{value}</div>
                </div>
              ))}
            </div>
            {aiInfo.nodes > 0 && (
              <div style={{
                marginTop: 8, fontSize: '0.65rem', color: '#64748b',
              }}>
                NPS: {aiInfo.time > 0 ? Math.round(aiInfo.nodes / (aiInfo.time / 1000)).toLocaleString() : '-'}
              </div>
            )}
          </div>

          {/* Best Moves */}
          <div style={{
            background: 'rgba(255,255,255,0.04)', borderRadius: '10px',
            padding: '12px', border: '1px solid rgba(255,255,255,0.06)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showBestMoves ? 8 : 0 }}>
              <h3 style={{
                fontSize: '0.7rem', fontWeight: 700, color: '#64748b',
                textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0,
              }}>
                Recommended Moves
              </h3>
              <button
                onClick={() => {
                  setShowBestMoves(p => !p)
                  if (!showBestMoves) computeBestMoves(stateRef.current)
                }}
                style={{
                  background: showBestMoves ? '#1e40af' : '#1e293b',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '4px', padding: '2px 8px',
                  color: showBestMoves ? '#fff' : '#94a3b8',
                  fontSize: '0.65rem', fontWeight: 600, cursor: 'pointer',
                }}
              >
                {showBestMoves ? 'Hide' : 'Show'}
              </button>
            </div>
            {showBestMoves && bestMoves.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {bestMoves.map((bm, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    background: i === 0 ? 'rgba(59,130,246,0.15)' : 'rgba(0,0,0,0.15)',
                    borderRadius: 4, padding: '4px 8px',
                    border: i === 0 ? '1px solid rgba(59,130,246,0.3)' : '1px solid transparent',
                  }}>
                    <span style={{ fontSize: '0.65rem', color: '#64748b', width: 14 }}>#{i + 1}</span>
                    <span style={{
                      fontSize: '0.78rem', fontWeight: 700, fontFamily: 'monospace',
                      color: i === 0 ? '#60a5fa' : '#cbd5e1',
                    }}>
                      {fancyMove(bm.alg, true)}
                    </span>
                    <span style={{
                      fontSize: '0.65rem', fontFamily: 'monospace', marginLeft: 'auto',
                      color: bm.score >= 0 ? '#4ade80' : '#f87171',
                    }}>
                      {bm.score >= 0 ? '+' : ''}{(bm.score / 100).toFixed(1)}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {showBestMoves && bestMoves.length === 0 && (
              <div style={{ fontSize: '0.7rem', color: '#475569', fontStyle: 'italic' }}>
                {gameState.side === WHITE ? 'Click Show to analyze' : 'Wait for your turn'}
              </div>
            )}
          </div>

          {/* Status */}
          <div style={{
            background: 'rgba(255,255,255,0.04)', borderRadius: '10px',
            padding: '10px 12px', border: '1px solid rgba(255,255,255,0.06)',
            fontSize: '0.78rem',
          }}>
            {aiThinking ? (
              <span style={{ color: '#fbbf24' }}>AI is thinking...</span>
            ) : gameOver ? (
              <span style={{ color: '#f87171' }}>
                {gameOver === 'checkmate' && winner === WHITE && 'Checkmate - You win!'}
                {gameOver === 'checkmate' && winner === BLACK && 'Checkmate - AI wins!'}
                {gameOver === 'stalemate' && 'Stalemate - Draw'}
                {gameOver === 'draw' && 'Draw by 50-move rule'}
              </span>
            ) : isInCheck(gameState) ? (
              <span style={{ color: '#f87171' }}>Check!</span>
            ) : (
              <span style={{ color: '#94a3b8' }}>
                {gameState.side === WHITE ? 'Your turn (White)' : 'Black to move'}
              </span>
            )}
          </div>

          {/* Move History */}
          <div style={{
            background: 'rgba(255,255,255,0.04)', borderRadius: '10px',
            padding: '12px', border: '1px solid rgba(255,255,255,0.06)',
            flex: '1 1 0',
            maxHeight: '200px',
          }}>
            <h3 style={{
              fontSize: '0.7rem', fontWeight: 700, color: '#64748b',
              textTransform: 'uppercase', letterSpacing: '0.08em',
              margin: '0 0 8px',
            }}>
              Move History
            </h3>
            <div style={{
              maxHeight: '150px', overflowY: 'auto', fontSize: '0.75rem',
              fontFamily: 'monospace', color: '#cbd5e1',
              display: 'grid', gridTemplateColumns: 'auto 1fr 1fr', gap: '2px 6px',
              lineHeight: 1.7,
            }}>
              {Array.from({ length: Math.ceil(gameState.moveList.length / 2) }).map((_, i) => (
                <React.Fragment key={i}>
                  <span style={{ color: '#64748b' }}>{i + 1}.</span>
                  <span style={{
                    color: i * 2 === gameState.moveList.length - 1 ? '#60a5fa' : '#cbd5e1',
                    fontWeight: i * 2 === gameState.moveList.length - 1 ? 700 : 400,
                  }}>
                    {fancyMove(gameState.moveList[i * 2], true)}
                  </span>
                  <span style={{
                    color: i * 2 + 1 === gameState.moveList.length - 1 ? '#60a5fa' : '#94a3b8',
                    fontWeight: i * 2 + 1 === gameState.moveList.length - 1 ? 700 : 400,
                  }}>
                    {fancyMove(gameState.moveList[i * 2 + 1], false)}
                  </span>
                </React.Fragment>
              ))}
            </div>
            {gameState.moveList.length === 0 && (
              <div style={{ fontSize: '0.7rem', color: '#475569', fontStyle: 'italic' }}>
                No moves yet
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer info */}
      <div style={{
        fontSize: '0.65rem', color: '#475569', textAlign: 'center',
        lineHeight: 1.6,
      }}>
        <span>Inspired by </span>
        <a
          href="https://github.com/SiddharthFulia/Chess-engine"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#60a5fa', textDecoration: 'none' }}
        >
          Chess Engine in C
        </a>
        <span> — 10x12 mailbox board representation, alpha-beta search with quiescence</span>
      </div>

      {/* Spinner keyframes */}
      <style>{`
        @keyframes chess-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
