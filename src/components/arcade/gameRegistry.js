// Arcade game registry — single source of truth for every game shipping
// in the /arcade hub. Each entry drives:
//   1. The hub grid (icon, title, category, description, difficulty)
//   2. The route table in App.jsx (slug → lazy component)
//   3. The GameShell top bar (title, category chip)
//
// Sibling agents building individual games import from here to keep
// metadata consistent. Add new games by appending to GAMES — no other
// file needs to change if you also drop the matching component at
// src/pages/arcade/<PascalSlug>.jsx.

export const CATEGORIES = [
  'Arcade',
  'Puzzle',
  'Card',
  'Board',
  'Physics',
  'Runner',
  'Retro',
  'Strategy',
  'Reflex',
  'Sim',
]

// Category → accent hue mapping. Used for chips + category filters on the
// hub grid. Keep these Tailwind hues static so JIT doesn't strip them.
export const CATEGORY_ACCENTS = {
  Arcade:   { chip: 'text-amber-300 bg-amber-500/15 border-amber-500/30',   dot: 'bg-amber-400',   ring: 'hover:border-amber-500/50' },
  Puzzle:   { chip: 'text-cyan-300 bg-cyan-500/15 border-cyan-500/30',      dot: 'bg-cyan-400',    ring: 'hover:border-cyan-500/50' },
  Card:     { chip: 'text-rose-300 bg-rose-500/15 border-rose-500/30',      dot: 'bg-rose-400',    ring: 'hover:border-rose-500/50' },
  Board:    { chip: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30', dot: 'bg-emerald-400', ring: 'hover:border-emerald-500/50' },
  Physics:  { chip: 'text-violet-300 bg-violet-500/15 border-violet-500/30', dot: 'bg-violet-400', ring: 'hover:border-violet-500/50' },
  Runner:   { chip: 'text-fuchsia-300 bg-fuchsia-500/15 border-fuchsia-500/30', dot: 'bg-fuchsia-400', ring: 'hover:border-fuchsia-500/50' },
  Retro:    { chip: 'text-yellow-300 bg-yellow-500/15 border-yellow-500/30', dot: 'bg-yellow-400', ring: 'hover:border-yellow-500/50' },
  Strategy: { chip: 'text-sky-300 bg-sky-500/15 border-sky-500/30',         dot: 'bg-sky-400',    ring: 'hover:border-sky-500/50' },
  Reflex:   { chip: 'text-orange-300 bg-orange-500/15 border-orange-500/30', dot: 'bg-orange-400', ring: 'hover:border-orange-500/50' },
  Sim:      { chip: 'text-lime-300 bg-lime-500/15 border-lime-500/30',      dot: 'bg-lime-400',    ring: 'hover:border-lime-500/50' },
}

// Category → gradient preview for game cards without a custom thumbnail.
export const CATEGORY_GRADIENTS = {
  Arcade:   'linear-gradient(135deg,#f59e0b,#ef4444,#7c3aed)',
  Puzzle:   'linear-gradient(135deg,#0ea5e9,#22d3ee,#0f172a)',
  Card:     'linear-gradient(135deg,#f43f5e,#ec4899,#7c3aed)',
  Board:    'linear-gradient(135deg,#10b981,#0d9488,#0f172a)',
  Physics:  'linear-gradient(135deg,#8b5cf6,#ec4899,#0f172a)',
  Runner:   'linear-gradient(135deg,#d946ef,#f97316,#7c3aed)',
  Retro:    'linear-gradient(135deg,#eab308,#f97316,#0f172a)',
  Strategy: 'linear-gradient(135deg,#0284c7,#0ea5e9,#0f172a)',
  Reflex:   'linear-gradient(135deg,#f97316,#ef4444,#0f172a)',
  Sim:      'linear-gradient(135deg,#84cc16,#10b981,#0f172a)',
}

export const GAMES = [
  // Arcade Pack (5)
  { slug: 'breakout',        title: 'Breakout',            category: 'Arcade',   icon: '🧱', difficulty: 2, desc: 'Bounce the ball, break the bricks, don\'t drop it.' },
  { slug: 'space-invaders',  title: 'Space Invaders',      category: 'Arcade',   icon: '👾', difficulty: 3, desc: 'Alien waves descend. You have a laser cannon.' },
  { slug: 'asteroids',       title: 'Asteroids',           category: 'Arcade',   icon: '🌑', difficulty: 3, desc: 'Rotate, thrust, shoot the rocks. Beware the saucer.' },
  { slug: 'missile-command', title: 'Missile Command',     category: 'Arcade',   icon: '🚀', difficulty: 3, desc: 'Defend six cities from ICBMs. Cursor to aim.' },
  { slug: 'frogger',         title: 'Frogger',             category: 'Arcade',   icon: '🐸', difficulty: 3, desc: 'Cross a road and a river without getting flattened.' },

  // Puzzle Pack (5)
  { slug: 'tetris',          title: 'Tetris',              category: 'Puzzle',   icon: '🟦', difficulty: 3, desc: 'Rotate tetrominoes to fill lines.' },
  { slug: 'twenty48',        title: '2048',                category: 'Puzzle',   icon: '🎯', difficulty: 2, desc: 'Slide tiles, merge equal numbers, reach 2048.' },
  { slug: 'sudoku',          title: 'Sudoku',              category: 'Puzzle',   icon: '🔢', difficulty: 4, desc: 'Fill 9×9 grid so every row, column, box has 1-9.' },
  { slug: 'minesweeper',     title: 'Minesweeper',         category: 'Puzzle',   icon: '💣', difficulty: 3, desc: 'Flag mines by deducing from number hints.' },
  { slug: 'wordle',          title: 'Wordle',              category: 'Puzzle',   icon: '🔤', difficulty: 2, desc: '5-letter guess. Green = right spot, yellow = wrong spot.' },

  // Card Pack (5)
  { slug: 'solitaire',       title: 'Klondike Solitaire',  category: 'Card',     icon: '🃏', difficulty: 3, desc: 'Build four foundations up from Ace to King.' },
  { slug: 'blackjack',       title: 'Blackjack',           category: 'Card',     icon: '♠️', difficulty: 2, desc: 'Beat the dealer without busting 21.' },
  { slug: 'poker',           title: '5-Card Draw',         category: 'Card',     icon: '♥️', difficulty: 3, desc: 'Draw and hold — best 5-card poker hand wins.' },
  { slug: 'baccarat',        title: 'Baccarat',            category: 'Card',     icon: '♦️', difficulty: 2, desc: 'Bet Player, Banker, or Tie.' },
  { slug: 'rummy',           title: 'Gin Rummy',           category: 'Card',     icon: '♣️', difficulty: 3, desc: 'Form melds of 3+ cards. Knock on ≤ 10 deadwood.' },

  // Board Pack (5)
  { slug: 'connect-four',    title: 'Connect Four',        category: 'Board',    icon: '🔴', difficulty: 3, desc: 'Drop pieces. Four in a row wins.' },
  { slug: 'reversi',         title: 'Reversi',             category: 'Board',    icon: '⚫', difficulty: 4, desc: 'Flip discs by sandwiching. Most discs wins.' },
  { slug: 'checkers',        title: 'Checkers',            category: 'Board',    icon: '⬛', difficulty: 3, desc: 'Jump captures. Kings move both ways.' },
  { slug: 'nine-mens-morris',title: "Nine Men's Morris",   category: 'Board',    icon: '⚪', difficulty: 3, desc: 'Form mills (3 in a row) to remove opponent pieces.' },
  { slug: 'chinese-checkers',title: 'Chinese Checkers',    category: 'Board',    icon: '⭐', difficulty: 3, desc: 'Race pieces across the star board.' },

  // Physics Pack (5)
  { slug: 'pinball',         title: 'Pinball',             category: 'Physics',  icon: '🎯', difficulty: 3, desc: 'Flippers, bumpers, ramps. Keep the ball alive.' },
  { slug: 'golf',            title: 'Mini Golf',           category: 'Physics',  icon: '⛳', difficulty: 2, desc: 'Drag to aim, release to putt. Fewest strokes wins.' },
  { slug: 'angry-slings',    title: 'Angry Slings',        category: 'Physics',  icon: '🪃', difficulty: 3, desc: 'Slingshot projectiles at towers. Physics chain reactions.' },
  { slug: 'rope-cutter',     title: 'Rope Cutter',         category: 'Physics',  icon: '✂️', difficulty: 3, desc: 'Cut ropes to feed the treat. Timing matters.' },
  { slug: 'line-rider',      title: 'Line Rider',          category: 'Physics',  icon: '🛷', difficulty: 2, desc: 'Draw a track. Sledder rides it.' },

  // Runner Pack (5)
  { slug: 'flappy',          title: 'Flappy',              category: 'Runner',   icon: '🐤', difficulty: 3, desc: 'Tap to flap. Squeeze through pipes.' },
  { slug: 'doodle-jump',     title: 'Doodle Jump',         category: 'Runner',   icon: '🦘', difficulty: 3, desc: 'Auto-jump. Land on platforms, avoid the void.' },
  { slug: 'icy-tower',       title: 'Icy Tower',           category: 'Runner',   icon: '🧊', difficulty: 3, desc: 'Climb by chaining wall jumps. Screen scrolls up faster over time.' },
  { slug: 'subway-runner',   title: 'Subway Runner',       category: 'Runner',   icon: '🏃', difficulty: 3, desc: 'Three lanes. Dodge oncoming trains, jump barriers.' },
  { slug: 'temple-runner',   title: 'Temple Runner',       category: 'Runner',   icon: '🏛️', difficulty: 3, desc: 'Turn corners, jump gaps, slide under vines.' },

  // Retro Pack (5)
  { slug: 'pacman',          title: 'Pac-Man',             category: 'Retro',    icon: '🟡', difficulty: 3, desc: 'Chomp dots. Avoid ghosts. Eat power pellets to fight back.' },
  { slug: 'centipede',       title: 'Centipede',           category: 'Retro',    icon: '🐛', difficulty: 3, desc: 'Shoot the centipede as it winds down. Watch for spiders.' },
  { slug: 'tempest',         title: 'Tempest',             category: 'Retro',    icon: '🕳️', difficulty: 4, desc: 'Vector-graphics wireframe tunnel. Blast enemies climbing up.' },
  { slug: 'galaga',          title: 'Galaga',              category: 'Retro',    icon: '🚀', difficulty: 4, desc: 'Vertical scroller. Formation attacks. Rescue captured ships for double firepower.' },
  { slug: 'defender',        title: 'Defender',            category: 'Retro',    icon: '🛸', difficulty: 4, desc: 'Rescue humans from abductors on a scrolling planet.' },

  // Strategy Pack (5)
  { slug: 'tower-defense',   title: 'Tower Defense',       category: 'Strategy', icon: '🗼', difficulty: 4, desc: 'Build towers on a path. Waves of enemies march.' },
  { slug: 'mini-rts',        title: 'Mini RTS',            category: 'Strategy', icon: '⚔️', difficulty: 4, desc: 'Gather, build, command squads. Fog of war.' },
  { slug: 'city-builder',    title: 'City Builder',        category: 'Strategy', icon: '🏙️', difficulty: 3, desc: 'Zone, tax, watch neighbourhoods evolve.' },
  { slug: 'snake-ai',        title: 'Snake AI',            category: 'Strategy', icon: '🐍', difficulty: 3, desc: 'Watch a genetic-algorithm-trained snake play itself.' },
  { slug: 'sokoban',         title: 'Sokoban',             category: 'Strategy', icon: '📦', difficulty: 4, desc: 'Push boxes onto targets. No pulls.' },

  // Reflex Pack (5)
  { slug: 'whack',           title: 'Whack-a-Mole',        category: 'Reflex',   icon: '🔨', difficulty: 2, desc: 'Tap the moles as they pop up.' },
  { slug: 'simon',           title: 'Simon',               category: 'Reflex',   icon: '🎨', difficulty: 3, desc: 'Repeat the growing colour sequence.' },
  { slug: 'reaction',        title: 'Reaction Test',       category: 'Reflex',   icon: '⚡', difficulty: 1, desc: 'Wait for green. Tap as fast as possible.' },
  { slug: 'rhythm-tap',      title: 'Rhythm Tap',          category: 'Reflex',   icon: '🎵', difficulty: 3, desc: 'Tap on the beat. Four lanes, cascading notes.' },
  { slug: 'bullet-hell',     title: 'Bullet Hell',         category: 'Reflex',   icon: '🌸', difficulty: 5, desc: 'Weave through hundreds of projectiles.' },

  // Simulation Pack (5)
  { slug: 'game-of-life',    title: 'Game of Life',        category: 'Sim',      icon: '🦠', difficulty: 2, desc: 'Conway\'s classic. Paint cells, watch generations evolve.' },
  { slug: 'powder',          title: 'Powder Game',         category: 'Sim',      icon: '🏖️', difficulty: 2, desc: 'Falling-sand sim. Sand, water, fire, salt, plant.' },
  { slug: 'idle-miner',      title: 'Idle Miner',          category: 'Sim',      icon: '⛏️', difficulty: 1, desc: 'Auto-mine, buy upgrades, prestige.' },
  { slug: 'farming-sim',     title: 'Farming Sim',         category: 'Sim',      icon: '🌾', difficulty: 2, desc: 'Plant, water, harvest, sell. Seasons cycle.' },
  { slug: 'fishing-sim',     title: 'Fishing Sim',         category: 'Sim',      icon: '🎣', difficulty: 2, desc: 'Cast, hook, reel. Depth-based species.' },
]

// Lookup by slug — used by the /arcade/:slug route resolver and by the
// GameShell (to auto-look-up title/category if the caller doesn't pass
// them explicitly, though the caller *should* pass them for tree-shaking).
export const GAMES_BY_SLUG = GAMES.reduce((acc, g) => {
  acc[g.slug] = g
  return acc
}, {})

// Slug → PascalCase component name. Matches the file that the sibling
// agents will create at src/pages/arcade/<PascalSlug>.jsx.
export function toPascalCase(slug) {
  return slug
    .split('-')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('')
}
