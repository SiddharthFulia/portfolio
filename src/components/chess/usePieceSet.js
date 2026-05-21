// Hook that injects a <style> tag with chessground piece rules pointing
// at /public/piece/{set}/{piece}.svg. Lets us swap sets at runtime without
// importing static CSS for each.
//
// chessground expects piece rules like:
//   .cg-wrap piece.king.white { background-image: url(... wK.svg) }
// One rule per (color × role) — 12 rules per set. We rebuild on every set
// change; cheap enough (~40 lines of CSS).

import { useEffect } from 'react'

// Lichess piece file naming: {colorLetter}{roleLetter}.svg
//   colorLetter: 'w' | 'b'
//   roleLetter:  K | Q | R | B | N | P
const ROLES = [
  ['king',   'K'],
  ['queen',  'Q'],
  ['rook',   'R'],
  ['bishop', 'B'],
  ['knight', 'N'],
  ['pawn',   'P'],
]
const COLORS = [['white', 'w'], ['black', 'b']]

const STYLE_TAG_ID = 'sid-cg-pieceset'

export const PIECE_SETS = [
  { id: 'cburnett',   label: 'cburnett',   blurb: 'Lichess default · CC-BY-SA' },
  { id: 'alpha',      label: 'Alpha',      blurb: 'Classic chess-engine.com set' },
  { id: 'california', label: 'California', blurb: 'Soft modern' },
  { id: 'cardinal',   label: 'Cardinal',   blurb: 'Bold flat illustration' },
  { id: 'fantasy',    label: 'Fantasy',    blurb: 'Wizard-y outlines' },
  { id: 'leipzig',    label: 'Leipzig',    blurb: 'Tournament look' },
  { id: 'merida',     label: 'Merida',     blurb: 'Common print style' },
  { id: 'staunty',    label: 'Staunty',    blurb: 'Modern Staunton, popular' },
  { id: 'chess7',     label: 'Chess7',     blurb: 'Geometric stencil' },
  { id: 'chessnut',   label: 'Chessnut',   blurb: 'Soft outlined / playful' },
  { id: 'companion',  label: 'Companion',  blurb: 'Bold filled silhouettes' },
  { id: 'gioco',      label: 'Gioco',      blurb: 'Hand-drawn elegant' },
  { id: 'governor',   label: 'Governor',   blurb: 'Heavy serif royal' },
  { id: 'horsey',     label: 'Horsey',     blurb: 'Cute cartoon' },
  { id: 'maestro',    label: 'Maestro',    blurb: 'Detailed traditional' },
  { id: 'pirouetti',  label: 'Pirouetti',  blurb: 'Dynamic / artistic' },
  { id: 'riohacha',   label: 'Riohacha',   blurb: 'Minimalist outline' },
  { id: 'tatiana',    label: 'Tatiana',    blurb: 'Modern flat' },
]

function buildPieceCSS(setId) {
  // Each rule: chessground class names + the URL to the SVG asset.
  const rules = []
  for (const [color, colorLetter] of COLORS) {
    for (const [role, roleLetter] of ROLES) {
      const url = `/piece/${setId}/${colorLetter}${roleLetter}.svg`
      rules.push(`.cg-wrap piece.${role}.${color}{background-image:url('${url}')}`)
    }
  }
  return rules.join('\n')
}

export default function usePieceSet(setId) {
  useEffect(() => {
    let el = document.getElementById(STYLE_TAG_ID)
    if (!el) {
      el = document.createElement('style')
      el.id = STYLE_TAG_ID
      document.head.appendChild(el)
    }
    el.textContent = buildPieceCSS(setId)
    return () => {
      // Don't remove on unmount — next page mount will reuse the same tag.
    }
  }, [setId])
}
