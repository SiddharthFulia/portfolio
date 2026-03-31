import { useState, useRef, useEffect } from 'react'
import BSTVisualizer from '../components/lab/BSTVisualizer'
import RedBlackTree from '../components/lab/RedBlackTree'
import HeapVisualizer from '../components/lab/HeapVisualizer'
import DPVisualizer from '../components/lab/DPVisualizer'
import SortingVisualizer from '../components/lab/SortingVisualizer'
import GraphTraversal from '../components/lab/GraphTraversal'

function FadeIn({ children, delay = 0, className = '' }) {
  const ref = useRef()
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect() } },
      { threshold: 0.08 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(36px)',
        transition: `opacity 0.6s ease ${delay}s, transform 0.6s ease ${delay}s`,
      }}
    >
      {children}
    </div>
  )
}

const CATEGORIES = ['All', 'DSA', 'Algorithms', 'CP', 'System Design', 'Web Dev']

const DIFF_COLORS = {
  Beginner: 'bg-green-900/60 text-green-400 border-green-700/50',
  Intermediate: 'bg-yellow-900/60 text-yellow-400 border-yellow-700/50',
  Advanced: 'bg-red-900/60 text-red-400 border-red-700/50',
}

function CodeBlock({ code }) {
  return (
    <pre className="bg-gray-950 border border-gray-700/60 rounded-lg p-4 overflow-x-auto text-sm font-mono text-green-300 leading-relaxed whitespace-pre-wrap">
      <code>{code}</code>
    </pre>
  )
}

function StepContent({ step }) {
  const renderContent = (text) => {
    const parts = text.split(/(~~~[\s\S]*?~~~|\*\*[^*]+\*\*|~[^~]+~)/g)
    return parts.map((part, i) => {
      if (part.startsWith('~~~') && part.endsWith('~~~')) {
        const code = part.slice(3, -3).replace(/^\w+\n/, '')
        return <CodeBlock key={i} code={code} />
      }
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="text-white font-semibold">{part.slice(2, -2)}</strong>
      }
      if (part.startsWith('~') && part.endsWith('~')) {
        return <code key={i} className="bg-gray-800 text-cyan-300 px-1.5 py-0.5 rounded text-sm font-mono">{part.slice(1, -1)}</code>
      }
      return part.split('\n').map((line, j) => {
        if (line.startsWith('- ')) return <li key={j} className="ml-4 text-gray-300 list-disc">{line.slice(2)}</li>
        if (line.match(/^\d+\./)) return <li key={j} className="ml-4 text-gray-300 list-decimal">{line.replace(/^\d+\.\s*/, '')}</li>
        if (line.trim() === '') return <br key={j} />
        return <span key={j}>{line}</span>
      })
    })
  }

  return (
    <div className="prose prose-invert max-w-none space-y-3 text-gray-300 leading-relaxed text-sm">
      {renderContent(step.content)}
      {step.code && <CodeBlock code={step.code} />}
    </div>
  )
}

const VISUAL_MAP = {
  'bst': <BSTVisualizer />,
  'rbtree': <RedBlackTree />,
  'heap': <HeapVisualizer />,
  'dp': <DPVisualizer />,
  'sorting': <SortingVisualizer />,
  'graph': <GraphTraversal />,
}

const TUTORIALS = [
  {
    id: 'bst',
    icon: '🌳',
    title: 'Binary Search Tree',
    category: 'DSA',
    difficulty: 'Beginner',
    time: '15 min',
    description: 'Understand BST insertion, search, deletion, and all three traversal orders with a live visualizer.',
    steps: [
      {
        title: 'What is a Binary Search Tree?',
        content: `A **Binary Search Tree (BST)** is a binary tree where each node satisfies the BST property:

- Every node in the **left subtree** has a value **less than** the parent
- Every node in the **right subtree** has a value **greater than** the parent
- Both subtrees are themselves valid BSTs

This ordering property is what makes BSTs powerful — it lets us discard half the tree at every step during search.

**Time Complexities:**
- Average case: O(log n) for search, insert, delete
- Worst case: O(n) for a skewed tree (e.g., inserting 1,2,3,4,5 in order)

The BST is the foundation for more advanced self-balancing trees like AVL Trees and Red-Black Trees.`,
        visual: null,
      },
      {
        title: 'Insert Operation',
        content: `To **insert** a value into a BST:

1. Start at the root
2. If the value is less than the current node, go left
3. If the value is greater, go right
4. Repeat until you reach a null spot — insert there

\`\`\`js
function insert(root, val) {
  if (!root) return new Node(val)
  if (val < root.val) root.left = insert(root.left, val)
  else if (val > root.val) root.right = insert(root.right, val)
  return root
}
\`\`\`

**Try it below** — type a number and click Insert to see the node placed in the tree. Notice how the tree path is traversed to find the correct position.`,
        visual: 'bst',
      },
      {
        title: 'Search Operation',
        content: `**Searching** a BST is elegantly simple:

1. Compare the target with the current node
2. If equal — found!
3. If target < current — search left subtree
4. If target > current — search right subtree
5. If null — not found

\`\`\`js
function search(root, val) {
  if (!root || root.val === val) return root
  if (val < root.val) return search(root.left, val)
  return search(root.right, val)
}
\`\`\`

**Why is this O(log n)?** A balanced BST of n nodes has height ≈ log₂(n). Each comparison eliminates half the remaining nodes, just like binary search on a sorted array.`,
        visual: null,
      },
      {
        title: 'Tree Traversals',
        content: `There are three classic DFS traversals of a binary tree:

**In-order (Left → Root → Right)**
Visits nodes in sorted ascending order — very useful for BSTs.
\`\`\`js
function inOrder(node) {
  if (!node) return
  inOrder(node.left)
  print(node.val)   // root visited between children
  inOrder(node.right)
}
\`\`\`

**Pre-order (Root → Left → Right)**
Root is visited first. Used for copying a tree or prefix expressions.

**Post-order (Left → Right → Root)**
Root is visited last. Used for deleting a tree or postfix expressions.

Use the traversal buttons in the visualizer below to see the order nodes are visited. In-order on a BST always gives a sorted sequence!`,
        visual: 'bst',
      },
    ],
  },
  {
    id: 'rbtree',
    icon: '🔴',
    title: 'Red-Black Tree',
    category: 'DSA',
    difficulty: 'Advanced',
    time: '25 min',
    description: 'Learn how self-balancing Red-Black Trees guarantee O(log n) operations with rotations and recoloring.',
    steps: [
      {
        title: 'Why Self-Balancing? The BST Worst Case',
        content: `A plain BST has a fatal flaw: **insertion order matters**.

If you insert values in sorted order (1, 2, 3, 4, 5...), the tree degenerates into a **linked list** — height O(n) instead of O(log n). Every operation becomes linear time.

**Example:**
- Insert: 10, 20, 30, 40, 50
- Result: a right-skewed tree, each node has only a right child

Self-balancing trees solve this by automatically restructuring after insertions and deletions to maintain a height of O(log n).

**Common self-balancing BSTs:**
- **AVL Tree** — strictly balanced, height difference ≤ 1 per node
- **Red-Black Tree** — looser balance guarantee, fewer rotations in practice
- **B-Tree** — used in databases, generalizes to m-way branching
- **Splay Tree** — amortized O(log n), recently accessed nodes move to root

Red-Black Trees are preferred in many standard libraries because they have fewer rotations on average than AVL trees.`,
        visual: null,
      },
      {
        title: 'The 5 Red-Black Properties',
        content: `Every valid Red-Black Tree must satisfy these **5 rules**:

1. **Every node is either Red or Black**
2. **The root is Black**
3. **All NIL leaf nodes are Black** (sentinel nodes)
4. **If a node is Red, both its children are Black** (no two consecutive red nodes)
5. **All simple paths from any node to its descendant NIL nodes have the same number of Black nodes** (Black-height invariant)

**Why do these rules guarantee O(log n) height?**

Property 4 means we can't have two consecutive red nodes. Property 5 ensures Black-height is uniform. Combined, this means the longest path (alternating red-black) is at most **2× the shortest path** (all black). So height ≤ 2 log₂(n+1).

**Key insight:** The Black-height bh(n) ≥ ½ × height(n). A tree with n internal nodes has height ≤ 2·log(n+1).`,
        visual: null,
      },
      {
        title: 'Insertions, Rotations & Fix-up',
        content: `New nodes are **always inserted as Red** (to avoid changing black-height immediately).

After insertion, we may violate Property 4 (red node with red parent). The fix-up has 3 cases:

**Case 1: Uncle is Red**
Recolor: parent → Black, uncle → Black, grandparent → Red.
Then move up and check grandparent.

**Case 2: Uncle is Black, node is inner child**
Rotate parent toward outer position (left or right rotation).
This converts it to Case 3.

**Case 3: Uncle is Black, node is outer child**
Rotate grandparent and recolor: parent → Black, grandparent → Red.

\`\`\`
Left Rotation at x:          Right Rotation at y:
    x                              y
   / \\      ──────>              / \\
  A   y                         x   C
     / \\    <──────            / \\
    B   C                     A   B
\`\`\`

Watch the animated visualizer below — each rotation and recolor is shown step-by-step with status messages.`,
        visual: 'rbtree',
      },
      {
        title: 'Real-World Usage',
        content: `Red-Black Trees are everywhere in production systems:

**Java — TreeMap & TreeSet**
\`\`\`java
TreeMap<Integer, String> map = new TreeMap<>();
map.put(5, "five");  // O(log n) insert
map.get(3);          // O(log n) search
// Internally a Red-Black Tree
\`\`\`

**C++ STL — std::map & std::set**
\`\`\`cpp
std::map<int, std::string> m;
m[10] = "ten";  // Red-Black Tree insertion
// Guaranteed O(log n) for all operations
\`\`\`

**Linux Kernel — Completely Fair Scheduler (CFS)**
The CFS uses an RB-Tree keyed by virtual runtime to track processes. The leftmost node (minimum vruntime) is the next process to run — O(log n) scheduling decisions.

**Other uses:**
- Nginx's timer management
- Git's object database indexing
- CLRS textbook — the canonical self-balancing BST for education

The consistent O(log n) worst-case guarantee (unlike hash maps which can degrade) makes RB-Trees essential where predictable latency matters.`,
        visual: null,
      },
    ],
  },
  {
    id: 'heap',
    icon: '⛰️',
    title: 'Heap & Priority Queue',
    category: 'DSA',
    difficulty: 'Intermediate',
    time: '20 min',
    description: 'Master the heap data structure — array representation, sift-up/down, heap sort, and Dijkstra\'s algorithm.',
    steps: [
      {
        title: 'What is a Heap? Array Representation',
        content: `A **heap** is a complete binary tree satisfying the **heap property**:

- **Min-Heap:** Every parent ≤ its children (root is the minimum)
- **Max-Heap:** Every parent ≥ its children (root is the maximum)

**The clever part: heaps are stored in arrays!**

For a node at index ~i~ (0-indexed):
- Parent: ~Math.floor((i - 1) / 2)~
- Left child: ~2i + 1~
- Right child: ~2i + 2~

\`\`\`
Min-Heap:        Array: [10, 20, 15, 40, 30, 50, 25]
       10         index:  0   1   2   3   4   5   6
      /  \\
    20    15
   / \\   / \\
  40  30 50  25
\`\`\`

This array packing works because heaps are **complete** binary trees — every level is fully filled except possibly the last, which fills left to right. No pointers needed!`,
        visual: null,
      },
      {
        title: 'Sift-Up & Sift-Down',
        content: `Two fundamental operations maintain the heap property:

**Sift-Up (used after Insert):**
Add the new element at the end of the array, then "bubble up":
\`\`\`js
function siftUp(heap, i) {
  while (i > 0) {
    const parent = Math.floor((i - 1) / 2)
    if (heap[i] < heap[parent]) {   // min-heap
      [heap[i], heap[parent]] = [heap[parent], heap[i]]
      i = parent
    } else break
  }
}
\`\`\`

**Sift-Down (used after Extract):**
Replace root with last element, remove last, then "sink down":
\`\`\`js
function siftDown(heap, i) {
  const n = heap.length
  while (true) {
    let smallest = i
    const l = 2*i+1, r = 2*i+2
    if (l < n && heap[l] < heap[smallest]) smallest = l
    if (r < n && heap[r] < heap[smallest]) smallest = r
    if (smallest === i) break
    [heap[i], heap[smallest]] = [heap[smallest], heap[i]]
    i = smallest
  }
}
\`\`\`

Both operations are **O(log n)** — the height of a complete binary tree with n nodes is ⌊log₂ n⌋.`,
        visual: 'heap',
      },
      {
        title: 'Heap Sort',
        content: `**Heap Sort** is an elegant O(n log n) sorting algorithm using the heap:

**Phase 1 — Build a Max-Heap: O(n)**
Using the "heapify" approach (sift-down from the last internal node), we can build a heap in O(n) time — better than inserting n elements one-by-one which is O(n log n).
\`\`\`js
// Build max-heap in-place
for (let i = Math.floor(n/2) - 1; i >= 0; i--) {
  siftDown(arr, i, n)
}
\`\`\`

**Phase 2 — Extract max repeatedly: O(n log n)**
Swap root (max) with last element, reduce heap size, sift-down:
\`\`\`js
for (let i = n - 1; i > 0; i--) {
  [arr[0], arr[i]] = [arr[i], arr[0]]  // move max to end
  siftDown(arr, 0, i)                   // fix remaining heap
}
\`\`\`

**Properties of Heap Sort:**
- Time: O(n log n) guaranteed (no worst case like quicksort)
- Space: O(1) — in-place sorting
- **Not stable** — equal elements may change relative order
- Poor cache performance (jumps around in memory) — slower than quicksort in practice`,
        visual: null,
      },
      {
        title: 'Real-World: Dijkstra & Task Schedulers',
        content: `**Priority queues** (backed by heaps) are essential in many algorithms:

**Dijkstra's Shortest Path — O((V + E) log V)**
\`\`\`js
// Min-heap of [distance, vertex]
const pq = new MinHeap()
pq.insert([0, source])
dist[source] = 0

while (!pq.isEmpty()) {
  const [d, u] = pq.extractMin()
  if (d > dist[u]) continue  // stale entry
  for (const [v, w] of graph[u]) {
    if (dist[u] + w < dist[v]) {
      dist[v] = dist[u] + w
      pq.insert([dist[v], v])
    }
  }
}
\`\`\`

The heap ensures we always process the nearest unvisited vertex first.

**Other real-world uses:**
- **OS Task Schedulers** — CPU jobs sorted by priority or deadline
- **A* Pathfinding** — priority queue ordered by f(n) = g(n) + h(n)
- **Huffman Coding** — build optimal prefix-free codes by repeatedly merging lowest-frequency nodes
- **Median Maintenance** — use two heaps (max-heap for lower half, min-heap for upper half) to find the running median in O(log n) per insertion
- **K-way Merge** — merge k sorted lists using a min-heap of size k`,
        visual: null,
      },
    ],
  },
  {
    id: 'dp',
    icon: '🧮',
    title: 'Dynamic Programming',
    category: 'Algorithms',
    difficulty: 'Intermediate',
    time: '30 min',
    description: 'Demystify DP — overlapping subproblems, optimal substructure, memoization vs tabulation, and 3 classic problems.',
    steps: [
      {
        title: 'Overlapping Subproblems & Optimal Substructure',
        content: `**Dynamic Programming** applies when a problem has two key properties:

**1. Overlapping Subproblems**
The same smaller subproblems are solved repeatedly. For Fibonacci:
\`\`\`
fib(5) → fib(4) + fib(3)
fib(4) → fib(3) + fib(2)   ← fib(3) computed AGAIN
fib(3) → fib(2) + fib(1)   ← fib(2) computed AGAIN
\`\`\`
A naive recursive solution is exponential — O(2ⁿ). DP stores each answer once.

**2. Optimal Substructure**
The optimal solution to the problem can be built from optimal solutions to its subproblems.

Example: The shortest path from A to C through B = (shortest path A→B) + (shortest path B→C). This holds for Dijkstra, Bellman-Ford, Floyd-Warshall.

**Counter-example:** Longest path in a graph does NOT have optimal substructure (cycles can exist). DP doesn't apply.

**The DP mindset:** Think about what decision you're making at each step, and what state captures everything you need to make that decision.`,
        visual: null,
      },
      {
        title: 'Memoization vs Tabulation',
        content: `There are two equivalent approaches to implementing DP:

**Top-Down: Memoization (Recursive + Cache)**
Write the natural recursion, cache results in a map:
\`\`\`js
const memo = new Map()
function fib(n) {
  if (n <= 1) return n
  if (memo.has(n)) return memo.get(n)
  const result = fib(n-1) + fib(n-2)
  memo.set(n, result)
  return result
}
// Time: O(n), Space: O(n), call stack depth: O(n)
\`\`\`

**Bottom-Up: Tabulation (Iterative + Table)**
Fill a table from base cases upward:
\`\`\`js
function fib(n) {
  const dp = [0, 1]
  for (let i = 2; i <= n; i++) {
    dp[i] = dp[i-1] + dp[i-2]
  }
  return dp[n]
}
// Time: O(n), Space: O(n) — can optimize to O(1)
\`\`\`

**When to use which:**
- **Memoization** — easier to implement, only computes needed states (good when many states are unreachable)
- **Tabulation** — no recursion overhead, better cache performance, easier to optimize space

**Space optimization:** For Fibonacci, you only need the last 2 values — O(1) space. For LCS you only need 2 rows — O(min(m,n)) space.`,
        visual: null,
      },
      {
        title: 'Classic DP Problems — Interactive',
        content: `Explore three foundational DP problems with animated tables below.

**Fibonacci** — 1D DP, memoization table fills left to right.

**Longest Common Subsequence (LCS)**
Find the longest subsequence common to both strings (not necessarily contiguous):
\`\`\`
LCS("ABCBDAB", "BDCAB") = "BCAB" or "BDAB" (length 4)
\`\`\`
The 2D table builds on overlapping subproblems: each cell uses the cell above, left, and diagonally above-left.

**0/1 Knapsack**
Given items with weights and values, maximize value within capacity W.
Each item can be taken (1) or left (0) — no fractions.
\`\`\`
dp[i][w] = max value using first i items with capacity w
         = max(dp[i-1][w],           // skip item i
               dp[i-1][w-w_i] + v_i) // take item i
\`\`\`

Select a tab and click **Compute/Solve** to watch the table fill step-by-step.`,
        visual: 'dp',
      },
      {
        title: 'DP on Trees & Graphs',
        content: `DP extends beyond arrays to trees and graphs:

**Tree DP — Diameter of a Binary Tree**
\`\`\`js
function diameterDP(root) {
  let maxDiam = 0
  function depth(node) {
    if (!node) return 0
    const left = depth(node.left)
    const right = depth(node.right)
    maxDiam = Math.max(maxDiam, left + right)  // path through this node
    return 1 + Math.max(left, right)
  }
  depth(root)
  return maxDiam
}
\`\`\`

**DP on DAGs — Longest Path**
Topological sort, then relax edges in order. O(V + E).

**Bitmask DP — Travelling Salesman Problem (TSP)**
For small n (≤ 20), use bitmask to represent visited cities:
\`\`\`js
// dp[mask][i] = min cost to visit cities in mask, ending at i
dp[1 << src][src] = 0
for each mask, for each city i in mask:
  for each city j not in mask:
    dp[mask | (1<<j)][j] = min(dp[mask][j],
                               dp[mask][i] + dist[i][j])
// O(2^n * n^2) — feasible for n ≤ 20
\`\`\`

**Interval DP — Matrix Chain Multiplication**
\`\`\`
dp[i][j] = min multiplications to compute A_i × ... × A_j
         = min over k of: dp[i][k] + dp[k+1][j] + p[i]*p[k+1]*p[j+1]
\`\`\``,
        visual: null,
      },
    ],
  },
  {
    id: 'sorting',
    icon: '📊',
    title: 'Sorting Deep Dive',
    category: 'Algorithms',
    difficulty: 'Beginner',
    time: '20 min',
    description: 'From the O(n log n) lower bound proof to merge sort anatomy and quicksort pivot strategies.',
    steps: [
      {
        title: 'The O(n log n) Lower Bound',
        content: `Can we sort faster than O(n log n)? For comparison-based sorting — **provably no**.

**Decision Tree Argument:**
Any sorting algorithm that uses comparisons can be modeled as a binary decision tree:
- Each internal node: one comparison (a < b?)
- Each leaf: one permutation of the sorted output
- A valid sort must produce all n! possible orderings as leaves

For n elements: **n! leaves** → tree height ≥ log₂(n!) ≈ n log n (by Stirling's approximation).

The height of the tree = worst-case number of comparisons. So any comparison sort needs at least **Ω(n log n)** comparisons.

**Algorithms achieving O(n log n):** Merge Sort, Heap Sort, Quick Sort (average)

**Breaking the barrier with non-comparison sorts:**
- **Counting Sort** — O(n + k) when values in [0, k]
- **Radix Sort** — O(d·(n + k)) for d-digit numbers base k
- **Bucket Sort** — O(n) average for uniformly distributed data

These work by exploiting structure in the keys, not just comparing them.`,
        visual: null,
      },
      {
        title: 'Merge Sort Anatomy',
        content: `Merge sort is the classic **divide-and-conquer** sort:

\`\`\`js
function mergeSort(arr) {
  if (arr.length <= 1) return arr
  const mid = Math.floor(arr.length / 2)
  const left = mergeSort(arr.slice(0, mid))   // T(n/2)
  const right = mergeSort(arr.slice(mid))      // T(n/2)
  return merge(left, right)                    // O(n)
}

function merge(left, right) {
  const result = []
  let i = 0, j = 0
  while (i < left.length && j < right.length) {
    if (left[i] <= right[j]) result.push(left[i++])
    else result.push(right[j++])
  }
  return result.concat(left.slice(i)).concat(right.slice(j))
}
// Recurrence: T(n) = 2T(n/2) + O(n) → O(n log n) by Master Theorem
\`\`\`

**Properties:**
- **Stable** — equal elements maintain original relative order
- **O(n log n)** in all cases (worst, average, best)
- **O(n) extra space** — the main downside (not in-place)

**Real use:** Node.js Array.prototype.sort uses TimSort (hybrid merge sort + insertion sort). Java's Arrays.sort for objects uses TimSort.`,
        visual: null,
      },
      {
        title: 'Quick Sort Pivot Strategies',
        content: `Quick sort is often the fastest in practice despite O(n²) worst case:

\`\`\`js
function quickSort(arr, lo, hi) {
  if (lo >= hi) return
  const pivot = partition(arr, lo, hi)
  quickSort(arr, lo, pivot - 1)
  quickSort(arr, pivot + 1, hi)
}
\`\`\`

**Pivot Selection Strategies:**

**1. Last element** — simple but O(n²) on already-sorted arrays
\`\`\`js
const pivot = arr[hi]
\`\`\`

**2. Random pivot** — eliminates adversarial worst case
\`\`\`js
const randIdx = lo + Math.floor(Math.random() * (hi - lo + 1))
swap(arr, randIdx, hi)
\`\`\`

**3. Median-of-three** — pick median of first, middle, last
\`\`\`js
const mid = Math.floor((lo + hi) / 2)
// sort arr[lo], arr[mid], arr[hi] and use arr[mid] as pivot
\`\`\`

**4. Introsort (C++ std::sort)** — quicksort with fallback to heapsort when recursion depth > 2·log n. Guarantees O(n log n) worst case.

**3-way partition (Dutch National Flag):** For arrays with many duplicates, partition into ~< pivot~, ~== pivot~, ~> pivot~. Reduces O(n²) duplicates case to O(n).`,
        visual: 'sorting',
      },
      {
        title: 'Live Sorting Comparison',
        content: `Use the visualizer to compare all sorting algorithms side-by-side.

**Which algorithm should you use?**

| Situation | Best choice |
|-----------|-------------|
| General purpose | TimSort (merge + insertion) |
| Memory constrained | Heap Sort |
| Nearly sorted | Insertion Sort O(nk) |
| Linked list | Merge Sort |
| Integer keys, small range | Counting Sort |
| Large integers / strings | Radix Sort |
| External sorting (disk) | External Merge Sort |

**Stability matters when:** sorting by multiple keys, or when the original order of equal elements is meaningful (e.g., spreadsheet rows sorted by one column that were already sorted by another).

Try different array sizes and starting configurations to see how each algorithm performs. Notice how quicksort typically requires the fewest operations on random data despite its O(n²) worst case.`,
        visual: 'sorting',
      },
    ],
  },
  {
    id: 'graph',
    icon: '🕸️',
    title: 'Graph Algorithms',
    category: 'Algorithms',
    difficulty: 'Intermediate',
    time: '25 min',
    description: 'Graph representations, BFS vs DFS, Dijkstra, Bellman-Ford, and Floyd-Warshall — all explained with interactive demos.',
    steps: [
      {
        title: 'Graph Representations',
        content: `A graph G = (V, E) can be stored in two main ways:

**Adjacency List** — array of lists, one per vertex
\`\`\`js
// 4 vertices, edges: 0-1, 0-2, 1-3, 2-3
const graph = [
  [1, 2],    // neighbors of 0
  [0, 3],    // neighbors of 1
  [0, 3],    // neighbors of 2
  [1, 2],    // neighbors of 3
]
\`\`\`
Space: O(V + E). Iterating neighbors: O(degree). Best for **sparse graphs**.

**Adjacency Matrix** — V×V boolean/weight matrix
\`\`\`js
const mat = [
  [0, 1, 1, 0],
  [1, 0, 0, 1],
  [1, 0, 0, 1],
  [0, 1, 1, 0],
]
\`\`\`
Space: O(V²). Edge existence check: O(1). Best for **dense graphs** or when you need fast edge lookups.

**Edge List** — array of [u, v, weight] tuples
Used in Kruskal's MST algorithm — sort edges by weight.

**When to use what:**
- Sparse graph (E ≪ V²): **Adjacency list**
- Dense graph (E ≈ V²): **Adjacency matrix**
- Sorting edges (Kruskal's): **Edge list**`,
        visual: null,
      },
      {
        title: 'BFS vs DFS — When to Use Which',
        content: `**Breadth-First Search (BFS)** — explores level by level using a queue:
\`\`\`js
function bfs(graph, start) {
  const visited = new Set([start])
  const queue = [start]
  while (queue.length) {
    const u = queue.shift()
    for (const v of graph[u]) {
      if (!visited.has(v)) {
        visited.add(v)
        queue.push(v)
      }
    }
  }
}
// Time: O(V + E), Space: O(V)
\`\`\`

**Depth-First Search (DFS)** — explores as deep as possible using a stack/recursion:
\`\`\`js
function dfs(graph, u, visited = new Set()) {
  visited.add(u)
  for (const v of graph[u]) {
    if (!visited.has(v)) dfs(graph, v, visited)
  }
}
// Time: O(V + E), Space: O(V) recursion stack
\`\`\`

**Use BFS for:**
- Shortest path in **unweighted** graphs (guaranteed shortest)
- Level-order traversal
- Bipartite checking
- Web crawlers (explore by distance)

**Use DFS for:**
- Cycle detection
- Topological sort
- Strongly connected components (Tarjan's, Kosaraju's)
- Maze solving, backtracking problems`,
        visual: 'graph',
      },
      {
        title: 'Interactive Graph Traversal',
        content: `Click nodes in the visualizer to start BFS or DFS traversal. Watch the frontier expand as nodes are discovered.

**Key observation:** BFS builds a shortest-path tree. For unweighted graphs, the BFS tree gives the minimum hop count from the source to every reachable vertex.

DFS builds a DFS tree with 4 types of edges (in directed graphs):
- **Tree edges** — edges in the DFS tree
- **Back edges** — to an ancestor (indicate a cycle)
- **Forward edges** — to a descendant not via tree edge
- **Cross edges** — to a node in a different subtree

**DFS timestamps:** Each node gets a discovery time d[v] and finish time f[v].
These enable:
- **Topological Sort:** Output nodes in decreasing order of finish time
- **Kosaraju's SCC:** Two DFS passes on G and Gᵀ`,
        visual: 'graph',
      },
      {
        title: 'Dijkstra, Bellman-Ford & Floyd-Warshall',
        content: `**Dijkstra's Algorithm — O((V+E) log V)**
Single-source shortest paths on graphs with **non-negative weights**.
\`\`\`js
// Min-heap based — greedily visits nearest unvisited vertex
// Fails with negative edges (greedy assumption breaks)
\`\`\`

**Bellman-Ford — O(V·E)**
Single-source, handles **negative edge weights**, detects negative cycles.
\`\`\`js
for (let i = 0; i < V - 1; i++) {
  for (const [u, v, w] of edges) {
    if (dist[u] + w < dist[v]) dist[v] = dist[u] + w
  }
}
// On the V-th pass: if any edge still relaxes → negative cycle
\`\`\`

**Floyd-Warshall — O(V³)**
All-pairs shortest paths. Works with negative weights (no negative cycles).
\`\`\`js
// dp[i][j][k] = shortest path from i to j using only vertices 0..k
for (let k = 0; k < V; k++)
  for (let i = 0; i < V; i++)
    for (let j = 0; j < V; j++)
      dist[i][j] = Math.min(dist[i][j], dist[i][k] + dist[k][j])
// Each k: "can we do better routing through vertex k?"
\`\`\`

**Choosing the right algorithm:**
- Non-negative weights, single source: **Dijkstra**
- Negative weights, single source: **Bellman-Ford**
- All-pairs, dense graph: **Floyd-Warshall**
- Unweighted, single source: **BFS**`,
        visual: null,
      },
    ],
  },
  {
    id: 'cp',
    icon: '🏆',
    title: 'Competitive Programming Roadmap',
    category: 'CP',
    difficulty: 'Advanced',
    time: '40 min',
    description: 'A structured path from beginner to expert CP: contest strategy, essential DS, patterns, and STL mastery.',
    steps: [
      {
        title: 'Contest Strategy & Time Management',
        content: `Competitive programming is as much about strategy as it is about algorithms.

**Reading the problem set first (5 min):**
- Skim all problems, sort by perceived difficulty
- Attempt the easiest first — partial credit from easy problems beats partial credit from hard ones
- If you get stuck on a problem for >20 min without progress, move on

**During the contest:**
- **ICPC-style:** First read, categorize: "I can solve this", "maybe", "hard"
- **Codeforces:** Problems increase in difficulty (A < B < C < D). Always start at A.
- **Time box:** Set a mental limit per problem based on contest duration

**Debugging quickly:**
- Start with small manual test cases
- Print intermediate values to trace logic
- Test edge cases: n=0, n=1, all-same values, max constraints

**Practice resources:**
- **Codeforces** (cf.rating) — most competitive, great for learning
- **AtCoder** (AtCoder Beginner/Regular/Grand) — excellent problem quality
- **LeetCode** — interview prep, weaker on CP algorithms
- **USACO** — excellent structured curriculum from Bronze to Platinum`,
        visual: null,
      },
      {
        title: 'Essential Data Structures Checklist',
        content: `Master these data structures before entering rated contests:

**Level 1 — Fundamentals (must know perfectly):**
- Arrays, strings, sorting
- Hash maps / hash sets — O(1) average lookup
- Stacks, queues, deques
- Binary search (and binary search on answer)

**Level 2 — Intermediate:**
- Priority queues (heaps)
- Union-Find (DSU) — O(α(n)) amortized with path compression
- Binary Indexed Tree (Fenwick Tree) — range sum queries in O(log n)
- Segment Tree — range queries + point updates in O(log n)

**Level 3 — Advanced:**
- Lazy Propagation Segment Tree — range updates + range queries
- Trie — string prefix matching in O(L) per query
- Sparse Table — O(1) range minimum queries (offline)
- Square Root Decomposition — O(√n) per query, simple to implement
- Persistent Data Structures — retain all historical versions

\`\`\`cpp
// DSU template
int parent[MAXN], rank_[MAXN];
int find(int x) { return parent[x] == x ? x : parent[x] = find(parent[x]); }
void unite(int a, int b) {
  a = find(a); b = find(b);
  if (a == b) return;
  if (rank_[a] < rank_[b]) swap(a, b);
  parent[b] = a;
  if (rank_[a] == rank_[b]) rank_[a]++;
}
\`\`\``,
        visual: null,
      },
      {
        title: 'Common Patterns: Sliding Window, Two Pointers, Binary Search on Answer',
        content: `These three patterns appear in ~40% of CP problems. Master them.

**Sliding Window — O(n)**
Find max/min subarray satisfying a condition:
\`\`\`cpp
// Max sum subarray of length exactly k
int maxSum = 0, windowSum = 0;
for (int i = 0; i < n; i++) {
    windowSum += a[i];
    if (i >= k) windowSum -= a[i - k];
    if (i >= k - 1) maxSum = max(maxSum, windowSum);
}
\`\`\`

**Two Pointers — O(n)**
Pair with given sum, three-sum, container with most water:
\`\`\`cpp
// Two sum in sorted array
int lo = 0, hi = n - 1;
while (lo < hi) {
    int sum = a[lo] + a[hi];
    if (sum == target) return {lo, hi};
    else if (sum < target) lo++;
    else hi--;
}
\`\`\`

**Binary Search on Answer — O(log(range) × O(check))**
"Find the minimum X such that condition(X) is true":
\`\`\`cpp
// "Can we do this with answer = mid?" must be monotone
int lo = minPossible, hi = maxPossible;
while (lo < hi) {
    int mid = lo + (hi - lo) / 2;
    if (canAchieve(mid)) hi = mid;
    else lo = mid + 1;
}
// Answer is lo
\`\`\`

Examples: minimum time to finish tasks, minimum distance, minimum cost — all classic binary-search-on-answer problems.`,
        visual: null,
      },
      {
        title: 'STL Mastery for C++',
        content: `The C++ STL is a superpower in competitive programming.

**Essential containers:**
\`\`\`cpp
vector<int> v;          // dynamic array, O(1) amortized push_back
set<int> s;             // RB-Tree, O(log n) insert/find/erase
map<int,int> m;         // RB-Tree, O(log n) key-value store
unordered_map<int,int>; // hash map, O(1) avg — faster than map
priority_queue<int> pq; // max-heap
priority_queue<int, vector<int>, greater<int>> minpq; // min-heap
deque<int> dq;          // double-ended queue
\`\`\`

**Power moves:**
\`\`\`cpp
// Sort + binary search
sort(v.begin(), v.end());
lower_bound(v.begin(), v.end(), x); // first element >= x
upper_bound(v.begin(), v.end(), x); // first element > x

// Set operations
set_intersection(a, a+n, b, b+m, back_inserter(result));

// next_permutation for brute force
do { /* process perm */ } while (next_permutation(v.begin(), v.end()));

// __gcd, __builtin_popcount
int g = __gcd(a, b);
int bits = __builtin_popcount(mask); // count set bits
\`\`\`

**Avoid TLE:**
- Use ~ios::sync_with_stdio(false); cin.tie(nullptr);~ for fast I/O
- Prefer ~'\n'~ over ~endl~ (endl flushes buffer)
- Use ~reserve()~ on vectors to avoid reallocation`,
        visual: null,
      },
      {
        title: 'Practice Problems by Topic',
        content: `**Curated problem list to build skills systematically:**

**Arrays & Sorting** (start here)
- Two Sum, Three Sum (LeetCode 1, 15)
- Merge Intervals (LC 56)
- Kadane's Maximum Subarray (LC 53)

**Binary Search**
- Search in Rotated Sorted Array (LC 33)
- Koko Eating Bananas (LC 875) — binary search on answer
- Codeforces 460C "Present" — classic binary search on answer

**Trees & Graphs**
- LC 236: Lowest Common Ancestor of BST
- LC 207: Course Schedule (topological sort + cycle detection)
- Codeforces 277C "Game with Powers" — BFS on implicit graph

**DP**
- LC 300: Longest Increasing Subsequence — O(n log n) solution
- LC 72: Edit Distance (classic 2D DP)
- LC 312: Burst Balloons — interval DP
- AtCoder DP Educational Contest: 26 problems, all DP variants

**Greedy**
- LC 435: Non-overlapping Intervals
- LC 763: Partition Labels
- Codeforces 1B "Spreadsheet" — observation + greedy

**Goal progression:**
Codeforces rating 0→1200: solve A-B problems consistently
1200→1600: master C problems, learn DSU, binary search
1600→2000: D problems, segment trees, advanced DP
2000+: E-F problems, advanced graph algorithms, math`,
        visual: null,
      },
    ],
  },
  {
    id: 'sysdesign',
    icon: '🏗️',
    title: 'System Design: URL Shortener',
    category: 'System Design',
    difficulty: 'Advanced',
    time: '30 min',
    description: 'Design bit.ly from scratch — requirements, architecture, database design, hashing, caching, and sharding.',
    steps: [
      {
        title: 'Requirements Gathering',
        content: `Before drawing any diagrams, nail down requirements. This is the most important step.

**Functional Requirements:**
- Given a long URL, return a short URL (e.g., bit.ly/abc123)
- Given a short URL, redirect to the original URL
- Custom aliases: bit.ly/my-brand (optional)
- URL expiration: links expire after N days (optional)
- Analytics: click counts, geographic data (optional)

**Non-Functional Requirements:**
- Scale: 100M URLs created per day ≈ 1,160 writes/sec
- Reads: 10:1 read:write ratio → 11,600 reads/sec
- Availability: 99.99% uptime (4 minutes downtime/month max)
- Low latency: < 10ms for redirect (users are waiting)
- Short URL length: 6-8 characters base-62

**Back-of-envelope estimates:**
\`\`\`
URL storage: avg 500 bytes/URL × 100M/day × 365 days = ~18 TB/year
Short URL length: 62^7 = 3.5 trillion possible URLs (7 chars, base-62)
Redirect QPS: 10 × 1160 = 11,600/sec → need caching
Cache hit rate: 80/20 rule — 20% of URLs handle 80% of traffic
\`\`\`

**API Design:**
\`\`\`
POST /api/shorten   { longUrl, customAlias?, expiresIn? }
GET  /:shortCode    → 301/302 redirect to longUrl
GET  /api/stats/:shortCode → { clicks, created, lastAccessed }
\`\`\``,
        visual: null,
      },
      {
        title: 'High-Level Architecture',
        content: `A URL shortener at scale needs several components working together:

\`\`\`
┌─────────────────────────────────────────────────────┐
│                    DNS / CDN                         │
│            (GeoDNS → nearest datacenter)             │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│              Load Balancer (L7)                      │
│         Round-robin / least-connections              │
└──────┬──────────────────────────┬───────────────────┘
       │                          │
┌──────▼──────┐            ┌──────▼──────┐
│  Write API  │            │  Read API   │
│  (Shorten)  │            │  (Redirect) │
└──────┬──────┘            └──────┬──────┘
       │                          │
       │                   ┌──────▼──────┐
       │                   │    Cache    │
       │                   │  (Redis)    │
       │                   └──────┬──────┘
       │                          │ cache miss
┌──────▼──────────────────────────▼──────┐
│           Primary Database             │
│      (PostgreSQL / Cassandra)          │
│     shortCode → longUrl mapping        │
└────────────────────────────────────────┘
\`\`\`

**Key decisions:**
- **Write API** generates the short code and persists it
- **Read API** looks up the code (check cache first, then DB)
- **301 vs 302 redirect:** 301 (permanent) caches in browser — fewer hits to server but loses analytics. 302 (temporary) always hits our server — better for tracking.
- **Cache layer:** Redis in-memory store for hot URLs. LRU eviction.`,
        visual: null,
      },
      {
        title: 'Database Design & Hashing Strategy',
        content: `**Schema:**
\`\`\`sql
CREATE TABLE urls (
  short_code   CHAR(7) PRIMARY KEY,
  long_url     TEXT NOT NULL,
  user_id      INT REFERENCES users(id),
  created_at   TIMESTAMP DEFAULT NOW(),
  expires_at   TIMESTAMP,
  click_count  BIGINT DEFAULT 0
);
CREATE INDEX idx_short_code ON urls(short_code);
\`\`\`

**Hashing Strategy — how to generate short codes?**

**Option 1: MD5/SHA256 + truncate**
\`\`\`js
const hash = md5(longUrl)          // 128-bit hex
const shortCode = base62(hash).slice(0, 7)  // take first 7 chars
// Problem: collisions! Different URLs may produce same 7 chars
\`\`\`

**Option 2: Auto-increment ID + base62 encode (preferred)**
\`\`\`js
// DB auto-increments: id = 1, 2, 3, ...
// base62 encode: 1 → "1", 61 → "Z", 62 → "10", ...
function toBase62(num) {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
  let result = ''
  while (num > 0) {
    result = chars[num % 62] + result
    num = Math.floor(num / 62)
  }
  return result.padStart(7, '0')
}
\`\`\`

**Option 3: Snowflake ID (distributed)**
64-bit: timestamp (41 bits) + machine ID (10 bits) + sequence (12 bits).
No central counter — works across multiple write nodes.`,
        visual: null,
      },
      {
        title: 'Scaling: Caching, Load Balancing & Sharding',
        content: `**Caching with Redis:**
\`\`\`
Cache entry: shortCode → longUrl (TTL = 24h or expiry)
On redirect: check Redis first (1ms) → miss → check DB (10ms) → populate cache
Eviction: LRU (Least Recently Used)
Cache size: store top 20% of URLs = ~2M URLs × 500B = ~1GB RAM
\`\`\`

**Database Sharding — when single DB isn't enough:**

**Range-based sharding:** Shard 1: A-M codes, Shard 2: N-Z
- Simple but uneven if some ranges are hotter

**Hash-based sharding:** shard = hash(shortCode) % numShards
- Even distribution but resharding is painful

**Consistent hashing:** Add/remove shards with minimal data movement
- Used by Cassandra, DynamoDB

**Read replicas:** Write to primary, read from N replicas
- 10:1 read:write ratio → 9 read replicas can handle the load

**URL Expiration cleanup:**
\`\`\`sql
-- Background job, runs nightly
DELETE FROM urls WHERE expires_at < NOW();
-- Or: lazy deletion — check expiry on read, mark as deleted
\`\`\`

**Rate Limiting:**
Token bucket per IP: 100 shortens/hour for anonymous users.
Prevents spam and abuse.`,
        visual: null,
      },
    ],
  },
  {
    id: 'restapi',
    icon: '🔌',
    title: 'REST API Design with Express',
    category: 'Web Dev',
    difficulty: 'Beginner',
    time: '20 min',
    description: 'HTTP verbs, status codes, Express routing, middleware patterns, and JWT authentication from first principles.',
    steps: [
      {
        title: 'HTTP Methods & Status Codes',
        content: `REST (Representational State Transfer) uses standard HTTP methods to define operations:

**HTTP Methods (verbs):**
\`\`\`
GET    /users        → list all users          (read, safe, idempotent)
GET    /users/:id    → get one user            (read, safe, idempotent)
POST   /users        → create a new user       (write, NOT idempotent)
PUT    /users/:id    → replace entire user     (write, idempotent)
PATCH  /users/:id    → partial update          (write, idempotent)
DELETE /users/:id    → delete user             (write, idempotent)
\`\`\`

**Status Codes to memorize:**
\`\`\`
2xx Success:
  200 OK              — successful GET/PUT/PATCH
  201 Created         — successful POST (include Location header)
  204 No Content      — successful DELETE

4xx Client Error:
  400 Bad Request     — malformed request / validation error
  401 Unauthorized    — missing or invalid authentication
  403 Forbidden       — authenticated but not authorized
  404 Not Found       — resource doesn't exist
  409 Conflict        — duplicate resource (e.g., email taken)
  422 Unprocessable   — validation failed with details
  429 Too Many Reqs   — rate limit exceeded

5xx Server Error:
  500 Internal Server Error — unexpected server crash
  503 Service Unavailable   — DB is down, circuit breaker tripped
\`\`\`

**Resource naming conventions:**
- Use nouns, not verbs: ~/users~ not ~/getUsers~
- Plural nouns: ~/products~ not ~/product~
- Nested resources: ~/users/:id/orders~
- Filtering via query params: ~/products?category=books&sort=price&limit=20~`,
        visual: null,
      },
      {
        title: 'Express Routing & Middleware',
        content: `Express.js processes requests through a middleware pipeline:

\`\`\`js
const express = require('express')
const app = express()

// Global middleware — runs for EVERY request
app.use(express.json())                    // parse JSON body
app.use(express.urlencoded({ extended: true }))
app.use(cors())                            // CORS headers
app.use(morgan('dev'))                     // request logging

// Route handler
app.get('/users/:id', async (req, res) => {
  const { id } = req.params
  const user = await db.users.findById(id)
  if (!user) return res.status(404).json({ error: 'User not found' })
  res.json(user)
})

// Error handling middleware (4 args)
app.use((err, req, res, next) => {
  console.error(err.stack)
  res.status(err.status || 500).json({ error: err.message })
})
\`\`\`

**Router pattern for clean code:**
\`\`\`js
// routes/users.js
const router = express.Router()
router.get('/', listUsers)
router.get('/:id', getUser)
router.post('/', validateBody(userSchema), createUser)
router.put('/:id', auth, validateBody(userSchema), updateUser)
router.delete('/:id', auth, requireRole('admin'), deleteUser)
module.exports = router

// app.js
app.use('/api/users', require('./routes/users'))
app.use('/api/products', require('./routes/products'))
\`\`\`

**Middleware is composable** — stack multiple functions. Each calls ~next()~ to pass control to the next middleware.`,
        visual: null,
      },
      {
        title: 'JWT Authentication Flow',
        content: `JSON Web Tokens (JWT) enable stateless authentication:

**Token structure:** header.payload.signature (base64url encoded)
\`\`\`json
Header:  { "alg": "HS256", "typ": "JWT" }
Payload: { "sub": "user_123", "role": "admin", "iat": 1710000000, "exp": 1710086400 }
Signature: HMACSHA256(base64(header) + "." + base64(payload), SECRET)
\`\`\`

**Login flow:**
\`\`\`js
// POST /api/auth/login
app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body
  const user = await User.findOne({ email })
  if (!user || !await bcrypt.compare(password, user.passwordHash))
    return res.status(401).json({ error: 'Invalid credentials' })

  const accessToken = jwt.sign(
    { sub: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }          // short-lived
  )
  const refreshToken = jwt.sign(
    { sub: user.id },
    process.env.REFRESH_SECRET,
    { expiresIn: '7d' }           // long-lived, stored in httpOnly cookie
  )
  res.cookie('refreshToken', refreshToken, { httpOnly: true, secure: true })
  res.json({ accessToken })
})
\`\`\`

**Auth middleware:**
\`\`\`js
function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) return res.status(401).json({ error: 'No token' })
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET)
    next()
  } catch {
    res.status(401).json({ error: 'Invalid token' })
  }
}
\`\`\``,
        visual: null,
      },
      {
        title: 'Code Example — Full CRUD API',
        content: `A complete Express API for a "todos" resource:

\`\`\`js
const express = require('express')
const router = express.Router()

// In-memory store (replace with real DB)
let todos = [
  { id: 1, text: 'Learn REST', done: false },
  { id: 2, text: 'Build an API', done: false },
]
let nextId = 3

// GET /api/todos — list all
router.get('/', (req, res) => {
  const { done } = req.query  // ?done=true filtering
  const filtered = done !== undefined
    ? todos.filter(t => t.done === (done === 'true'))
    : todos
  res.json(filtered)
})

// GET /api/todos/:id — get one
router.get('/:id', (req, res) => {
  const todo = todos.find(t => t.id === parseInt(req.params.id))
  if (!todo) return res.status(404).json({ error: 'Not found' })
  res.json(todo)
})

// POST /api/todos — create
router.post('/', (req, res) => {
  const { text } = req.body
  if (!text?.trim()) return res.status(400).json({ error: 'text required' })
  const todo = { id: nextId++, text: text.trim(), done: false }
  todos.push(todo)
  res.status(201).json(todo)
})

// PATCH /api/todos/:id — toggle done
router.patch('/:id', (req, res) => {
  const todo = todos.find(t => t.id === parseInt(req.params.id))
  if (!todo) return res.status(404).json({ error: 'Not found' })
  Object.assign(todo, req.body)
  res.json(todo)
})

// DELETE /api/todos/:id — remove
router.delete('/:id', (req, res) => {
  const idx = todos.findIndex(t => t.id === parseInt(req.params.id))
  if (idx === -1) return res.status(404).json({ error: 'Not found' })
  todos.splice(idx, 1)
  res.status(204).send()
})

module.exports = router
\`\`\``,
        visual: null,
      },
    ],
  },
  {
    id: 'nextjs',
    icon: '▲',
    title: 'Next.js Architecture',
    category: 'Web Dev',
    difficulty: 'Intermediate',
    time: '25 min',
    description: 'SSR vs SSG vs CSR, the App Router, React Server Components, and deployment optimization strategies.',
    steps: [
      {
        title: 'SSR vs SSG vs CSR — When to Use What',
        content: `Next.js gives you three rendering strategies. Choosing the right one matters for performance, SEO, and cost.

**Client-Side Rendering (CSR)**
HTML shell → JS bundle → fetch data → render. Traditional React SPA behavior.
\`\`\`js
// CSR in Next.js — use 'use client' + useEffect
'use client'
export default function Dashboard() {
  const [data, setData] = useState(null)
  useEffect(() => { fetch('/api/data').then(r => r.json()).then(setData) }, [])
  return data ? <Chart data={data} /> : <Spinner />
}
\`\`\`
Use for: **user-specific dashboards, admin panels** — data changes per user, no need to pre-render.

**Static Site Generation (SSG)**
Build-time rendering. HTML generated once, served from CDN edge.
\`\`\`js
// Pages Router
export async function getStaticProps() {
  const posts = await fetchBlogPosts()
  return { props: { posts }, revalidate: 60 } // ISR: regenerate every 60s
}
\`\`\`
Use for: **blogs, docs, marketing pages** — content doesn't change per user.

**Server-Side Rendering (SSR)**
HTML generated on the server for each request. Fresh data, good SEO.
\`\`\`js
// App Router — async Server Component
export default async function ProductPage({ params }) {
  const product = await db.products.find(params.id)  // runs on server!
  return <ProductView product={product} />
}
\`\`\`
Use for: **e-commerce, news, personalized pages** — fresh data + SEO required.`,
        visual: null,
      },
      {
        title: 'App Router vs Pages Router',
        content: `Next.js 13+ introduced the **App Router** as the recommended approach.

**Pages Router (legacy, stable):**
\`\`\`
pages/
  index.js          → /
  about.js          → /about
  blog/[slug].js    → /blog/:slug
  api/users.js      → /api/users (API route)
\`\`\`

**App Router (modern, recommended):**
\`\`\`
app/
  page.jsx          → /
  layout.jsx        → root layout (wraps all pages)
  about/
    page.jsx        → /about
  blog/
    [slug]/
      page.jsx      → /blog/:slug
  api/
    users/
      route.js      → /api/users (Route Handler)
\`\`\`

**App Router improvements:**
- Components are **Server Components by default** (zero JS sent to client)
- **Layouts** persist across navigation (no full remount)
- **Nested layouts** — different layouts per section
- **Streaming** — send HTML progressively as it renders
- **Parallel routes** — render multiple pages simultaneously
- **Route groups** — ~(marketing)/~ organizes routes without affecting URL

\`\`\`js
// app/layout.jsx — root layout
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Navbar />   {/* persists, doesn't remount on navigation */}
        {children}
        <Footer />
      </body>
    </html>
  )
}
\`\`\``,
        visual: null,
      },
      {
        title: 'Server Components — How They Work',
        content: `**React Server Components (RSC)** are a paradigm shift: components that render only on the server and send HTML (no JS) to the client.

**The key insight:**
\`\`\`js
// THIS runs ONLY on the server — zero client JS for this component
async function UserProfile({ userId }) {
  const user = await db.users.findById(userId) // direct DB access!
  const posts = await db.posts.findByUser(userId)
  return (
    <div>
      <h1>{user.name}</h1>
      <PostList posts={posts} />
    </div>
  )
}
// No useEffect, no useState, no API route needed!
\`\`\`

**Client Components ('use client'):**
Required for: event handlers, useState/useEffect, browser APIs, third-party hooks.
\`\`\`js
'use client'
function LikeButton({ postId }) {
  const [liked, setLiked] = useState(false)
  return <button onClick={() => setLiked(true)}>{liked ? '❤️' : '🤍'}</button>
}
\`\`\`

**Composition pattern — pass server data to client components:**
\`\`\`js
// Server Component (no 'use client')
async function PostPage({ params }) {
  const post = await db.posts.find(params.id)  // server-only
  return (
    <>
      <PostContent post={post} />   {/* server component — no JS */}
      <CommentSection postId={post.id} />  {/* client — needs interactivity */}
    </>
  )
}
\`\`\`

**Benefits:** Less JavaScript shipped → faster Time-to-Interactive → better Core Web Vitals.`,
        visual: null,
      },
      {
        title: 'Deployment & Optimization',
        content: `**Deployment options:**

**Vercel (recommended for Next.js):**
\`\`\`bash
# Zero config — push to GitHub, auto-deploys
# Edge Functions for middleware
# ISR (Incremental Static Regeneration) fully supported
\`\`\`

**Docker / self-hosted:**
\`\`\`dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
COPY --from=builder /app/.next/standalone ./
EXPOSE 3000
CMD ["node", "server.js"]
\`\`\`

**Performance optimizations:**

**Image optimization:**
\`\`\`js
import Image from 'next/image'
<Image src="/hero.jpg" width={800} height={400} priority alt="Hero" />
// Automatically: WebP conversion, lazy loading, responsive srcset
\`\`\`

**Font optimization (zero layout shift):**
\`\`\`js
import { Inter } from 'next/font/google'
const inter = Inter({ subsets: ['latin'] })
// Self-hosted at build time — no FOUT, no external network request
\`\`\`

**Bundle analysis:**
\`\`\`js
// next.config.js
const withBundleAnalyzer = require('@next/bundle-analyzer')
module.exports = withBundleAnalyzer({ enabled: process.env.ANALYZE === 'true' })({})
// Run: ANALYZE=true npm run build
\`\`\`

**Core Web Vitals targets:**
- LCP (Largest Contentful Paint): < 2.5s
- FID / INP (Interaction): < 100ms
- CLS (Layout Shift): < 0.1`,
        visual: null,
      },
    ],
  },
]

function TutorialCard({ tutorial, isOpen, onToggle, onComplete, completed }) {
  const [step, setStep] = useState(0)

  const totalSteps = tutorial.steps.length
  const currentStep = tutorial.steps[step]
  const progress = ((step + 1) / totalSteps) * 100

  return (
    <div className={`rounded-2xl border transition-all duration-300 overflow-hidden ${
      isOpen
        ? 'border-purple-600/50 bg-gray-900/80 col-span-full'
        : 'border-gray-800 bg-gray-900/60 hover:border-gray-700 hover:bg-gray-900 cursor-pointer'
    }`}>
      {/* Card header — always visible */}
      <div className={`p-5 ${isOpen ? 'border-b border-gray-800' : ''}`} onClick={!isOpen ? onToggle : undefined}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <span className="text-2xl shrink-0 mt-0.5">{tutorial.icon}</span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h3 className="text-white font-bold text-base leading-snug">{tutorial.title}</h3>
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${DIFF_COLORS[tutorial.difficulty]}`}>
                  {tutorial.difficulty}
                </span>
                <span className="px-2 py-0.5 rounded-full text-xs bg-gray-800 text-gray-400 border border-gray-700">
                  {tutorial.category}
                </span>
              </div>
              <p className="text-gray-400 text-sm leading-relaxed">{tutorial.description}</p>
              <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                <span>⏱ {tutorial.time}</span>
                <span>📋 {totalSteps} steps</span>
                {completed && <span className="text-green-400 font-semibold">✓ Completed</span>}
              </div>
            </div>
          </div>
          <button
            onClick={isOpen ? onToggle : onToggle}
            className={`shrink-0 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              isOpen
                ? 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                : 'bg-purple-700 text-white hover:bg-purple-600'
            }`}
          >
            {isOpen ? '✕ Close' : 'Start Learning →'}
          </button>
        </div>
      </div>

      {/* Expanded content */}
      {isOpen && (
        <div className="p-5 md:p-6">
          {/* Progress bar */}
          <div className="mb-5">
            <div className="flex justify-between text-xs text-gray-500 mb-1.5">
              <span>Step {step + 1} of {totalSteps}</span>
              <span>{Math.round(progress)}% complete</span>
            </div>
            <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-purple-500 to-cyan-500 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Step pills */}
          <div className="flex flex-wrap gap-1.5 mb-6">
            {tutorial.steps.map((s, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                  i === step
                    ? 'bg-purple-600 text-white'
                    : i < step
                      ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      : 'bg-gray-800 text-gray-500 hover:bg-gray-700'
                }`}
              >
                {i + 1}. {s.title.slice(0, 22)}{s.title.length > 22 ? '…' : ''}
              </button>
            ))}
          </div>

          {/* Step content */}
          <div className="mb-6">
            <h4 className="text-white font-bold text-lg mb-4 flex items-center gap-2">
              <span className="text-purple-400 text-sm font-mono">Step {step + 1}</span>
              <span>{currentStep.title}</span>
            </h4>
            <StepContent step={currentStep} />
          </div>

          {/* Visual embed */}
          {currentStep.visual && VISUAL_MAP[currentStep.visual] && (
            <div className="mb-6 rounded-xl overflow-hidden border border-gray-700/60">
              <div className="px-4 py-2 bg-gray-800/60 border-b border-gray-700/40 text-xs text-gray-400 font-mono">
                Interactive Demo
              </div>
              {VISUAL_MAP[currentStep.visual]}
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between gap-3 pt-4 border-t border-gray-800">
            <button
              onClick={() => setStep(s => Math.max(0, s - 1))}
              disabled={step === 0}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-30 text-gray-300 text-sm rounded-lg font-semibold transition-colors"
            >
              ← Previous
            </button>

            {step === totalSteps - 1 ? (
              <button
                onClick={() => { onComplete(tutorial.id); setStep(0) }}
                className="px-5 py-2 bg-green-700 hover:bg-green-600 text-white text-sm rounded-lg font-semibold transition-colors"
              >
                {completed ? '✓ Completed' : 'Mark as Complete ✓'}
              </button>
            ) : (
              <button
                onClick={() => setStep(s => Math.min(totalSteps - 1, s + 1))}
                className="px-4 py-2 bg-purple-700 hover:bg-purple-600 text-white text-sm rounded-lg font-semibold transition-colors"
              >
                Next →
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function Learn() {
  const [activeCategory, setActiveCategory] = useState('All')
  const [openId, setOpenId] = useState(null)
  const [completed, setCompleted] = useState(new Set())

  const filtered = activeCategory === 'All'
    ? TUTORIALS
    : TUTORIALS.filter(t => t.category === activeCategory)

  const handleComplete = (id) => {
    setCompleted(prev => new Set([...prev, id]))
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Subtle grid bg */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.03]"
        style={{ backgroundImage: 'radial-gradient(circle, #a855f7 1px, transparent 1px)', backgroundSize: '28px 28px' }} />

      <div className="relative max-w-6xl mx-auto px-6 pt-28 pb-8">
        {/* Hero */}
        <FadeIn>
          <h1 className="font-poppins font-black text-5xl md:text-6xl bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400 bg-clip-text text-transparent leading-tight">
            Learn CS
          </h1>
          <p className="text-gray-400 mt-3 text-base max-w-xl">
            Interactive tutorials on DSA, system design &amp; competitive programming — with live visualizers you can play with.
          </p>
        </FadeIn>

        {/* Stats row */}
        <FadeIn delay={0.1}>
          <div className="flex flex-wrap gap-8 mt-6">
            {[
              [String(TUTORIALS.length), 'Tutorials', 'text-purple-400'],
              [String(TUTORIALS.reduce((a, t) => a + t.steps.length, 0)), 'Total Steps', 'text-cyan-400'],
              [String(completed.size), 'Completed', 'text-green-400'],
              ['6', 'Live Demos', 'text-pink-400'],
            ].map(([n, l, color]) => (
              <div key={l} className="text-center">
                <div className={`text-3xl font-black ${color}`}>{n}</div>
                <div className="text-xs text-gray-500 mt-0.5">{l}</div>
              </div>
            ))}
          </div>
        </FadeIn>

        {/* Category filter */}
        <FadeIn delay={0.2}>
          <div className="flex flex-wrap gap-2 mt-8 mb-8">
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => { setActiveCategory(cat); setOpenId(null) }}
                className={`px-4 py-2 rounded-full text-sm font-semibold transition-all ${
                  activeCategory === cat
                    ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/30'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
                }`}
              >
                {cat}
                {cat !== 'All' && (
                  <span className="ml-1.5 text-xs opacity-60">
                    {TUTORIALS.filter(t => t.category === cat).length}
                  </span>
                )}
              </button>
            ))}
          </div>
        </FadeIn>
      </div>

      {/* Tutorial grid */}
      <div className="max-w-6xl mx-auto px-6 pb-24">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map((tutorial, idx) => (
            <FadeIn
              key={tutorial.id}
              delay={Math.min(idx * 0.08, 0.4)}
              className={openId === tutorial.id ? 'col-span-full' : ''}
            >
              <TutorialCard
                tutorial={tutorial}
                isOpen={openId === tutorial.id}
                onToggle={() => setOpenId(prev => prev === tutorial.id ? null : tutorial.id)}
                onComplete={handleComplete}
                completed={completed.has(tutorial.id)}
              />
            </FadeIn>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-20 text-gray-600">
            No tutorials in this category yet.
          </div>
        )}
      </div>
    </div>
  )
}
