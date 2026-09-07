// Dijkstra (PQ) and Bellman-Ford (V-1 relaxations + negative cycle detection).
// Both algorithms in six languages each.

export const CODE = {
  dijkstra: {
    pseudo: `dijkstra(adj, src):
  dist = [INF, INF, ..]
  dist[src] = 0
  pq = min-heap of (dist, node)
  push (0, src)
  while pq not empty:
    (d, u) = pq.pop()
    if d > dist[u]: continue   # stale
    for (v, w) in adj[u]:
      if d + w < dist[v]:
        dist[v] = d + w
        push (dist[v], v)
  return dist`,

    c: `#include <stdlib.h>
#include <string.h>
#include <limits.h>

/* Min-heap of (dist, node). Kept small — enough for a self-contained example. */
typedef struct { long d; int u; } Node;
static Node heap[1 << 20];
static int hsize;

static void hpush(long d, int u) {
    heap[hsize++] = (Node){d, u};
    int i = hsize - 1;
    while (i > 0) {
        int p = (i - 1) / 2;
        if (heap[p].d <= heap[i].d) break;
        Node t = heap[p]; heap[p] = heap[i]; heap[i] = t; i = p;
    }
}
static Node hpop(void) {
    Node top = heap[0];
    heap[0] = heap[--hsize];
    int i = 0;
    while (1) {
        int l = 2*i+1, r = 2*i+2, s = i;
        if (l < hsize && heap[l].d < heap[s].d) s = l;
        if (r < hsize && heap[r].d < heap[s].d) s = r;
        if (s == i) break;
        Node t = heap[s]; heap[s] = heap[i]; heap[i] = t; i = s;
    }
    return top;
}

/* adj[u] = list of (v, w); head/next arrays for adjacency lists. */
void dijkstra(int n, int src, int* head, int* next, int* to, int* w, long* dist) {
    for (int i = 0; i < n; i++) dist[i] = LONG_MAX;
    dist[src] = 0; hsize = 0; hpush(0, src);
    while (hsize) {
        Node cur = hpop();
        if (cur.d > dist[cur.u]) continue; /* stale entry */
        for (int e = head[cur.u]; e != -1; e = next[e]) {
            long nd = cur.d + w[e];
            if (nd < dist[to[e]]) {
                dist[to[e]] = nd;
                hpush(nd, to[e]);
            }
        }
    }
}`,

    cpp: `#include <vector>
#include <queue>
#include <climits>

using Edge = std::pair<int, long long>;   // (to, weight)

std::vector<long long> dijkstra(
    const std::vector<std::vector<Edge>>& adj, int src)
{
    const long long INF = LLONG_MAX;
    std::vector<long long> dist(adj.size(), INF);
    dist[src] = 0;
    // Min-heap of (dist, node) via std::greater.
    std::priority_queue<std::pair<long long, int>,
                        std::vector<std::pair<long long, int>>,
                        std::greater<>> pq;
    pq.push({0, src});
    while (!pq.empty()) {
        auto [d, u] = pq.top(); pq.pop();
        if (d > dist[u]) continue;           // stale
        for (auto [v, w] : adj[u]) {
            if (d + w < dist[v]) {
                dist[v] = d + w;
                pq.push({dist[v], v});
            }
        }
    }
    return dist;
}`,

    python: `import heapq
from math import inf

def dijkstra(adj, src):
    # adj[u] = list of (v, w)
    dist = [inf] * len(adj)
    dist[src] = 0
    pq = [(0, src)]           # min-heap of (dist, node)
    while pq:
        d, u = heapq.heappop(pq)
        if d > dist[u]:
            continue           # stale entry — a better one was already popped
        for v, w in adj[u]:
            nd = d + w
            if nd < dist[v]:
                dist[v] = nd
                heapq.heappush(pq, (nd, v))
    return dist`,

    java: `import java.util.*;

public static long[] dijkstra(List<int[]>[] adj, int src) {
    long[] dist = new long[adj.length];
    Arrays.fill(dist, Long.MAX_VALUE);
    dist[src] = 0;
    // (dist, node) min-heap
    PriorityQueue<long[]> pq = new PriorityQueue<>((a, b) -> Long.compare(a[0], b[0]));
    pq.add(new long[]{0, src});
    while (!pq.isEmpty()) {
        long[] cur = pq.poll();
        long d = cur[0]; int u = (int) cur[1];
        if (d > dist[u]) continue;             // stale
        for (int[] e : adj[u]) {
            int v = e[0], w = e[1];
            long nd = d + w;
            if (nd < dist[v]) {
                dist[v] = nd;
                pq.add(new long[]{nd, v});
            }
        }
    }
    return dist;
}`,

    rust: `use std::collections::BinaryHeap;
use std::cmp::Reverse;

pub fn dijkstra(n: usize, adj: &Vec<Vec<(usize, u32)>>, src: usize) -> Vec<u32> {
    let mut dist = vec![u32::MAX; n];
    dist[src] = 0;
    // (distance, node) — Reverse turns max-heap into min-heap.
    let mut pq: BinaryHeap<Reverse<(u32, usize)>> = BinaryHeap::new();
    pq.push(Reverse((0, src)));
    while let Some(Reverse((d, u))) = pq.pop() {
        if d > dist[u] { continue; } // stale entry
        for &(v, w) in &adj[u] {
            let nd = d.saturating_add(w);
            if nd < dist[v] {
                dist[v] = nd;
                pq.push(Reverse((nd, v)));
            }
        }
    }
    dist
}`,
  },

  bellman: {
    pseudo: `bellman_ford(edges, n, src):
  dist = [INF, INF, ..]
  dist[src] = 0
  for i = 1 .. n-1:
    for (u, v, w) in edges:
      if dist[u] + w < dist[v]:
        dist[v] = dist[u] + w
  # one more pass: any relax => negative cycle
  for (u, v, w) in edges:
    if dist[u] + w < dist[v]:
      return "negative cycle"
  return dist`,

    c: `#include <stdlib.h>
#include <limits.h>

typedef struct { int u, v; long w; } Edge;

/* Returns 0 on success, 1 if a negative-weight cycle is reachable. */
int bellman_ford(int n, Edge* edges, int m, int src, long* dist) {
    for (int i = 0; i < n; i++) dist[i] = LONG_MAX;
    dist[src] = 0;
    for (int i = 1; i < n; i++) {          /* V-1 rounds */
        for (int j = 0; j < m; j++) {
            Edge e = edges[j];
            if (dist[e.u] == LONG_MAX) continue;
            if (dist[e.u] + e.w < dist[e.v])
                dist[e.v] = dist[e.u] + e.w;
        }
    }
    for (int j = 0; j < m; j++) {          /* one extra pass detects cycle */
        Edge e = edges[j];
        if (dist[e.u] != LONG_MAX && dist[e.u] + e.w < dist[e.v]) return 1;
    }
    return 0;
}`,

    cpp: `#include <vector>
#include <climits>

struct Edge { int u, v; long long w; };

// Returns pair<bool, dists>: bool = "no negative cycle reachable".
std::pair<bool, std::vector<long long>>
bellman_ford(int n, const std::vector<Edge>& edges, int src) {
    const long long INF = LLONG_MAX;
    std::vector<long long> dist(n, INF);
    dist[src] = 0;
    for (int i = 1; i < n; ++i) {                // V-1 relaxation rounds
        for (const auto& e : edges) {
            if (dist[e.u] == INF) continue;
            if (dist[e.u] + e.w < dist[e.v])
                dist[e.v] = dist[e.u] + e.w;
        }
    }
    for (const auto& e : edges) {                // Vth pass — cycle check
        if (dist[e.u] != INF && dist[e.u] + e.w < dist[e.v])
            return {false, dist};
    }
    return {true, dist};
}`,

    python: `from math import inf

def bellman_ford(n, edges, src):
    """edges = list of (u, v, w). Returns dist list or None on negative cycle."""
    dist = [inf] * n
    dist[src] = 0
    for _ in range(n - 1):
        # V-1 rounds is enough for shortest paths in a DAG or non-cyclic graph.
        for u, v, w in edges:
            if dist[u] + w < dist[v]:
                dist[v] = dist[u] + w
    # One more pass — if anything still relaxes, a negative cycle is reachable.
    for u, v, w in edges:
        if dist[u] + w < dist[v]:
            return None
    return dist`,

    java: `import java.util.*;

public static long[] bellmanFord(int n, int[][] edges, int src) {
    long[] dist = new long[n];
    Arrays.fill(dist, Long.MAX_VALUE);
    dist[src] = 0;
    for (int i = 1; i < n; i++) {                // V-1 rounds
        for (int[] e : edges) {
            int u = e[0], v = e[1]; long w = e[2];
            if (dist[u] == Long.MAX_VALUE) continue;
            if (dist[u] + w < dist[v]) dist[v] = dist[u] + w;
        }
    }
    for (int[] e : edges) {                       // Vth pass = cycle detect
        int u = e[0], v = e[1]; long w = e[2];
        if (dist[u] != Long.MAX_VALUE && dist[u] + w < dist[v]) {
            return null;                          // negative cycle reachable
        }
    }
    return dist;
}`,

    rust: `pub fn bellman_ford(n: usize, edges: &[(usize, usize, i64)], src: usize)
    -> Option<Vec<i64>>
{
    let inf = i64::MAX / 4;
    let mut dist = vec![inf; n];
    dist[src] = 0;
    // V-1 relaxation rounds guarantee shortest paths if no negative cycle.
    for _ in 0..n.saturating_sub(1) {
        for &(u, v, w) in edges {
            if dist[u] < inf && dist[u] + w < dist[v] {
                dist[v] = dist[u] + w;
            }
        }
    }
    // Extra pass: any remaining relaxation exposes a reachable negative cycle.
    for &(u, v, w) in edges {
        if dist[u] < inf && dist[u] + w < dist[v] {
            return None;
        }
    }
    Some(dist)
}`,
  },
}
