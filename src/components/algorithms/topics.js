// Single source of truth for every algorithms topic.
//
// The hub page (`/algorithms`), the shell sidebar, mobile chip-bar,
// and the search bar all read from this list. To add a topic:
//   1. Push a row here
//   2. Create `src/pages/algorithms/<PageName>.jsx`
//   3. Register the route in `src/App.jsx`
//
// Fields:
//   slug        — URL segment under `/algorithms/<slug>`
//   title       — Display name (bold-cased, no leading em-dash)
//   category    — 'Data Structures' | 'Algorithms'
//   tags        — free-form tags used by the filter chip row
//   complexity  — 1-liner Big-O for card chip (average case)
//   summary     — one sentence, plain English, no jargon dump
//   featured    — surface on the hub's Featured Picks row
//
// Ordering follows the user's spec exactly — do not re-sort.

export const TOPICS = [
  // ─────────── I. Data Structures ───────────
  { slug: 'arrays',          title: 'Arrays',                       category: 'Data Structures', tags: ['DS'],                 complexity: 'O(1) index',    summary: 'Contiguous, index-addressable memory — the foundation every other structure builds on.' },
  { slug: 'linked-lists',    title: 'Linked Lists',                 category: 'Data Structures', tags: ['DS'],                 complexity: 'O(n) search',   summary: 'Pointer-chained nodes — cheap head insert, no random access.' },
  { slug: 'stacks',          title: 'Stacks',                       category: 'Data Structures', tags: ['DS'],                 complexity: 'O(1) push/pop', summary: 'LIFO discipline — the runtime that makes function calls, undo, and parsing work.' },
  { slug: 'queues',          title: 'Queues',                       category: 'Data Structures', tags: ['DS'],                 complexity: 'O(1) enq/deq',  summary: 'FIFO discipline — task schedulers, BFS frontiers, buffered streams.' },
  { slug: 'hash-tables',     title: 'Maps & Hash Tables',           category: 'Data Structures', tags: ['DS'],                 complexity: 'O(1) avg',      summary: 'Constant-time key lookups via a hash function plus a collision strategy.' },
  { slug: 'graphs',          title: 'Graphs',                       category: 'Data Structures', tags: ['DS', 'Graphs'],       complexity: 'O(V + E)',      summary: 'Nodes wired by edges — cities, followers, molecules, control flow, everything.' },
  { slug: 'trees',           title: 'Trees',                        category: 'Data Structures', tags: ['DS', 'Trees'],        complexity: 'O(log n)',      summary: 'Acyclic hierarchies — filesystems, DOM, syntax trees, decision structures.' },
  { slug: 'bst',             title: 'Binary Trees & BSTs',          category: 'Data Structures', tags: ['DS', 'Trees'],        complexity: 'O(log n) avg',  summary: 'Ordered binary trees with left < node < right — search, insert, delete in log time.', featured: true },
  { slug: 'balanced-trees',  title: 'Self-balancing Trees',         category: 'Data Structures', tags: ['DS', 'Trees'],        complexity: 'O(log n)',      summary: 'AVL, Red-Black, Splay — invariants that keep height bounded through rotations.' },
  { slug: 'heaps',           title: 'Heaps',                        category: 'Data Structures', tags: ['DS', 'Trees'],        complexity: 'O(log n) push', summary: 'Priority queues via a partial-order tree — top-k, scheduling, Dijkstra.', featured: true },
  { slug: 'tries',           title: 'Tries',                        category: 'Data Structures', tags: ['DS', 'Strings'],      complexity: 'O(k) lookup',   summary: 'Prefix trees for strings — autocomplete, spell-check, IP routing.' },
  { slug: 'segment-trees',   title: 'Segment Trees',                category: 'Data Structures', tags: ['DS', 'Trees'],        complexity: 'O(log n)',      summary: 'Range queries with point updates — sum, min, max on a moving window.' },
  { slug: 'fenwick-trees',   title: 'Fenwick Trees',                category: 'Data Structures', tags: ['DS', 'Trees'],        complexity: 'O(log n)',      summary: 'Binary-indexed prefix sums — cheaper cousin of the segment tree.' },
  { slug: 'dsu',             title: 'Disjoint Set Union',           category: 'Data Structures', tags: ['DS', 'Graphs'],       complexity: 'O(α(n))',       summary: 'Union-find with path compression — near-constant merge and lookup.' },
  { slug: 'mst',             title: 'Minimum Spanning Trees',       category: 'Data Structures', tags: ['DS', 'Graphs'],       complexity: 'O(E log V)',    summary: 'Kruskal + Prim — cheapest edge set that connects every node.' },

  // ─────────── II. Algorithms ───────────
  { slug: 'divide-conquer',   title: 'Divide and Conquer',                 category: 'Algorithms',      tags: ['ALGO'],                complexity: 'O(n log n)',    summary: 'Split, solve, combine — the mental model behind mergesort, FFT, Karatsuba.' },
  { slug: 'sorting',          title: 'Sorting',                            category: 'Algorithms',      tags: ['ALGO', 'Sorting'],     complexity: 'O(n log n)',    summary: 'Bubble, Counting, Quick, Merge, Radix — five sorts, five different tradeoffs.', featured: true },
  { slug: 'searching',        title: 'Searching',                          category: 'Algorithms',      tags: ['ALGO', 'Sorting'],     complexity: 'O(log n)',      summary: 'Linear vs binary — the moment sorted data starts paying dividends.' },
  { slug: 'sieve',            title: 'Sieve of Eratosthenes',              category: 'Algorithms',      tags: ['ALGO', 'Math'],        complexity: 'O(n log log n)', summary: 'Cross out multiples, keep the primes — the fastest way to enumerate them under n.' },
  { slug: 'kmp',              title: 'Knuth–Morris–Pratt',                 category: 'Algorithms',      tags: ['ALGO', 'Strings'],     complexity: 'O(n + m)',      summary: 'Substring search with a prefix table so we never re-scan matched characters.', featured: true },
  { slug: 'greedy-intervals', title: 'Greedy I — Non-overlapping Intervals', category: 'Algorithms',   tags: ['ALGO', 'Greedy'],      complexity: 'O(n log n)',    summary: 'Sort by end-time, pick greedily — provably optimal for max schedule.' },
  { slug: 'greedy-knapsack',  title: 'Greedy II — Fractional Knapsack',    category: 'Algorithms',      tags: ['ALGO', 'Greedy'],      complexity: 'O(n log n)',    summary: 'Highest value/weight ratio wins — greedy is optimal when items are divisible.' },
  { slug: 'dp-knapsack',      title: 'DP I — 0/1 Knapsack',                category: 'Algorithms',      tags: ['ALGO', 'DP'],          complexity: 'O(nW)',         summary: 'Fill a knapsack of capacity W with items you must take whole — classic 2D DP.', featured: true },
  { slug: 'dp-lcs',           title: 'DP II — Longest Common Subsequence', category: 'Algorithms',      tags: ['ALGO', 'DP'],          complexity: 'O(nm)',         summary: 'Diff, spell-check, DNA alignment — LCS is the shape they all reduce to.' },
  { slug: 'dp-lis',           title: 'DP III — Longest Increasing Subsequence', category: 'Algorithms', tags: ['ALGO', 'DP'],         complexity: 'O(n log n)',    summary: 'Patience sort trick lifts the naive n² down to n log n via binary search.' },
  { slug: 'convex-hull',      title: 'Convex Hull',                        category: 'Algorithms',      tags: ['ALGO', 'Geometry'],    complexity: 'O(n log n)',    summary: 'Wrap a point cloud in the tightest polygon — Graham scan, Andrew monotone chain.' },
  { slug: 'graph-traversal',  title: 'Graph Traversals — BFS & DFS',       category: 'Algorithms',      tags: ['ALGO', 'Graphs'],      complexity: 'O(V + E)',      summary: 'Level-by-level vs deep-first — the two lenses through which every graph is explored.' },
  { slug: 'floyd-warshall',   title: 'Floyd–Warshall',                     category: 'Algorithms',      tags: ['ALGO', 'Graphs'],      complexity: 'O(V^3)',        summary: 'All-pairs shortest paths through a DP over intermediate vertices.' },
  { slug: 'dijkstra-bellman', title: 'Dijkstra & Bellman–Ford',            category: 'Algorithms',      tags: ['ALGO', 'Graphs'],      complexity: 'O(E log V)',    summary: 'Single-source shortest paths — greedy vs relaxation, positive vs negative weights.', featured: true },
  { slug: 'topological-sort', title: 'Topological Sort',                   category: 'Algorithms',      tags: ['ALGO', 'Graphs'],      complexity: 'O(V + E)',      summary: 'Linear ordering of a DAG — build systems, course prerequisites, task graphs.' },
]

export const TOPICS_BY_SLUG = Object.fromEntries(TOPICS.map(t => [t.slug, t]))

// Curated featured strip on the hub — 6 topics the user learns most from.
// Falls back to the `.featured` flags on TOPICS in the same order they appear.
export const FEATURED_SLUGS = TOPICS.filter(t => t.featured).map(t => t.slug)

export const CATEGORIES = ['Data Structures', 'Algorithms']

// Filter chips on the hub. Kept short — one word each so the chip row
// stays on a single line at desktop widths.
export const FILTERS = [
  { key: 'all',        label: 'All' },
  { key: 'ds',         label: 'Data Structures', match: t => t.category === 'Data Structures' },
  { key: 'algos',      label: 'Algorithms',      match: t => t.category === 'Algorithms' },
  { key: 'sorting',    label: 'Sorting',         match: t => t.tags.includes('Sorting') },
  { key: 'graphs',     label: 'Graphs',          match: t => t.tags.includes('Graphs') },
  { key: 'dp',         label: 'DP',              match: t => t.tags.includes('DP') },
  { key: 'trees',      label: 'Trees',           match: t => t.tags.includes('Trees') },
  { key: 'greedy',     label: 'Greedy',          match: t => t.tags.includes('Greedy') },
  { key: 'strings',    label: 'Strings',         match: t => t.tags.includes('Strings') },
  { key: 'geometry',   label: 'Geometry',        match: t => t.tags.includes('Geometry') },
  { key: 'math',       label: 'Math',            match: t => t.tags.includes('Math') },
]
