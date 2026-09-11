// PlayingCard — shared SVG playing-card component for the /arcade/*
// card games (Solitaire, Blackjack, Poker, Baccarat, Rummy).
//
// One component to rule them all. Renders a real, standard 52-card
// deck card as inline SVG. No external assets, no bitmap sprites,
// no Unicode symbols pretending to be cards. The suit shape is a
// hand-tuned SVG path, the corner indices are actual glyphs on a
// pip-typography metric grid, and the J / Q / K face cards get a
// stylised gradient portrait that's recognisable at 100px wide but
// still looks intentional at 240px.
//
// Sizing is opinionated: pass a `size` (xs · sm · md · lg · xl) or
// override the actual width via `width`. The card is a fixed 2.5:3.5
// aspect ratio (the ISO 216-ish poker card ratio), so the height
// derives automatically.
//
// Face-up / face-down / highlighted / dimmed / stacked-under-shadow
// are all data-driven props so the games can just toggle state and
// let CSS transitions handle the flip / lift.
//
//   <PlayingCard suit="hearts" rank="Q" faceUp />
//   <PlayingCard suit="spades" rank="A" size="lg" highlighted />
//   <PlayingCard faceUp={false} size="sm" />   // back of card
//
// Suits: hearts · diamonds · clubs · spades  (redRed for the pair)
// Ranks: A · 2..10 · J · Q · K
//
// The whole file is 100% inline SVG + a thin JSX wrapper. No canvas,
// no react-spring — this keeps it drop-in for any of the games and
// keeps the total bundle contribution tiny.

import { memo } from 'react'

// Card face background gradients keyed by mode. Both dark and light
// mode use the same *card* face (white/cream) because playing cards
// have been white for 400 years and dark cards look like bad
// hologram merch. The site chrome around them handles the theme.
const CARD_FACE_FILL = 'url(#pc-face)'
const CARD_BACK_FILL = 'url(#pc-back)'

// Suit config. `color` drives the corner index colour + suit fill on
// face cards. Path `d` is drawn inside a 24x24 viewBox we scale to
// wherever we need a suit glyph.
const SUITS = {
  hearts: {
    color: '#dc2626', // red-600
    label: '♥',
    // Heart shape — twin lobe + point. Tuned to look like a card heart
    // (thicker than the emoji version), not a valentine card sticker.
    d: 'M12 21s-8.5-5.3-8.5-11.3C3.5 6 6 4 8.5 4c1.7 0 3 1 3.5 2.2C12.5 5 13.8 4 15.5 4 18 4 20.5 6 20.5 9.7 20.5 15.7 12 21 12 21z',
  },
  diamonds: {
    color: '#dc2626', // red-600
    label: '♦',
    // Diamond — pointed lozenge, slightly taller than wide.
    d: 'M12 2 L20 12 L12 22 L4 12 Z',
  },
  clubs: {
    color: '#0f172a', // slate-900
    label: '♣',
    // Club — three lobes + stubby stem. Tuned so the top lobe is
    // narrower than the bottom pair (real club shape, not clover).
    d: 'M12 2c-2.2 0-4 1.6-4 3.7 0 .7.2 1.4.6 2C7.4 7.3 6.4 7 5.3 7 3.5 7 2 8.5 2 10.4c0 1.9 1.5 3.4 3.3 3.4 1 0 1.9-.4 2.6-1L7 15.5c-.4.7-.5 1-.5 1.5 0 1.4 1.1 2.5 2.5 2.5.9 0 1.6-.4 2-1L10 22h4l-1-3.5c.4.6 1.1 1 2 1 1.4 0 2.5-1.1 2.5-2.5 0-.5-.1-.8-.5-1.5l-.9-2.7c.7.6 1.6 1 2.6 1 1.8 0 3.3-1.5 3.3-3.4 0-1.9-1.5-3.4-3.3-3.4-1.1 0-2.1.3-2.3.7.4-.6.6-1.3.6-2C16 3.6 14.2 2 12 2z',
  },
  spades: {
    color: '#0f172a', // slate-900
    label: '♠',
    // Spade — inverted heart + stubby stem. The stem's flare is
    // deliberately triangular to read as a spade at 8px, not just
    // an inverted heart.
    d: 'M12 2 C 8 8 3 10 3 14.5 C 3 17 5 19 7.5 19 c 1.5 0 2.7 -.7 3.2 -1.7 L 10 22 h 4 l -0.7 -4.7 C 13.8 18.3 15 19 16.5 19 19 19 21 17 21 14.5 21 10 16 8 12 2 z',
  },
}

// Numeric rank -> corner glyph. Ace prints as "A", face cards as J/Q/K,
// 10 as "10" (the only two-glyph corner — we tighten the tracking so
// it still fits in the corner slot).
const CORNER_GLYPH = {
  A: 'A', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8',
  9: '9', 10: '10', J: 'J', Q: 'Q', K: 'K',
}

const FACE_RANKS = new Set(['J', 'Q', 'K'])
const ACE = 'A'

// Physical pip positions (in a 100x140 card viewBox) for each rank.
// These are the actual layout every real playing card uses — 2 has
// two vertical pips, 3 has three, 4 is a 2x2 grid, 5 adds a centre
// pip to the 4 layout, and so on up to 10.
// Ranks flip the suit glyph vertically when placed in the lower half
// (an authentic detail that keeps the card readable when rotated).
const PIP_LAYOUTS = {
  2: [[50, 32], [50, 108]],
  3: [[50, 32], [50, 70], [50, 108]],
  4: [[32, 32], [68, 32], [32, 108], [68, 108]],
  5: [[32, 32], [68, 32], [50, 70], [32, 108], [68, 108]],
  6: [[32, 32], [68, 32], [32, 70], [68, 70], [32, 108], [68, 108]],
  7: [[32, 32], [68, 32], [50, 51], [32, 70], [68, 70], [32, 108], [68, 108]],
  8: [[32, 32], [68, 32], [50, 48], [32, 65], [68, 65], [50, 92], [32, 108], [68, 108]],
  9: [[32, 30], [68, 30], [32, 55], [68, 55], [50, 70], [32, 85], [68, 85], [32, 110], [68, 110]],
  10: [[32, 28], [68, 28], [32, 50], [68, 50], [50, 40], [50, 100], [32, 90], [68, 90], [32, 112], [68, 112]],
}

// Size presets. `w` is width in px. h is derived from the 2.5:3.5 ratio.
const SIZES = {
  xs: 32,
  sm: 56,
  md: 80,
  lg: 110,
  xl: 150,
}

function widthFor(size, override) {
  if (override) return override
  return SIZES[size] ?? SIZES.md
}

// A single suit glyph drawn inside a bounded region — used for both
// corner indices and pip layout. The transform props allow the callers
// to place + scale + flip without having to redo the SVG.
function Suit({ suit, x = 50, y = 50, size = 14, flip = false }) {
  const s = SUITS[suit]
  if (!s) return null
  // 24 is the natural viewBox for the path. Scale is size / 24.
  const scale = size / 24
  const tx = x - (12 * scale)
  const ty = y - (12 * scale)
  const transform = flip
    ? `translate(${x} ${y}) scale(${scale} ${-scale}) translate(-12 -12)`
    : `translate(${tx} ${ty}) scale(${scale})`
  return <path d={s.d} fill={s.color} transform={transform} />
}

// Corner index (top-left / bottom-right rotated 180°). Prints the
// rank letter with the suit glyph directly under it — the classic
// corner block that lets you fan cards and read the rank + suit
// without seeing the middle of the card.
function CornerIndex({ rank, suit, x, y, rotate = false }) {
  const s = SUITS[suit]
  const transform = rotate ? `rotate(180 ${x} ${y})` : undefined
  return (
    <g transform={transform}>
      <text
        x={x}
        y={y}
        textAnchor="middle"
        fontFamily="Georgia, serif"
        fontWeight="700"
        fontSize={rank === '10' ? 12 : 14}
        letterSpacing={rank === '10' ? '-1' : '0'}
        fill={s.color}
      >
        {CORNER_GLYPH[rank]}
      </text>
      <Suit suit={suit} x={x} y={y + 9} size={8} />
    </g>
  )
}

// Face card art (J/Q/K). Stylised silhouette on a gradient rug, with
// the suit crest in the corner. Deliberately abstract — a real J/Q/K
// portrait would be either photographic (ugly at small sizes) or
// need a 50KB SVG per card. This reads as royalty without being
// cartoonish.
function FaceArt({ suit, rank }) {
  const s = SUITS[suit]
  const isKing = rank === 'K'
  const isQueen = rank === 'Q'
  const gradId = `pc-face-${suit}-${rank}`
  const crownId = `pc-crown-${suit}-${rank}`
  const ringId = `pc-ring-${suit}-${rank}`
  return (
    <g>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={s.color} stopOpacity="0.16" />
          <stop offset="1" stopColor={s.color} stopOpacity="0.02" />
        </linearGradient>
        <linearGradient id={crownId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#facc15" />
          <stop offset="1" stopColor="#b45309" />
        </linearGradient>
        <linearGradient id={ringId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={s.color} stopOpacity="0.9" />
          <stop offset="1" stopColor={s.color} stopOpacity="0.5" />
        </linearGradient>
      </defs>
      {/* Inner frame + rug */}
      <rect x="14" y="24" width="72" height="92" rx="4" fill={`url(#${gradId})`} stroke={s.color} strokeOpacity="0.35" strokeWidth="0.8" />
      {/* Portrait silhouette — head + shoulders */}
      <ellipse cx="50" cy="55" rx="14" ry="16" fill={s.color} opacity="0.85" />
      <path d="M 30 105 Q 30 78 50 78 Q 70 78 70 105 Z" fill={s.color} opacity="0.85" />
      {/* Crown for K, laurel for Q, hat for J */}
      {isKing && (
        <path d="M 34 40 L 40 30 L 46 38 L 50 28 L 54 38 L 60 30 L 66 40 L 62 46 L 38 46 Z" fill={`url(#${crownId})`} stroke="#78350f" strokeWidth="0.5" />
      )}
      {isQueen && (
        <>
          <ellipse cx="50" cy="38" rx="16" ry="6" fill={`url(#${crownId})`} opacity="0.75" />
          <circle cx="50" cy="38" r="2.2" fill={`url(#${crownId})`} />
        </>
      )}
      {!isKing && !isQueen && (
        <path d="M 32 42 Q 50 34 68 42 L 68 46 L 32 46 Z" fill={s.color} opacity="0.9" />
      )}
      {/* Suit crest in centre */}
      <Suit suit={suit} x={50} y={95} size={20} />
      {/* Corner mini-glyph on the collar */}
      <circle cx="50" cy="70" r="4.5" fill={`url(#${ringId})`} stroke="#fff" strokeOpacity="0.4" strokeWidth="0.6" />
    </g>
  )
}

function AceArt({ suit }) {
  // Ace: single oversized central suit glyph. Same on every real deck.
  return <Suit suit={suit} x={50} y={70} size={54} />
}

function PipArt({ suit, rank }) {
  const layout = PIP_LAYOUTS[rank]
  if (!layout) return null
  // Determine centreline of card (y=70). Pips below the centre are
  // flipped vertically — the classic playing-card mirror.
  return (
    <>
      {layout.map(([x, y], i) => (
        <Suit key={i} suit={suit} x={x} y={y} size={13} flip={y > 70} />
      ))}
    </>
  )
}

function CardBackPattern() {
  // Card back — a small diamond lattice on a plum/rose field with a
  // bordered inner rectangle. This is the "casino back" of the deck.
  return (
    <>
      <defs>
        <pattern id="pc-lattice" x="0" y="0" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="10" height="10" fill="none" />
          <path d="M 0 5 L 5 0 M 5 10 L 10 5" stroke="#fef3c7" strokeOpacity="0.24" strokeWidth="0.6" />
        </pattern>
        <linearGradient id="pc-back" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7f1d1d" />
          <stop offset="0.5" stopColor="#991b1b" />
          <stop offset="1" stopColor="#450a0a" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="100" height="140" rx="8" fill={CARD_BACK_FILL} />
      <rect x="6" y="6" width="88" height="128" rx="5" fill="url(#pc-lattice)" stroke="#fbbf24" strokeOpacity="0.55" strokeWidth="0.9" />
      <rect x="14" y="14" width="72" height="112" rx="3" fill="none" stroke="#fbbf24" strokeOpacity="0.35" strokeWidth="0.5" />
      <circle cx="50" cy="70" r="18" fill="#7f1d1d" stroke="#fbbf24" strokeOpacity="0.7" strokeWidth="0.6" />
      <text x="50" y="76" textAnchor="middle" fontFamily="Georgia, serif" fontWeight="700" fontSize="18" fill="#fbbf24">S</text>
    </>
  )
}

function CardFaceDefs() {
  return (
    <defs>
      <linearGradient id="pc-face" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset="1" stopColor="#fef7ec" />
      </linearGradient>
    </defs>
  )
}

/**
 * Main PlayingCard component.
 *
 * @param {object}  props
 * @param {string}  props.suit         hearts · diamonds · clubs · spades
 * @param {string}  props.rank         A · 2..10 · J · Q · K
 * @param {boolean} props.faceUp       true = show pips, false = show back
 * @param {boolean} props.highlighted  amber glow (hint / selection)
 * @param {boolean} props.dimmed       50% opacity (unavailable move)
 * @param {string}  props.size         xs · sm · md · lg · xl
 * @param {number}  props.width        override width in px
 * @param {string}  props.className    extra classes
 * @param {object}  props.style        extra inline style
 * @param {function} props.onClick     click handler
 * @param {boolean} props.selected     rose ring (drag source / knock select)
 * @param {boolean} props.disabled     pointer-events: none
 * @param {number}  props.rotate       rotate the whole card by N deg
 * @param {string}  props.ariaLabel    override aria-label
 */
function PlayingCardImpl({
  suit = 'spades',
  rank = 'A',
  faceUp = true,
  highlighted = false,
  dimmed = false,
  selected = false,
  size = 'md',
  width,
  className = '',
  style,
  onClick,
  disabled = false,
  rotate = 0,
  ariaLabel,
}) {
  const w = widthFor(size, width)
  const h = Math.round(w * 1.4)
  const label = ariaLabel ?? (faceUp ? `${rank} of ${suit}` : 'face-down card')
  const isFace = FACE_RANKS.has(rank)
  const isAce = rank === ACE
  const isNumber = !isFace && !isAce

  const filter = highlighted
    ? 'drop-shadow(0 0 8px rgba(251,191,36,0.9)) drop-shadow(0 0 20px rgba(251,191,36,0.5))'
    : selected
      ? 'drop-shadow(0 0 6px rgba(244,63,94,0.85))'
      : 'drop-shadow(0 6px 10px rgba(0,0,0,0.35))'

  return (
    <svg
      viewBox="0 0 100 140"
      width={w}
      height={h}
      role="img"
      aria-label={label}
      onClick={disabled ? undefined : onClick}
      className={`playing-card ${className}`}
      style={{
        cursor: onClick && !disabled ? 'pointer' : undefined,
        opacity: dimmed ? 0.45 : 1,
        transform: rotate ? `rotate(${rotate}deg)` : undefined,
        transformOrigin: 'center',
        filter,
        pointerEvents: disabled ? 'none' : undefined,
        transition: 'filter 200ms, opacity 200ms, transform 200ms',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        touchAction: 'manipulation',
        ...style,
      }}
    >
      {faceUp ? <CardFaceDefs /> : null}
      {faceUp ? (
        <>
          {/* Card body */}
          <rect x="0" y="0" width="100" height="140" rx="8" fill={CARD_FACE_FILL} stroke="#0f172a" strokeOpacity="0.14" strokeWidth="0.6" />
          {/* Corner indices */}
          <CornerIndex rank={rank} suit={suit} x={12} y={20} />
          <CornerIndex rank={rank} suit={suit} x={88} y={122} rotate />
          {/* Body art */}
          {isAce && <AceArt suit={suit} />}
          {isFace && <FaceArt suit={suit} rank={rank} />}
          {isNumber && <PipArt suit={suit} rank={rank} />}
          {/* Selection ring */}
          {selected && (
            <rect x="1.5" y="1.5" width="97" height="137" rx="7" fill="none" stroke="#f43f5e" strokeWidth="2" />
          )}
        </>
      ) : (
        <CardBackPattern />
      )}
    </svg>
  )
}

// Memoised — most games render 52 cards + a shoe, and re-rendering
// every SVG on hover is wasteful. All props are primitives so cheap
// shallow compare is safe.
const PlayingCard = memo(PlayingCardImpl)
export default PlayingCard

// ─── Deck helpers ─────────────────────────────────────────────────
// Kept alongside PlayingCard because every game needs to build a
// standard 52-card deck. Doing this once here removes 25 lines of
// noise from each game file and guarantees the rank/suit strings
// stay identical across games (JSX comparisons + drag-drop need it).

export const SUIT_LIST = ['hearts', 'diamonds', 'clubs', 'spades']
export const RANK_LIST = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']

/** Build a fresh single 52-card deck. Cards are plain `{suit, rank, id}` objects. */
export function makeDeck(offset = 0) {
  const d = []
  for (const suit of SUIT_LIST) {
    for (const rank of RANK_LIST) {
      d.push({ suit, rank, id: `${suit[0]}${rank}-${offset}-${d.length}` })
    }
  }
  return d
}

/** Multi-deck shoe (e.g. 6 for blackjack). Each card has a stable id. */
export function makeShoe(numDecks = 1) {
  const shoe = []
  for (let i = 0; i < numDecks; i++) shoe.push(...makeDeck(i))
  return shoe
}

/** In-place Fisher–Yates. Returns the array so it composes. */
export function shuffle(arr, rng = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/** True if the suit is a red suit (heart or diamond). Used everywhere. */
export function isRed(suit) {
  return suit === 'hearts' || suit === 'diamonds'
}

/** Rank -> integer 1..13 (A=1, K=13). */
export const RANK_VALUE = {
  A: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10, J: 11, Q: 12, K: 13,
}

/** Blackjack point value (A=1 or 11 handled by caller). */
export function bjPoint(rank) {
  if (rank === 'A') return 11
  if (rank === 'J' || rank === 'Q' || rank === 'K') return 10
  return Number(rank)
}
