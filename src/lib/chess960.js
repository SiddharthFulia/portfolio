// Chess960 (Fischer Random) starting-position generator.
//
// Rules for a valid 960 back-rank arrangement:
//   1. Bishops sit on opposite-colour squares.
//   2. King sits BETWEEN the two rooks (so castling rules still apply).
//   3. The two players' back ranks mirror each other (white = lowercase
//      mirror of black). Pawns are unchanged on ranks 2 and 7.
//
// We pick a random valid arrangement and return a full FEN with the
// Chess960-style castling rights tag (X-FEN: rooks' files in
// uppercase/lowercase, not KQkq) so Stockfish + chess.js can both consume it.

const PIECES = {
  K: 'k',
  Q: 'q',
  R: 'r',
  B: 'b',
  N: 'n',
}

function randInt(n) {
  return Math.floor(Math.random() * n)
}

// Place a piece in the i-th still-empty slot (0-indexed from a..h).
function placeAt(slots, piece, idx) {
  let empty = -1
  for (let i = 0; i < 8; i++) {
    if (!slots[i]) {
      empty++
      if (empty === idx) {
        slots[i] = piece
        return i
      }
    }
  }
  return -1
}

// Generate a random back rank as an 8-char array of uppercase white pieces.
// Algorithm from Wikipedia's "Chess960 numbering scheme" simplified:
//   1. Place light-square bishop (b1, d1, f1, h1 — squares 1,3,5,7)
//   2. Place dark-square bishop  (a1, c1, e1, g1 — squares 0,2,4,6)
//   3. Place queen on one of the remaining 6 squares
//   4. Place knights on two of the remaining 5 squares (10 combinations)
//   5. Remaining three squares get R-K-R in left-to-right order
//      → guarantees king is BETWEEN rooks.
export function generate960BackRank() {
  const slots = new Array(8).fill(null)
  // Light-square bishop: files b,d,f,h → indices 1,3,5,7
  const lightFiles = [1, 3, 5, 7]
  slots[lightFiles[randInt(4)]] = 'B'
  // Dark-square bishop: files a,c,e,g → indices 0,2,4,6
  const darkFiles = [0, 2, 4, 6]
  slots[darkFiles[randInt(4)]] = 'B'
  // Queen — one of 6 remaining slots
  placeAt(slots, 'Q', randInt(6))
  // Knights — two of 5 remaining slots
  placeAt(slots, 'N', randInt(5))
  placeAt(slots, 'N', randInt(4))
  // Remaining 3 slots get R, K, R left-to-right (king BETWEEN rooks).
  const remaining = []
  for (let i = 0; i < 8; i++) if (!slots[i]) remaining.push(i)
  slots[remaining[0]] = 'R'
  slots[remaining[1]] = 'K'
  slots[remaining[2]] = 'R'
  return slots
}

// Build a full FEN from a back-rank array. Castling rights use the
// X-FEN style (rook file letters) so Chess960 castling works:
//   white rooks: uppercase file letters (e.g. 'AH')
//   black rooks: lowercase file letters (e.g. 'ah')
export function generate960Fen() {
  const back = generate960BackRank()
  const whiteRank = back.join('')                       // e.g. "BQNBNRKR"
  const blackRank = back.map(c => c.toLowerCase()).join('')
  // Castling — both rook files for both sides, X-FEN format.
  const rookFiles = []
  back.forEach((p, i) => { if (p === 'R') rookFiles.push(String.fromCharCode(97 + i)) })
  const castling = rookFiles.map(f => f.toUpperCase()).join('') + rookFiles.join('')
  // Full FEN
  return `${blackRank}/pppppppp/8/8/8/8/PPPPPPPP/${whiteRank} w ${castling} - 0 1`
}
