// Topological sort — Kahn's (BFS on in-degree) and DFS post-order.

export const CODE = {
  kahn: {
    pseudo: `kahn(adj, n):
  indeg[u] = number of edges into u
  queue = { u : indeg[u] == 0 }
  order = []
  while queue not empty:
    u = queue.pop_front()
    order.push(u)
    for v in adj[u]:
      indeg[v] -= 1
      if indeg[v] == 0:
        queue.push_back(v)
  if |order| < n:
    return "cycle"
  return order`,

    c: `#include <stdlib.h>

/* Returns 0 on success, -1 if the graph has a cycle. */
int kahn(int n, int* head, int* next, int* to, int m, int* order) {
    int* indeg = (int*)calloc(n, sizeof(int));
    for (int e = 0; e < m; e++) indeg[to[e]]++;
    int* q = (int*)malloc(n * sizeof(int));
    int qh = 0, qt = 0, k = 0;
    for (int u = 0; u < n; u++) if (indeg[u] == 0) q[qt++] = u;
    while (qh < qt) {
        int u = q[qh++]; order[k++] = u;
        for (int e = head[u]; e != -1; e = next[e]) {
            if (--indeg[to[e]] == 0) q[qt++] = to[e];
        }
    }
    free(indeg); free(q);
    return k == n ? 0 : -1;    /* leftover in-degrees ⇒ cycle */
}`,

    cpp: `#include <vector>
#include <queue>

std::vector<int> kahn(const std::vector<std::vector<int>>& adj) {
    int n = (int)adj.size();
    std::vector<int> indeg(n, 0);
    for (int u = 0; u < n; ++u)
        for (int v : adj[u]) indeg[v]++;
    std::queue<int> q;
    for (int u = 0; u < n; ++u) if (indeg[u] == 0) q.push(u);
    std::vector<int> order; order.reserve(n);
    while (!q.empty()) {
        int u = q.front(); q.pop();
        order.push_back(u);
        for (int v : adj[u])
            if (--indeg[v] == 0) q.push(v);
    }
    if ((int)order.size() < n) return {};   // cycle
    return order;
}`,

    python: `from collections import deque

def kahn(adj):
    """Returns topo order, or None if the graph has a cycle."""
    n = len(adj)
    indeg = [0] * n
    for u in range(n):
        for v in adj[u]:
            indeg[v] += 1
    q = deque(u for u in range(n) if indeg[u] == 0)
    order = []
    while q:
        u = q.popleft()
        order.append(u)
        for v in adj[u]:
            indeg[v] -= 1
            if indeg[v] == 0:
                q.append(v)
    # If we didn't emit every node, some in-degrees never hit zero → cycle.
    return order if len(order) == n else None`,

    java: `import java.util.*;

public static List<Integer> kahn(List<List<Integer>> adj) {
    int n = adj.size();
    int[] indeg = new int[n];
    for (int u = 0; u < n; u++) for (int v : adj.get(u)) indeg[v]++;
    Deque<Integer> q = new ArrayDeque<>();
    for (int u = 0; u < n; u++) if (indeg[u] == 0) q.add(u);
    List<Integer> order = new ArrayList<>();
    while (!q.isEmpty()) {
        int u = q.pollFirst();
        order.add(u);
        for (int v : adj.get(u))
            if (--indeg[v] == 0) q.addLast(v);
    }
    return order.size() == n ? order : null;   // null = cycle detected
}`,

    rust: `use std::collections::VecDeque;

pub fn kahn(adj: &Vec<Vec<usize>>) -> Option<Vec<usize>> {
    let n = adj.len();
    let mut indeg = vec![0usize; n];
    for u in 0..n { for &v in &adj[u] { indeg[v] += 1; } }
    let mut q: VecDeque<usize> = (0..n).filter(|&u| indeg[u] == 0).collect();
    let mut order = Vec::with_capacity(n);
    while let Some(u) = q.pop_front() {
        order.push(u);
        for &v in &adj[u] {
            indeg[v] -= 1;
            if indeg[v] == 0 { q.push_back(v); }
        }
    }
    // Anything left with positive in-degree lives on a cycle.
    if order.len() == n { Some(order) } else { None }
}`,
  },

  dfs: {
    pseudo: `dfs_toposort(adj, n):
  color = [WHITE, WHITE, ..]
  order = []
  for u in 0..n:
    if color[u] == WHITE:
      if not visit(u):
        return "cycle"
  reverse order
  return order

visit(u):
  color[u] = GRAY
  for v in adj[u]:
    if color[v] == GRAY: return false      # back-edge
    if color[v] == WHITE and not visit(v): return false
  color[u] = BLACK
  order.push(u)
  return true`,

    c: `#include <stdlib.h>

enum { WHITE = 0, GRAY = 1, BLACK = 2 };

/* Returns 0 on success (order reversed to topo), 1 on cycle. */
static int visit(int u, int* head, int* next, int* to, int* color, int* order, int* k) {
    color[u] = GRAY;
    for (int e = head[u]; e != -1; e = next[e]) {
        int v = to[e];
        if (color[v] == GRAY) return 1;            /* back-edge = cycle */
        if (color[v] == WHITE && visit(v, head, next, to, color, order, k)) return 1;
    }
    color[u] = BLACK;
    order[(*k)++] = u;
    return 0;
}

int dfs_toposort(int n, int* head, int* next, int* to, int* order) {
    int* color = (int*)calloc(n, sizeof(int));
    int k = 0;
    for (int u = 0; u < n; u++) {
        if (color[u] == WHITE && visit(u, head, next, to, color, order, &k)) {
            free(color); return 1;
        }
    }
    free(color);
    /* order is post-order; caller reverses to get topological order. */
    for (int i = 0, j = k - 1; i < j; i++, j--) {
        int t = order[i]; order[i] = order[j]; order[j] = t;
    }
    return 0;
}`,

    cpp: `#include <vector>
#include <algorithm>

enum { WHITE = 0, GRAY = 1, BLACK = 2 };

bool visit(int u, const std::vector<std::vector<int>>& adj,
           std::vector<int>& color, std::vector<int>& order) {
    color[u] = GRAY;
    for (int v : adj[u]) {
        if (color[v] == GRAY) return false;            // back-edge → cycle
        if (color[v] == WHITE && !visit(v, adj, color, order)) return false;
    }
    color[u] = BLACK;
    order.push_back(u);
    return true;
}

std::vector<int> dfs_toposort(const std::vector<std::vector<int>>& adj) {
    int n = (int)adj.size();
    std::vector<int> color(n, WHITE), order;
    for (int u = 0; u < n; ++u)
        if (color[u] == WHITE && !visit(u, adj, color, order))
            return {};                                 // cycle
    std::reverse(order.begin(), order.end());
    return order;
}`,

    python: `def dfs_toposort(adj):
    """Iterative DFS-based topological sort. Returns None on cycle."""
    n = len(adj)
    WHITE, GRAY, BLACK = 0, 1, 2
    color = [WHITE] * n
    order = []
    for start in range(n):
        if color[start] != WHITE:
            continue
        # Emulate the recursive post-order visit with an explicit stack.
        stack = [(start, iter(adj[start]))]
        color[start] = GRAY
        while stack:
            u, it = stack[-1]
            try:
                v = next(it)
                if color[v] == GRAY:
                    return None            # back-edge = cycle
                if color[v] == WHITE:
                    color[v] = GRAY
                    stack.append((v, iter(adj[v])))
            except StopIteration:
                color[u] = BLACK
                order.append(u)
                stack.pop()
    order.reverse()
    return order`,

    java: `import java.util.*;

public static List<Integer> dfsToposort(List<List<Integer>> adj) {
    int n = adj.size();
    int[] color = new int[n];          // 0 = white, 1 = gray, 2 = black
    List<Integer> order = new ArrayList<>();
    for (int u = 0; u < n; u++) {
        if (color[u] == 0 && !visit(u, adj, color, order)) return null;
    }
    Collections.reverse(order);
    return order;
}

private static boolean visit(int u, List<List<Integer>> adj, int[] color, List<Integer> order) {
    color[u] = 1;
    for (int v : adj.get(u)) {
        if (color[v] == 1) return false;                       // back-edge → cycle
        if (color[v] == 0 && !visit(v, adj, color, order)) return false;
    }
    color[u] = 2;
    order.add(u);
    return true;
}`,

    rust: `pub fn dfs_toposort(adj: &Vec<Vec<usize>>) -> Option<Vec<usize>> {
    // 0 = white, 1 = gray (on stack), 2 = black (finished).
    let n = adj.len();
    let mut color = vec![0u8; n];
    let mut order: Vec<usize> = Vec::with_capacity(n);
    fn visit(u: usize, adj: &Vec<Vec<usize>>, color: &mut [u8], order: &mut Vec<usize>) -> bool {
        color[u] = 1;
        for &v in &adj[u] {
            if color[v] == 1 { return false; }         // back-edge = cycle
            if color[v] == 0 && !visit(v, adj, color, order) { return false; }
        }
        color[u] = 2;
        order.push(u);
        true
    }
    for u in 0..n {
        if color[u] == 0 && !visit(u, adj, &mut color, &mut order) {
            return None;
        }
    }
    order.reverse();
    Some(order)
}`,
  },
}
